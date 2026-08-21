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
