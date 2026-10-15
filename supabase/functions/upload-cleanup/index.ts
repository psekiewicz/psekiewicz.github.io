// Supabase Edge Function: upload-cleanup
//
// Deletes files in the `uploads` bucket that nothing refers to any more: a
// picture replaced by a newer one, a post or an account that was deleted, or
// an upload whose form was never saved. A file is only "referenced" while its
// public URL appears in one of the columns below, so this is the one place
// that has to know every column an uploaded URL can end up in.
//
// Files get a day's grace before they count as abandoned, so a post being
// written slowly does not lose the picture it has not been saved with yet.
// Files are removed through the Storage API, not by deleting rows from
// storage.objects, because the latter leaves the bytes behind.
//
// It takes no input and only ever removes files that nothing refers to, so it
// is safe for anyone to call: it is deployed without JWT verification so the
// schedule (supabase/upload-cleanup.schedule.sql) can reach it without a key.
//
// Deploy with: supabase functions deploy upload-cleanup --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BUCKET = 'uploads';
const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;
const PAGE = 1000;

// Every column a person can paste or upload a URL into.
const SOURCES: { table: string; columns: string[] }[] = [
  { table: 'projects', columns: ['image_url', 'media_url', 'scroll_image_url', 'description', 'summary'] },
  { table: 'project_updates', columns: ['body'] },
  { table: 'profiles', columns: ['avatar_url'] },
  { table: 'comments', columns: ['body'] },
  { table: 'announcements', columns: ['body'] },
];

const MARKER = `/storage/v1/object/public/${BUCKET}/`;
// The path after MARKER, up to where a URL ends inside Markdown or HTML.
// A regex literal, not a string: a "\s" in a string loses its backslash.
const PATH_IN_TEXT = /\/storage\/v1\/object\/public\/uploads\/([^\s)"'<>?#]+)/g;

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

type Admin = ReturnType<typeof createClient>;

async function referencedPaths(admin: Admin) {
  const found = new Set<string>();
  for (const { table, columns } of SOURCES) {
    const filter = columns.map((c) => `${c}.like.*${MARKER}*`).join(',');
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await admin
        .from(table)
        .select(columns.join(', '))
        .or(filter)
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`${table}: ${error.message}`);
      for (const row of (data || []) as Record<string, string | null>[]) {
        for (const c of columns) {
          for (const m of String(row[c] || '').matchAll(PATH_IN_TEXT)) found.add(decodeURIComponent(m[1]));
        }
      }
      if (!data || data.length < PAGE) break;
    }
  }
  return found;
}

async function list(admin: Admin, prefix: string) {
  const out: { name: string; id: string | null; created_at: string }[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.storage.from(BUCKET).list(prefix, { limit: PAGE, offset });
    if (error) throw new Error(error.message);
    out.push(...((data || []) as typeof out));
    if (!data || data.length < PAGE) return out;
  }
}

// Every file in the bucket: files live one folder deep (<user id>/<name>).
async function listFiles(admin: Admin) {
  const files: { path: string; createdAt: number }[] = [];
  for (const entry of await list(admin, '')) {
    if (entry.id) {
      files.push({ path: entry.name, createdAt: Date.parse(entry.created_at) });
      continue;
    }
    for (const f of await list(admin, entry.name)) {
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
    // References first: a file uploaded while this runs is younger than the
    // grace period anyway, so it can't be swept by a stale reference list.
    const referenced = await referencedPaths(admin);
    const cutoff = Date.now() - ORPHAN_GRACE_MS;
    const orphans = (await listFiles(admin))
      .filter((f) => !referenced.has(f.path) && f.createdAt < cutoff)
      .map((f) => f.path);
    for (let i = 0; i < orphans.length; i += 100) {
      const chunk = orphans.slice(i, i + 100);
      const { error } = await admin.storage.from(BUCKET).remove(chunk);
      if (error) throw new Error(error.message);
      // The ffmpeg pass's record of a file that no longer exists.
      await admin.from('media_optimized').delete().in('path', chunk);
    }
    return json({ referenced: referenced.size, removed: orphans.length });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
