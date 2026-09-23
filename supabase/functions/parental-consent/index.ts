// Supabase Edge Function: parental-consent
//
// GDPR Article 8(2) asks for reasonable efforts to verify that a child's
// account was authorised by a holder of parental responsibility. A checkbox
// the child ticks themselves verifies nothing, so this emails the parent and
// waits for them to click. Until they do, `public.consent_ok()` returns false
// for that account and every write policy in schema.sql refuses it.
//
// Two entry points:
//
//   POST { action: "request", parentEmail }   - called by the app or the site
//                                               right after a 13-15 year old
//                                               signs up. Needs the child's
//                                               JWT in the Authorization
//                                               header.
//   GET  ?token=<token>                        - the link in the parent's
//                                               email. Returns a small HTML
//                                               page, because a parent clicks
//                                               it in a mail client.
//
// Why an Edge Function at all: it needs the service_role key, to write
// `parental_consents` (which no client can touch) and to flip
// `account_ages.consent_state`. An APK can be unzipped, so that key can never
// ship in a client.
//
// Deploy with: supabase functions deploy parental-consent --no-verify-jwt
//
// The --no-verify-jwt matters: the confirmation link is opened by a parent who
// has no account here, so that path cannot require a JWT. The request path
// checks the caller's JWT itself, below.
//
// Secrets to set before this works (supabase secrets set NAME=value):
//   RESEND_API_KEY      - an API key from https://resend.com
//   CONSENT_FROM_EMAIL  - the verified sender, e.g. "Showcase <no-reply@yourdomain>"
//   PUBLIC_SITE_URL     - where the site lives, used to build the link back

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM_EMAIL = Deno.env.get('CONSENT_FROM_EMAIL') ?? '';
const SITE_URL = (Deno.env.get('PUBLIC_SITE_URL') ?? '').replace(/\/$/, '');

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

/** A plain page, because the reader is a parent in a mail client. */
function page(title: string, message: string, status = 200) {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} - Showcase</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: ui-monospace, "JetBrains Mono", "SFMono-Regular", Menlo, monospace;
         background: #fdf7ea; color: #201e1d; margin: 0;
         display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }
  main { max-width: 34rem; }
  h1 { font-size: 1.5rem; margin: 0 0 12px; }
  p { line-height: 1.6; color: #5b534b; margin: 0 0 12px; }
  a { color: #c67139; }
  @media (prefers-color-scheme: dark) {
    body { background: #201e1d; color: #fdf7ea; } p { color: #b9a887; }
  }
</style></head>
<body><main><h1>${title}</h1><p>${message}</p>
${SITE_URL ? `<p><a href="${SITE_URL}">Go to Showcase</a></p>` : ''}
</main></body></html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
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
    'Until you open that link the account can only look around - it cannot post.',
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // ---- The parent's link ------------------------------------------------
  if (req.method === 'GET') {
    const token = new URL(req.url).searchParams.get('token') ?? '';
    if (!token) return page('Something is missing', 'That link is incomplete.', 400);

    const hash = await sha256(token);
    const { data: row } = await admin
      .from('parental_consents')
      .select('user_id, expires_at, confirmed_at')
      .eq('token_hash', hash)
      .maybeSingle();

    if (!row) {
      return page('That link did not work', 'It may have been used already, or typed incorrectly.', 404);
    }
    if (row.confirmed_at) {
      return page('Already confirmed', 'This account was confirmed earlier. Nothing more to do.');
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return page(
        'That link has expired',
        'Confirmation links last 14 days. Ask them to send a new one from the app.',
        410
      );
    }

    const { error: updateError } = await admin
      .from('account_ages')
      .update({ consent_state: 'granted' })
      .eq('user_id', row.user_id);
    if (updateError) return page('Something went wrong', 'Please try the link again shortly.', 500);

    await admin
      .from('parental_consents')
      .update({ confirmed_at: new Date().toISOString() })
      .eq('user_id', row.user_id);

    return page(
      'Thank you - that is confirmed',
      'The account can now publish, comment and follow. You can close this page.'
    );
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // ---- The child asking for the email to go out -------------------------
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'Missing Authorization header' }, 401);

  const { data: userData, error: userError } = await admin.auth.getUser(jwt);
  if (userError || !userData?.user) return json({ error: 'Not signed in' }, 401);
  const user = userData.user;

  let body: { action?: string; parentEmail?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Expected a JSON body' }, 400);
  }
  if (body.action !== 'request') return json({ error: 'Unknown action' }, 400);

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
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      confirmed_at: null,
    },
    { onConflict: 'user_id' }
  );
  if (upsertError) return json({ error: 'Could not start the confirmation.' }, 500);

  const link = `${SUPABASE_URL}/functions/v1/parental-consent?token=${token}`;
  try {
    await sendParentEmail(parentEmail, childName, link);
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }

  return json({ ok: true });
});
