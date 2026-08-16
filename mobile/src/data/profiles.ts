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
export async function getProfilesByIds(userIds: string[]) {
  const uniqueIds = [...new Set(userIds)].filter(Boolean);
  const map = new Map<string, Profile>();
  if (uniqueIds.length === 0) return map;
  const { data, error } = await supabase.from(TABLE).select('*').in('id', uniqueIds);
  if (error) throw new Error(error.message);
  data.forEach((row: any) => map.set(row.id, toPlainProfile(row)));
  return map;
}

export async function getAllProfiles(limit = 200) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data.map(toPlainProfile);
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
