import { supabase } from '../lib/supabase';

const TABLE = 'likes';

// Batch-fetch like counts for a page/feed of projects in one round trip.
export async function getLikeCounts(projectIds: string[]) {
  const uniqueIds = [...new Set(projectIds)].filter(Boolean);
  const map = new Map<string, number>();
  if (uniqueIds.length === 0) return map;
  const { data, error } = await supabase.from(TABLE).select('project_id').in('project_id', uniqueIds);
  if (error) throw new Error(error.message);
  data.forEach((row: any) => map.set(row.project_id, (map.get(row.project_id) || 0) + 1));
  return map;
}

// Which of these projects the given user has liked.
export async function getLikedSet(userId: string | null, projectIds: string[]) {
  const uniqueIds = [...new Set(projectIds)].filter(Boolean);
  if (!userId || uniqueIds.length === 0) return new Set<string>();
  const { data, error } = await supabase
    .from(TABLE)
    .select('project_id')
    .eq('user_id', userId)
    .in('project_id', uniqueIds);
  if (error) throw new Error(error.message);
  return new Set<string>(data.map((row: any) => row.project_id));
}

export async function likeProject(userId: string, projectId: string) {
  const { error } = await supabase.from(TABLE).insert({ project_id: projectId, user_id: userId });
  if (error) throw new Error(error.message);
}

export async function unlikeProject(userId: string, projectId: string) {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('project_id', projectId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}
