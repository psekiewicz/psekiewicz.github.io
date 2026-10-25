import { supabase } from './supabase-init.js';

// Reads and writes for the `follows` table (one row per follower -> followed
// pair). RLS only lets you insert or delete rows where you are the follower;
// counts are plain row counts, there is no counter column to keep in step.

function toPlainProfile(row) {
  return {
    id: row.id,
    displayName: row.display_name || 'Unknown',
    avatarUrl: row.avatar_url || '',
    equippedBorder: row.equipped_border || 'none',
    equippedNameEffect: row.equipped_name_effect || 'none',
  };
}

export async function isFollowing(followerId, followingId) {
  if (!followerId) return false;
  const { data, error } = await supabase
    .from('follows')
    .select('follower_id')
    .eq('follower_id', followerId)
    .eq('following_id', followingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function followUser(followerId, followingId) {
  const { error } = await supabase.from('follows').insert({ follower_id: followerId, following_id: followingId });
  if (error) throw new Error(error.message);
}

export async function unfollowUser(followerId, followingId) {
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', followerId)
    .eq('following_id', followingId);
  if (error) throw new Error(error.message);
}

export async function getFollowerCount(userId) {
  const { count, error } = await supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('following_id', userId);
  if (error) throw new Error(error.message);
  return count || 0;
}

// Just the ids this user follows - the feed ranker only needs to know
// "do I follow this author", not their names or avatars, so this skips
// the profile lookup getFollowing() does.
export async function getFollowingIds(userId) {
  if (!userId) return new Set();
  const { data, error } = await supabase.from('follows').select('following_id').eq('follower_id', userId);
  if (error) throw new Error(error.message);
  return new Set(data.map((row) => row.following_id));
}

export async function getFollowingCount(userId) {
  const { count, error } = await supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('follower_id', userId);
  if (error) throw new Error(error.message);
  return count || 0;
}

// In slices, like getProfilesByIds() in profiles-data.js: someone with a
// thousand followers would otherwise ask for a URL the gateway refuses.
async function profilesForIds(ids) {
  const slices = [];
  for (let i = 0; i < ids.length; i += 200) slices.push(ids.slice(i, i + 200));
  const results = await Promise.all(slices.map((slice) => supabase.from('profiles').select('*').in('id', slice)));
  return results.flatMap(({ data, error }) => {
    if (error) throw new Error(error.message);
    return data.map(toPlainProfile);
  });
}

export async function getFollowers(userId) {
  const { data, error } = await supabase.from('follows').select('follower_id').eq('following_id', userId);
  if (error) throw new Error(error.message);
  return profilesForIds(data.map((r) => r.follower_id));
}

export async function getFollowing(userId) {
  const { data, error } = await supabase.from('follows').select('following_id').eq('follower_id', userId);
  if (error) throw new Error(error.message);
  return profilesForIds(data.map((r) => r.following_id));
}
