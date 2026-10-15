import { supabase } from './supabase-init.js';
import { compressFile, extensionFor, baseType, IMAGE_PRESETS } from './compress.js';

// People's own pictures and demo clips, compressed on this device and put in
// the public `uploads` bucket (see schema.sql). What comes back is the public
// URL, which goes into the same field a pasted link would.
const BUCKET = 'uploads';

// The bucket's own ceiling (schema.sql); compression keeps files far under it.
export const UPLOAD_MAX_BYTES = 25 * 1024 * 1024;

// A picture is final, so it can be cached for good. A clip is replaced in
// place by the weekly ffmpeg pass (.github/workflows/media-optimize.yml), so
// until then it is cached for a day only - otherwise browsers and the CDN
// would keep serving the bigger first version for a year.
export function cacheControlFor(type) {
  return String(type).startsWith('video/') ? '86400' : '31536000';
}

// kind: 'avatar' | 'cover' | 'scroll' | 'inline' | 'media'. onStage(stage,
// progress) reports 'compress' (0..1 for clips) and then 'upload'.
// -> { url, path, size, originalSize }
export async function uploadMedia(file, { kind = 'cover', onStage } = {}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Log in to upload.');

  const type = baseType(file.type);
  if (kind !== 'media' && !type.startsWith('image/')) throw new Error('Pick a picture.');
  if (!type.startsWith('image/') && !type.startsWith('video/')) throw new Error('Pick a picture or a video clip.');

  onStage?.('compress', 0);
  const preset = IMAGE_PRESETS[kind === 'media' ? 'scroll' : kind] || IMAGE_PRESETS.cover;
  const blob = await compressFile(file, { preset, onProgress: (p) => onStage?.('compress', p) });
  if (blob.size > UPLOAD_MAX_BYTES) throw new Error('Even compressed, this is too big to upload.');

  onStage?.('upload');
  const outType = baseType(blob.type || file.type);
  const ext = extensionFor(outType);
  if (!ext) throw new Error("This file's type can't be uploaded.");
  const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: outType,
    cacheControl: cacheControlFor(outType),
  });
  if (error) {
    throw new Error(/row-level security/i.test(error.message)
      ? "Upload refused - you may have reached the limit of 300 files."
      : error.message);
  }
  const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  return { url, path, size: blob.size, originalSize: file.size };
}
