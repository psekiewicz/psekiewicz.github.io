import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '../lib/supabase';

export type Announcement = { id: string; title: string; body: string; createdAt: string };

export const TITLE_MAX = 80;
export const BODY_MAX = 600;

const SEEN_KEY = 'announcement:lastSeen';

// The newest active announcement, or null. A failed read is treated as "none":
// a popup is never worth interrupting startup over.
export async function getActiveAnnouncement(): Promise<Announcement | null> {
  const { data, error } = await supabase
    .from('announcements')
    .select('id, title, body, created_at')
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const row: any = data;
  return { id: row.id, title: row.title, body: row.body, createdAt: row.created_at };
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
// holds at most one live notice.
export async function publishAnnouncement(userId: string, title: string, body: string) {
  const { error: offError } = await supabase
    .from('announcements')
    .update({ active: false })
    .eq('active', true);
  if (offError) throw new Error(offError.message);
  const { error } = await supabase
    .from('announcements')
    .insert({ title: title.trim(), body: body.trim(), created_by: userId });
  if (error) throw new Error(error.message);
}

export async function clearAnnouncements() {
  const { error } = await supabase
    .from('announcements')
    .update({ active: false })
    .eq('active', true);
  if (error) throw new Error(error.message);
}
