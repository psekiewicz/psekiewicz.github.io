import { supabase } from './supabase-init.js';

const TABLE = 'profiles';

function toPlainProfile(row) {
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

export async function getProfile(userId) {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return toPlainProfile(data);
}

// Batch-fetch avatars/names for a list of user ids (e.g. the authors of a
// page of project cards) in one round trip instead of one query per card.
// Returns a Map keyed by user id.
export async function getProfilesByIds(userIds) {
  const uniqueIds = [...new Set(userIds)].filter(Boolean);
  const map = new Map();
  if (uniqueIds.length === 0) return map;
  const { data, error } = await supabase.from(TABLE).select('*').in('id', uniqueIds);
  if (error) throw new Error(error.message);
  data.forEach((row) => map.set(row.id, toPlainProfile(row)));
  return map;
}

export async function updateProfile(userId, fields) {
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
