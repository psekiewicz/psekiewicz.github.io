import { supabase } from '../lib/supabase';

export type MiniProfile = { id: string; displayName: string; avatarUrl: string };

function toPlainProfile(row: any): MiniProfile {
  return {
    id: row.id,
    displayName: row.display_name || 'Unknown',
    avatarUrl: row.avatar_url || '',
  };
}

export async function isFollowing(followerId: string | null, followingId: string) {
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

export async function followUser(followerId: string, followingId: string) {
  const { error } = await supabase
    .from('follows')
    .insert({ follower_id: followerId, following_id: followingId });
  if (error) throw new Error(error.message);
}

export async function unfollowUser(followerId: string, followingId: string) {
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', followerId)
    .eq('following_id', followingId);
  if (error) throw new Error(error.message);
}

export async function getFollowerCount(userId: string) {
  const { count, error } = await supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('following_id', userId);
  if (error) throw new Error(error.message);
  return count || 0;
}

// Just the ids this user follows — the feed ranker only needs "do I follow this
// author", not their names or avatars.
export async function getFollowingIds(userId: string | null) {
  if (!userId) return new Set<string>();
  const { data, error } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', userId);
  if (error) throw new Error(error.message);
  return new Set<string>(data.map((row: any) => row.following_id));
}

export async function getFollowingCount(userId: string) {
  const { count, error } = await supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('follower_id', userId);
  if (error) throw new Error(error.message);
  return count || 0;
}

async function profilesForIds(ids: string[]) {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from('profiles').select('*').in('id', ids);
  if (error) throw new Error(error.message);
  return data.map(toPlainProfile);
}

export async function getFollowers(userId: string) {
  const { data, error } = await supabase
    .from('follows')
    .select('follower_id')
    .eq('following_id', userId);
  if (error) throw new Error(error.message);
  return profilesForIds(data.map((r: any) => r.follower_id));
}

export async function getFollowing(userId: string) {
  const { data, error } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', userId);
  if (error) throw new Error(error.message);
  return profilesForIds(data.map((r: any) => r.following_id));
}
