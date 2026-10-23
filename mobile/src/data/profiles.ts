import { supabase } from '../lib/supabase';

const TABLE = 'profiles';

export type Profile = {
  id: string;
  displayName: string;
  bio: string;
  avatarUrl: string;
  createdAt: string;
  points: number;
  equippedBg: string;
  equippedBorder: string;
  equippedNameEffect: string;
};

function toPlainProfile(row: any): Profile {
  return {
    id: row.id,
    displayName: row.display_name || 'Unknown',
    bio: row.bio || '',
    avatarUrl: row.avatar_url || '',
    createdAt: row.created_at,
    points: row.points ?? 0,
    equippedBg: row.equipped_bg || 'none',
    equippedBorder: row.equipped_border || 'none',
    equippedNameEffect: row.equipped_name_effect || 'none',
  };
}

export async function getProfile(userId: string) {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return toPlainProfile(data);
}

// Batch-fetch avatars/names for a list of user ids (e.g. the authors of a page
// of project cards) in one round trip instead of one query per card.
// The ids of an `in` filter travel in the URL, and Supabase's gateway turns
// a URL away somewhere past 600 of them (measured: 600 pass, 700 get a 400).
// The leaderboard asks for up to 1000, so long lists go in slices of this
// many, side by side. Same as js/profiles-data.js.
const IDS_PER_REQUEST = 200;

export async function getProfilesByIds(userIds: string[]) {
  const uniqueIds = [...new Set(userIds)].filter(Boolean);
  const map = new Map<string, Profile>();
  const slices: string[][] = [];
  for (let i = 0; i < uniqueIds.length; i += IDS_PER_REQUEST) slices.push(uniqueIds.slice(i, i + IDS_PER_REQUEST));
  const results = await Promise.all(slices.map((ids) => supabase.from(TABLE).select('*').in('id', ids)));
  for (const { data, error } of results) {
    if (error) throw new Error(error.message);
    (data || []).forEach((row: any) => map.set(row.id, toPlainProfile(row)));
  }
  return map;
}

export async function updateProfile(
  userId: string,
  fields: { displayName: string; bio: string; avatarUrl: string }
) {
  const { data, error } = await supabase
    .from(TABLE)
    .update({
      display_name: fields.displayName,
      bio: fields.bio,
      avatar_url: fields.avatarUrl,
    })
    .eq('id', userId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return toPlainProfile(data);
}
