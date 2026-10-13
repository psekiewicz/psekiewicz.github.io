// Supabase Edge Function: announcement-cleanup
//
// Deletes the files attached to announcements once the announcement is over -
// withdrawn, replaced by a newer one, or past its end time - and sweeps up
// uploads that never made it into an announcement (an upload that was followed
// by a failed publish). Files are removed through the Storage API, not by
// deleting rows from storage.objects, because the latter leaves the bytes
// behind.
//
// It takes no input and only ever removes files that nothing live refers to,
// so it is safe for anyone to call: it is deployed without JWT verification so
// the schedule (pg_cron, see schema.sql) can reach it without holding a key.
//
// Deploy with: supabase functions deploy announcement-cleanup --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BUCKET = 'announcements';
// An upload gets this long to be attached to a published announcement before it
// counts as abandoned.
const ORPHAN_GRACE_MS = 60 * 60 * 1000;

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

type Attachment = { path?: string };

async function removeAll(admin: ReturnType<typeof createClient>, paths: string[]) {
  let removed = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100);
    const { error } = await admin.storage.from(BUCKET).remove(chunk);
    if (error) throw new Error(error.message);
    removed += chunk.length;
  }
  return removed;
}

// Every file in the bucket: files live one folder deep (<admin id>/<name>).
async function listFiles(admin: ReturnType<typeof createClient>) {
  const files: { path: string; createdAt: number }[] = [];
  const { data: top, error } = await admin.storage.from(BUCKET).list('', { limit: 1000 });
  if (error) throw new Error(error.message);
  for (const entry of top || []) {
    if (entry.id) {
      files.push({ path: entry.name, createdAt: Date.parse(entry.created_at) });
      continue;
    }
    const { data: inner, error: innerError } = await admin.storage
      .from(BUCKET)
      .list(entry.name, { limit: 1000 });
    if (innerError) throw new Error(innerError.message);
    for (const f of inner || []) {
      if (f.id) files.push({ path: `${entry.name}/${f.name}`, createdAt: Date.parse(f.created_at) });
    }
  }
  return files;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    // 1. Announcements that are over, with files still attached.
    const { data: overRows, error: overError } = await admin
      .from('announcements')
      .select('id, attachments')
      .or(`active.eq.false,expires_at.lte.${new Date().toISOString()}`);
    if (overError) throw new Error(overError.message);
    const over = (overRows || []).filter((r) => ((r.attachments || []) as Attachment[]).length > 0);

    const overPaths = (over || []).flatMap((row) =>
      ((row.attachments || []) as Attachment[]).map((a) => a.path).filter((p): p is string => !!p)
    );
    const removedOver = await removeAll(admin, overPaths);
    if (over && over.length) {
      const { error } = await admin
        .from('announcements')
        .update({ attachments: [] })
        .in('id', over.map((r) => r.id));
      if (error) throw new Error(error.message);
    }

    // 2. Uploads nothing refers to any more.
    const { data: all, error: allError } = await admin.from('announcements').select('attachments');
    if (allError) throw new Error(allError.message);
    const referenced = new Set(
      (all || []).flatMap((row) =>
        ((row.attachments || []) as Attachment[]).map((a) => a.path).filter((p): p is string => !!p)
      )
    );
    const cutoff = Date.now() - ORPHAN_GRACE_MS;
    const orphans = (await listFiles(admin))
      .filter((f) => !referenced.has(f.path) && f.createdAt < cutoff)
      .map((f) => f.path);
    const removedOrphans = await removeAll(admin, orphans);

    return json({ removedFromFinished: removedOver, removedOrphans });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
