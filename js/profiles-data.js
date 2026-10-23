import { supabase } from './supabase-init.js';

// Reads and writes for the `profiles` table, the public face of an account
// (auth.users itself is never readable from the browser). A row is created by
// a trigger at sign-up. You can update your own name, bio and avatar; points,
// is_admin and equipped cosmetics are guarded by triggers in schema.sql.

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

// The ids of an `in` filter travel in the URL, and Supabase's gateway turns
// a URL away somewhere past 600 of them (measured: 600 pass, 700 get a 400).
// A page of cards never comes near that; a leaderboard of 1000 does, so long
// lists go in slices of this many, side by side.
const IDS_PER_REQUEST = 200;

// Batch-fetch avatars/names for a list of user ids (e.g. the authors of a
// page of project cards) instead of one query per card. Returns a Map keyed
// by user id.
export async function getProfilesByIds(userIds) {
  const uniqueIds = [...new Set(userIds)].filter(Boolean);
  const map = new Map();
  const slices = [];
  for (let i = 0; i < uniqueIds.length; i += IDS_PER_REQUEST) slices.push(uniqueIds.slice(i, i + IDS_PER_REQUEST));
  const results = await Promise.all(slices.map((ids) => supabase.from(TABLE).select('*').in('id', ids)));
  for (const { data, error } of results) {
    if (error) throw new Error(error.message);
    data.forEach((row) => map.set(row.id, toPlainProfile(row)));
  }
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
