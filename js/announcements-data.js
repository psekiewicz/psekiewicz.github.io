import { supabase } from './supabase-init.js';

// The admin's site-wide notice (the `announcements` table and bucket in
// schema.sql): admin.html writes it, js/announcement.js shows it to everyone
// as a popup. At most one is live at a time; publishing replaces the last one.
// The limits below match the form's maxlength and the table's checks.

export const TITLE_MAX = 80;
export const BODY_MAX = 4000;
export const FILE_MAX_BYTES = 50 * 1024 * 1024;
export const FILES_MAX = 5;

const BUCKET = 'announcements';
const COLUMNS = 'id, title, body, attachments, expires_at, created_at';

// One attached file: { url, name, type, size, path? }. `path` is where an
// uploaded file lives in the bucket; the cleanup function deletes it once the
// announcement is over.
function toAnnouncement(row) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
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

// Uploads any file to the admin-only bucket and returns its attachment record.
// Only admins can write to the bucket, so no file type is refused; the size is
// capped by the bucket as well as here.
export async function uploadAnnouncementFile(userId, file) {
  if (file.size > FILE_MAX_BYTES) {
    throw new Error(`"${file.name}" is over ${Math.round(FILE_MAX_BYTES / 1024 / 1024)} MB.`);
  }
  const ext = (file.name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext ? '.' + ext : ''}`;
  const type = file.type || 'application/octet-stream';
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: type,
    cacheControl: '3600',
  });
  if (error) throw new Error(error.message);
  const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  return { url, path, name: file.name, type, size: file.size };
}

// Best effort: used when a publish fails after the files were already uploaded.
export async function discardUploads(attachments) {
  const paths = attachments.map((a) => a.path).filter(Boolean);
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths).catch(() => {});
}

// Asks the server to delete the files of announcements that are over. The
// schedule does this on its own every 15 minutes; calling it after a publish or
// a withdrawal just makes it immediate. Failure is not worth reporting.
export async function cleanupAnnouncements() {
  await supabase.functions.invoke('announcement-cleanup', { body: {} }).catch(() => {});
}

// Admin only (RLS rejects anyone else). Retires the previous ones so the table
// holds at most one live notice. `expiresAt` is a Date or null (no end).
export async function publishAnnouncement(userId, { title, body, attachments = [], expiresAt }) {
  const off = await supabase.from('announcements').update({ active: false }).eq('active', true);
  if (off.error) throw new Error(off.error.message);
  const { error } = await supabase.from('announcements').insert({
    title: title.trim(),
    body: body.trim(),
    attachments,
    expires_at: expiresAt ? expiresAt.toISOString() : null,
    created_by: userId,
  });
  if (error) throw new Error(error.message);
  cleanupAnnouncements();
}

export async function clearAnnouncements() {
  const { error } = await supabase.from('announcements').update({ active: false }).eq('active', true);
  if (error) throw new Error(error.message);
  cleanupAnnouncements();
}
