import { supabase } from '../lib/supabase';

export type MiniProfile = {
  id: string;
  displayName: string;
  avatarUrl: string;
  equippedBorder: string;
  equippedNameEffect: string;
};

function toPlainProfile(row: any): MiniProfile {
  return {
    id: row.id,
    displayName: row.display_name || 'Unknown',
    avatarUrl: row.avatar_url || '',
    equippedBorder: row.equipped_border || 'none',
    equippedNameEffect: row.equipped_name_effect || 'none',
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

// Just the ids this user follows - the feed ranker only needs "do I follow this
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

// In slices, like getProfilesByIds() in profiles.ts: someone with a
// thousand followers would otherwise ask for a URL the gateway refuses.
async function profilesForIds(ids: string[]) {
  const slices: string[][] = [];
  for (let i = 0; i < ids.length; i += 200) slices.push(ids.slice(i, i + 200));
  const results = await Promise.all(slices.map((slice) => supabase.from('profiles').select('*').in('id', slice)));
  return results.flatMap(({ data, error }) => {
    if (error) throw new Error(error.message);
    return (data || []).map(toPlainProfile);
  });
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
