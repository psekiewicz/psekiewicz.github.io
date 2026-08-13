// Supabase Edge Function: admin-actions
//
// Handles the three things that genuinely require the service_role key
// (Supabase's Admin API) and therefore can never run in the browser:
// banning a user, unbanning them, and deleting an account. Supabase
// auto-injects SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY into every
// deployed Edge Function's environment — nothing to set manually, and
// the key never appears in git. This function does its own authorization
// check before touching anything.
//
// Deploy with: supabase functions deploy admin-actions
// See README.md ("Real bans and account deletion") for full setup steps.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization') || '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'Missing Authorization header' }, 401);

  // A client bound to the service role — this is the only place in the
  // whole app that key is ever used, and it never leaves this function.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const {
    data: { user: caller },
    error: callerErr,
  } = await admin.auth.getUser(jwt);
  if (callerErr || !caller) return json({ error: 'Invalid session' }, 401);

  let body: { action?: string; targetUserId?: string; durationHours?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { action, targetUserId, durationHours } = body;
  if (!action || !targetUserId) {
    return json({ error: 'action and targetUserId are required' }, 400);
  }

  // Anyone may delete their own account. Everything else — banning,
  // unbanning, or deleting someone else's account — requires the caller
  // to be an admin.
  const isSelfDelete = action === 'delete' && targetUserId === caller.id;

  if (!isSelfDelete) {
    const { data: callerProfile, error: profileErr } = await admin
      .from('profiles')
      .select('is_admin')
      .eq('id', caller.id)
      .maybeSingle();
    if (profileErr || !callerProfile?.is_admin) {
      return json({ error: 'Admin access required' }, 403);
    }
  }

  try {
    if (action === 'ban') {
      const hours = Number(durationHours);
      if (!hours || hours <= 0) {
        return json({ error: 'durationHours must be a positive number' }, 400);
      }
      const { error } = await admin.auth.admin.updateUserById(targetUserId, { ban_duration: `${hours}h` });
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === 'unban') {
      const { error } = await admin.auth.admin.updateUserById(targetUserId, { ban_duration: 'none' });
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === 'delete') {
      // profiles/projects/follows rows for this user are removed
      // automatically — their foreign keys reference auth.users with
      // ON DELETE CASCADE.
      const { error } = await admin.auth.admin.deleteUser(targetUserId);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: `Unknown action "${action}"` }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500);
  }
});
