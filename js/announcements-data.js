import { supabase } from './supabase-init.js';

export const TITLE_MAX = 80;
export const BODY_MAX = 4000;

const BUCKET = 'announcements';
const IMAGE_MAX = 10 * 1024 * 1024;
const VIDEO_MAX = 50 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const VIDEO_TYPES = ['video/mp4', 'video/webm'];

const COLUMNS = 'id, title, body, image_url, video_url, expires_at, created_at';

function toAnnouncement(row) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    imageUrl: row.image_url || '',
    videoUrl: row.video_url || '',
    expiresAt: row.expires_at || null,
    createdAt: row.created_at,
  };
}

// The newest announcement that is switched on and not past its end, or null.
// RLS already hides expired rows from everyone but admins; the filter here also
// keeps an admin's own browser from showing one that has run out. A failed
// read counts as "none": a popup is never worth getting in the way of a page.
export async function getActiveAnnouncement() {
  const { data, error } = await supabase
    .from('announcements')
    .select(COLUMNS)
    .eq('active', true)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return toAnnouncement(data);
}

// Uploads an image or a film to the admin-only bucket and returns its public
// address. The type and size limits are enforced again by the bucket itself.
export async function uploadAnnouncementMedia(userId, file, kind) {
  const types = kind === 'video' ? VIDEO_TYPES : IMAGE_TYPES;
  const max = kind === 'video' ? VIDEO_MAX : IMAGE_MAX;
  if (!types.includes(file.type)) {
    throw new Error(kind === 'video' ? 'Use an MP4 or WebM film.' : 'Use a JPEG, PNG, WebP or GIF picture.');
  }
  if (file.size > max) {
    throw new Error(`That file is over ${Math.round(max / 1024 / 1024)} MB.`);
  }
  const ext = (file.name.split('.').pop() || kind).toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    cacheControl: '31536000',
  });
  if (error) throw new Error(error.message);
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// Admin only (RLS rejects anyone else). Retires the previous ones so the table
// holds at most one live notice. `expiresAt` is a Date or null (no end).
export async function publishAnnouncement(userId, { title, body, imageUrl, videoUrl, expiresAt }) {
  const off = await supabase.from('announcements').update({ active: false }).eq('active', true);
  if (off.error) throw new Error(off.error.message);
  const { error } = await supabase.from('announcements').insert({
    title: title.trim(),
    body: body.trim(),
    image_url: imageUrl || null,
    video_url: videoUrl || null,
    expires_at: expiresAt ? expiresAt.toISOString() : null,
    created_by: userId,
  });
  if (error) throw new Error(error.message);
}

export async function clearAnnouncements() {
  const { error } = await supabase.from('announcements').update({ active: false }).eq('active', true);
  if (error) throw new Error(error.message);
}
