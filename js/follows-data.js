import { supabase } from './supabase-init.js';

function toPlainProfile(row) {
  return {
    id: row.id,
    displayName: row.display_name || 'Unknown',
    avatarUrl: row.avatar_url || '',
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

// Follower counts for a whole set of users in one round trip — the batch
// counterpart of getFollowerCount, used to level a page of authors at once.
// Returns a Map<userId, count>.
export async function getFollowerCounts(userIds) {
  const uniqueIds = [...new Set(userIds)].filter(Boolean);
  const map = new Map();
  if (uniqueIds.length === 0) return map;
  const { data, error } = await supabase.from('follows').select('following_id').in('following_id', uniqueIds);
  if (error) throw new Error(error.message);
  data.forEach((row) => map.set(row.following_id, (map.get(row.following_id) || 0) + 1));
  return map;
}

export async function getFollowingCount(userId) {
  const { count, error } = await supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('follower_id', userId);
  if (error) throw new Error(error.message);
  return count || 0;
}

async function profilesForIds(ids) {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from('profiles').select('*').in('id', ids);
  if (error) throw new Error(error.message);
  return data.map(toPlainProfile);
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
