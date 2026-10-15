import { supabase } from '../lib/supabase';

const TABLE = 'likes';

// Like counts for a page/feed of projects in one round trip. Read from
// projects.likes_count, which a trigger keeps (see schema.sql): tallying the
// like rows here stopped at PostgREST's 1000-row cap. Same as js/likes-data.js.
export async function getLikeCounts(projectIds: string[]) {
  const uniqueIds = [...new Set(projectIds)].filter(Boolean);
  const map = new Map<string, number>();
  if (uniqueIds.length === 0) return map;
  const { data, error } = await supabase.from('projects').select('id, likes_count').in('id', uniqueIds);
  if (error && (error.code === '42703' || /likes_count/.test(error.message || ''))) {
    return countLikeRows(uniqueIds);
  }
  if (error) throw new Error(error.message);
  data.forEach((row: any) => map.set(row.id, row.likes_count || 0));
  return map;
}

// Before schema.sql has added likes_count.
async function countLikeRows(projectIds: string[]) {
  const map = new Map<string, number>();
  const { data, error } = await supabase.from(TABLE).select('project_id').in('project_id', projectIds);
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
