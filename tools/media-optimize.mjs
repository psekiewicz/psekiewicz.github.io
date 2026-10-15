// The weekly second pass over uploaded clips (run by
// .github/workflows/media-optimize.yml).
//
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node tools/media-optimize.mjs
//
// Clips are compressed on the device when they are uploaded (js/compress.js,
// mobile/src/lib/upload.ts) - quickly, with the browser's or the phone's
// real-time encoder. This encodes each of them once more with ffmpeg, the way
// video sites do: x264 on a slow preset at a constant quality, no more than
// 720p, AAC sound, the index at the front of the file. When that comes out
// smaller the file in the `uploads` bucket is replaced in place, so every
// link to it keeps working, and it is then cached for a year (until now it
// was cached for a day, for exactly this). Every clip tried is recorded in
// public.media_optimized, replaced or not, so none is tried twice.
//
// Needs ffmpeg on the PATH and Node 20+. Talks to Supabase over plain HTTP with
// the service-role key, which only ever lives in the workflow's secrets.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL_BASE = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BUCKET = 'uploads';
const PAGE = 1000;
// Enough for a long backlog without the job running for hours.
const MAX_PER_RUN = Number(process.env.MAX_PER_RUN || 300);
// Only worth replacing when it saves at least this much.
const MIN_SAVING = 0.05;

if (!URL_BASE || !KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const auth = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function api(path, init = {}) {
  const res = await fetch(`${URL_BASE}${path}`, { ...init, headers: { ...auth, ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path}: HTTP ${res.status} ${await res.text()}`);
  return res;
}

async function list(prefix) {
  const out = [];
  for (let offset = 0; ; offset += PAGE) {
    const res = await api(`/storage/v1/object/list/${BUCKET}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } }),
    });
    const page = await res.json();
    out.push(...page);
    if (page.length < PAGE) return out;
  }
}

// Every clip in the bucket: files live one folder deep (<user id>/<name>).
async function listClips() {
  const clips = [];
  for (const folder of await list('')) {
    if (folder.id) continue;
    for (const f of await list(`${folder.name}/`)) {
      if (f.id && /\.(mp4|webm)$/i.test(f.name)) clips.push(`${folder.name}/${f.name}`);
    }
  }
  return clips;
}

async function alreadyDone() {
  const done = new Set();
  for (let from = 0; ; from += PAGE) {
    const res = await api(`/rest/v1/media_optimized?select=path`, {
      headers: { Range: `${from}-${from + PAGE - 1}` },
    });
    const rows = await res.json();
    rows.forEach((r) => done.add(r.path));
    if (rows.length < PAGE) return done;
  }
}

function encode(input, output) {
  // Longer side at most 1280, never enlarged, even dimensions for x264.
  const scale =
    "scale='if(gte(iw,ih),min(1280,iw),-2)':'if(gte(iw,ih),-2,min(1280,ih))'";
  const run = spawnSync(
    'ffmpeg',
    [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', input,
      '-map', '0:v:0', '-map', '0:a:0?',
      '-vf', scale,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '26',
      '-profile:v', 'high', '-pix_fmt', 'yuv420p',
      // Caps a burst of noise, as the browser's second pass does.
      '-maxrate', '3M', '-bufsize', '6M',
      '-c:a', 'aac', '-b:a', '96k', '-ac', '2',
      '-movflags', '+faststart',
      '-f', 'mp4',
      output,
    ],
    { stdio: ['ignore', 'inherit', 'inherit'] }
  );
  return run.status === 0;
}

async function record(path, originalSize, optimizedSize, replaced) {
  await api('/rest/v1/media_optimized', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ path, original_size: originalSize, optimized_size: optimizedSize, replaced }),
  });
}

const work = mkdtempSync(join(tmpdir(), 'media-optimize-'));
let saved = 0;
let replacedCount = 0;
let failed = 0;
try {
  const done = await alreadyDone();
  const todo = (await listClips()).filter((p) => !done.has(p)).slice(0, MAX_PER_RUN);
  console.log(`${todo.length} clip(s) to encode`);

  for (const path of todo) {
    const src = join(work, 'in');
    const dst = join(work, 'out.mp4');
    try {
      const original = Buffer.from(await (await api(`/storage/v1/object/authenticated/${BUCKET}/${path}`)).arrayBuffer());
      writeFileSync(src, original);
      if (!encode(src, dst)) throw new Error('ffmpeg failed');
      const optimized = readFileSync(dst);
      const replace = optimized.length < original.length * (1 - MIN_SAVING);
      if (replace) {
        // Same path, so links keep working. MP4 even where the name says
        // .webm: players go by the content type, and MP4 plays everywhere.
        await api(`/storage/v1/object/${BUCKET}/${path}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'video/mp4', 'x-upsert': 'true', 'cache-control': 'max-age=31536000' },
          body: optimized,
        });
        saved += original.length - optimized.length;
        replacedCount++;
      }
      await record(path, original.length, replace ? optimized.length : original.length, replace);
      console.log(
        `${path}: ${(original.length / 1e6).toFixed(2)} MB -> ${(optimized.length / 1e6).toFixed(2)} MB` +
          (replace ? '' : ' (kept the original)')
      );
    } catch (err) {
      // Left out of media_optimized, so next week tries it again.
      failed++;
      console.error(`${path}: ${err.message}`);
    } finally {
      rmSync(src, { force: true });
      rmSync(dst, { force: true });
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
console.log(`Replaced ${replacedCount} clip(s), saved ${(saved / 1e6).toFixed(1)} MB, ${failed} failed.`);
if (failed) process.exitCode = 1;
