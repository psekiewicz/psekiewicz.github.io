import { supabase } from './supabase-init.js';

const TABLE = 'likes';

// Batch-fetch like counts for a page/feed of projects in one round trip.
// Returns a Map<projectId, count>.
export async function getLikeCounts(projectIds) {
  const uniqueIds = [...new Set(projectIds)].filter(Boolean);
  const map = new Map();
  if (uniqueIds.length === 0) return map;
  const { data, error } = await supabase.from(TABLE).select('project_id').in('project_id', uniqueIds);
  if (error) throw new Error(error.message);
  data.forEach((row) => map.set(row.project_id, (map.get(row.project_id) || 0) + 1));
  return map;
}

// Which of these projects the given user has liked. Returns a Set<projectId>.
export async function getLikedSet(userId, projectIds) {
  const uniqueIds = [...new Set(projectIds)].filter(Boolean);
  if (!userId || uniqueIds.length === 0) return new Set();
  const { data, error } = await supabase.from(TABLE).select('project_id').eq('user_id', userId).in('project_id', uniqueIds);
  if (error) throw new Error(error.message);
  return new Set(data.map((row) => row.project_id));
}

export async function likeProject(userId, projectId) {
  const { error } = await supabase.from(TABLE).insert({ project_id: projectId, user_id: userId });
  if (error) throw new Error(error.message);
}

export async function unlikeProject(userId, projectId) {
  const { error } = await supabase.from(TABLE).delete().eq('project_id', projectId).eq('user_id', userId);
  if (error) throw new Error(error.message);
}
