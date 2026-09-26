// Supabase Edge Function: parental-consent
//
// GDPR Article 8(2) asks for reasonable efforts to verify that a child's
// account was authorised by a holder of parental responsibility. A checkbox
// the child ticks themselves verifies nothing, so this emails the parent and
// waits for them to confirm. Until they do, `public.consent_ok()` returns false
// for that account and every write policy in schema.sql refuses it.
//
// Entry points:
//
//   POST { action: "request", parentEmail }   - called by the app or the site
//                                               right after a 13-15 year old
//                                               signs up. Needs the child's
//                                               JWT in the Authorization
//                                               header.
//   POST { action: "confirm", token }         - the button on the site's
//                                               consent.html, pressed by the
//                                               parent. Needs no account: the
//                                               token from the email is the
//                                               proof.
//   GET  ?token=<token>                        - links in emails sent before
//                                               consent.html existed. Only
//                                               forwards to that page.
//
// Opening the link must not confirm anything on its own. It used to: the GET
// handler flipped the account the moment the URL was fetched, and mail
// scanners, antivirus and link previews fetch links without anybody clicking -
// so an account could be "authorised" by a machine. Supabase also serves HTML
// from its own domain as text/plain, so the parent who did click saw a page of
// raw markup. The link now opens a page on the site, which can render, links
// the terms and the privacy policy the email promises, and confirms only when
// the button is pressed.
//
// Why an Edge Function at all: it needs the service_role key, to write
// `parental_consents` (which no client can touch) and to flip
// `account_ages.consent_state`. An APK can be unzipped, so that key can never
// ship in a client.
//
// Deploy with: supabase functions deploy parental-consent --no-verify-jwt
//
// The --no-verify-jwt matters: the parent confirming has no account here, so
// that path cannot require a JWT. The request path checks the caller's JWT
// itself, below.
//
// Secrets to set before this works (supabase secrets set NAME=value):
//   RESEND_API_KEY      - an API key from https://resend.com
//   CONSENT_FROM_EMAIL  - the verified sender, e.g. "Showcase <no-reply@yourdomain>"
//   PUBLIC_SITE_URL     - where the site lives, e.g. https://psekiewicz.github.io -
//                         the email links to consent.html there

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM_EMAIL = Deno.env.get('CONSENT_FROM_EMAIL') ?? '';
const SITE_URL = (Deno.env.get('PUBLIC_SITE_URL') ?? '').replace(/\/$/, '');

// How often one account may have an email sent. The request path sends mail
// to an address the child types in, so without a limit it is a way to flood
// somebody's inbox from this project's sender.
const RESEND_AFTER_MS = 10 * 60 * 1000;
const SENDS_PER_DAY = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Stored as a hash, so this table leaking is not a set of working links. */
async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function sendParentEmail(to: string, childName: string, link: string) {
  if (!RESEND_API_KEY || !FROM_EMAIL) {
    throw new Error('Email is not configured on the server (RESEND_API_KEY / CONSENT_FROM_EMAIL).');
  }
  const text = [
    `${childName} has created an account on Showcase and gave this address as a parent or guardian.`,
    '',
    'Showcase is a place to publish things you have made - music, video, images, apps - and to see',
    'what other people have made. Accounts held by 13 to 15 year olds need a parent or guardian to',
    'agree before they can publish anything, leave a comment, or follow anyone.',
    '',
    'Please read the terms and the privacy policy first. Both are linked from the page this opens:',
    '',
    link,
    '',
    'Opening the link does not confirm anything by itself - there is a button on that page. Until it',
    'is pressed, the account can only look around - it cannot post.',
    '',
    'If you were not expecting this, you can ignore this email and nothing will happen. The link',
    'stops working after 14 days.',
  ].join('\n');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject: `Please confirm ${childName}'s Showcase account`,
      text,
    }),
  });
  if (!res.ok) {
    throw new Error(`The email could not be sent (${res.status}).`);
  }
}

/**
 * The parent pressed the button. Every expected outcome is a 200 with a
 * status the page words for itself; only a real failure is an error.
 */
async function confirm(token: string) {
  if (!/^[0-9a-f]{64}$/.test(token)) return json({ status: 'invalid' });

  const { data: row, error } = await admin
    .from('parental_consents')
    .select('user_id, expires_at, confirmed_at')
    .eq('token_hash', await sha256(token))
    .maybeSingle();
  if (error) return json({ error: 'Something went wrong. Please try again shortly.' }, 500);

  if (!row) return json({ status: 'invalid' });
  if (row.confirmed_at) return json({ status: 'already' });
  if (new Date(row.expires_at).getTime() < Date.now()) return json({ status: 'expired' });

  // Only a pending account changes; one that has turned 16 in the meantime
  // has nothing left to confirm.
  const { error: updateError } = await admin
    .from('account_ages')
    .update({ consent_state: 'granted' })
    .eq('user_id', row.user_id)
    .eq('consent_state', 'pending');
  if (updateError) return json({ error: 'Something went wrong. Please try again shortly.' }, 500);

  await admin
    .from('parental_consents')
    .update({ confirmed_at: new Date().toISOString() })
    .eq('user_id', row.user_id);

  return json({ status: 'confirmed' });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // ---- A link from an email sent before consent.html existed -------------
  if (req.method === 'GET') {
    const token = new URL(req.url).searchParams.get('token') ?? '';
    if (!SITE_URL) {
      return new Response('This link opens a page on the Showcase website, which is not configured yet.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
    return Response.redirect(`${SITE_URL}/consent.html?token=${encodeURIComponent(token)}`, 302);
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body: { action?: string; parentEmail?: string; token?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Expected a JSON body' }, 400);
  }

  // ---- The parent confirming ---------------------------------------------
  if (body.action === 'confirm') return confirm(String(body.token ?? ''));

  if (body.action !== 'request') return json({ error: 'Unknown action' }, 400);

  // ---- The child asking for the email to go out -------------------------
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'Missing Authorization header' }, 401);

  const { data: userData, error: userError } = await admin.auth.getUser(jwt);
  if (userError || !userData?.user) return json({ error: 'Not signed in' }, 401);
  const user = userData.user;

  if (!SITE_URL) {
    return json({ error: 'Email is not configured on the server (PUBLIC_SITE_URL).' }, 503);
  }

  const parentEmail = (body.parentEmail ?? '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail)) {
    return json({ error: 'That does not look like an email address.' }, 400);
  }
  // A child emailing themselves would defeat the entire point.
  if (parentEmail.toLowerCase() === (user.email ?? '').toLowerCase()) {
    return json({ error: 'That is your own address. Use a parent or guardian’s.' }, 400);
  }

  // Only an account that actually needs one, so this cannot be used as an
  // open relay by any signed-in user.
  const { data: age } = await admin
    .from('account_ages')
    .select('consent_state')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!age || age.consent_state !== 'pending') {
    return json({ error: 'This account does not need a parent to confirm it.' }, 400);
  }

  // One email every ten minutes, and a few a day. Anyone can make a pending
  // account by giving a date of birth, so "only pending accounts" alone did not
  // stop this from mailing a stranger over and over.
  const { data: previous } = await admin
    .from('parental_consents')
    .select('created_at, sends, sends_since')
    .eq('user_id', user.id)
    .maybeSingle();
  const now = Date.now();
  if (previous && now - new Date(previous.created_at).getTime() < RESEND_AFTER_MS) {
    return json(
      { error: 'An email went out a few minutes ago. Give it ten minutes - and check the spam folder - before sending another.' },
      429
    );
  }
  const sameDay = Boolean(previous && now - new Date(previous.sends_since).getTime() < DAY_MS);
  const sendsToday = sameDay ? previous!.sends : 0;
  if (sendsToday >= SENDS_PER_DAY) {
    return json({ error: 'Three emails have gone out today already. Try again tomorrow.' }, 429);
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle();
  const childName = profile?.display_name || 'Someone';

  const token = newToken();
  const tokenHash = await sha256(token);

  // Re-requesting replaces the previous link rather than leaving two live.
  const { error: upsertError } = await admin.from('parental_consents').upsert(
    {
      user_id: user.id,
      parent_email: parentEmail,
      token_hash: tokenHash,
      created_at: new Date(now).toISOString(),
      expires_at: new Date(now + 14 * DAY_MS).toISOString(),
      confirmed_at: null,
      sends: sendsToday + 1,
      sends_since: sameDay ? previous!.sends_since : new Date(now).toISOString(),
    },
    { onConflict: 'user_id' }
  );
  if (upsertError) return json({ error: 'Could not start the confirmation.' }, 500);

  const link = `${SITE_URL}/consent.html?token=${token}`;
  try {
    await sendParentEmail(parentEmail, childName, link);
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }

  return json({ ok: true });
});
