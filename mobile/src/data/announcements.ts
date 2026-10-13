import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '../lib/supabase';

export type Announcement = {
  id: string;
  title: string;
  body: string;
  imageUrl: string;
  videoUrl: string;
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
    .select('id, title, body, image_url, video_url, expires_at, created_at')
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
    imageUrl: row.image_url || '',
    videoUrl: row.video_url || '',
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
// holds at most one live notice. Pictures and films are uploaded from the site's
// admin page; here they are attached by their https address.
export async function publishAnnouncement(
  userId: string,
  fields: { title: string; body: string; imageUrl?: string; videoUrl?: string; expiresAt?: Date | null }
) {
  const { error: offError } = await supabase
    .from('announcements')
    .update({ active: false })
    .eq('active', true);
  if (offError) throw new Error(offError.message);
  const { error } = await supabase.from('announcements').insert({
    title: fields.title.trim(),
    body: fields.body.trim(),
    image_url: fields.imageUrl || null,
    video_url: fields.videoUrl || null,
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
