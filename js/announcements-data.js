import { supabase } from './supabase-init.js';

export const TITLE_MAX = 80;
export const BODY_MAX = 600;

// The newest active announcement, or null. A failed read counts as "none": a
// popup is never worth getting in the way of a page loading.
export async function getActiveAnnouncement() {
  const { data, error } = await supabase
    .from('announcements')
    .select('id, title, body, created_at')
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return { id: data.id, title: data.title, body: data.body, createdAt: data.created_at };
}

// Admin only (RLS rejects anyone else). Retires the previous ones so the table
// holds at most one live notice.
export async function publishAnnouncement(userId, title, body) {
  const off = await supabase.from('announcements').update({ active: false }).eq('active', true);
  if (off.error) throw new Error(off.error.message);
  const { error } = await supabase
    .from('announcements')
    .insert({ title: title.trim(), body: body.trim(), created_by: userId });
  if (error) throw new Error(error.message);
}

export async function clearAnnouncements() {
  const { error } = await supabase.from('announcements').update({ active: false }).eq('active', true);
  if (error) throw new Error(error.message);
}
