import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '../lib/supabase';

// One attached file. `path` is where an uploaded file lives in the bucket; the
// server deletes it once the announcement is over.
export type Attachment = { url: string; name?: string; type?: string; size?: number; path?: string };

export type Announcement = {
  id: string;
  title: string;
  body: string;
  attachments: Attachment[];
  expiresAt: string | null;
  createdAt: string;
};

export const TITLE_MAX = 80;
export const BODY_MAX = 4000;

const SEEN_KEY = 'announcement:lastSeen';

// The newest announcement that is switched on and not past its end, or null.
// RLS already hides expired rows from everyone but admins; the filter here also
// keeps an admin's own phone from showing one that has run out. A failed read
// is treated as "none": a popup is never worth interrupting startup over.
export async function getActiveAnnouncement(): Promise<Announcement | null> {
  const { data, error } = await supabase
    .from('announcements')
    .select('id, title, body, attachments, expires_at, created_at')
    .eq('active', true)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const row: any = data;
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
    expiresAt: row.expires_at || null,
    createdAt: row.created_at,
  };
}

export async function wasSeen(id: string) {
  try {
    return (await AsyncStorage.getItem(SEEN_KEY)) === id;
  } catch {
    return false;
  }
}

export async function markSeen(id: string) {
  try {
    await AsyncStorage.setItem(SEEN_KEY, id);
  } catch {
    // Worst case it is shown once more next launch.
  }
}

// Admin only (RLS rejects anyone else). Retires the previous ones so the table
// holds at most one live notice. Files are uploaded from the site's admin page;
// here a picture or film is attached by its https address.
export async function publishAnnouncement(
  userId: string,
  fields: { title: string; body: string; imageUrl?: string; videoUrl?: string; expiresAt?: Date | null }
) {
  const attachments: Attachment[] = [];
  if (fields.imageUrl) attachments.push({ url: fields.imageUrl, type: 'image/*' });
  if (fields.videoUrl) attachments.push({ url: fields.videoUrl, type: 'video/*' });
  const { error: offError } = await supabase
    .from('announcements')
    .update({ active: false })
    .eq('active', true);
  if (offError) throw new Error(offError.message);
  const { error } = await supabase.from('announcements').insert({
    title: fields.title.trim(),
    body: fields.body.trim(),
    attachments,
    expires_at: fields.expiresAt ? fields.expiresAt.toISOString() : null,
    created_by: userId,
  });
  if (error) throw new Error(error.message);
}

export async function clearAnnouncements() {
  const { error } = await supabase
    .from('announcements')
    .update({ active: false })
    .eq('active', true);
  if (error) throw new Error(error.message);
}
