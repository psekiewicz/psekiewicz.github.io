import { supabase } from './supabase-init.js';

// Reads and writes for the `likes` table (one row per project + person). RLS
// lets anyone read and only you add or remove your own like.

const TABLE = 'likes';

// Like counts for a page/feed of projects in one round trip, as a
// Map<projectId, count>.
//
// Read from projects.likes_count, which a trigger keeps (see schema.sql):
// one row per entry. This used to fetch every like row and tally them here,
// which PostgREST cuts off at 1000 rows - past that the counts came out
// short, for whichever entries the cut landed on.
export async function getLikeCounts(projectIds) {
  const uniqueIds = [...new Set(projectIds)].filter(Boolean);
  const map = new Map();
  if (uniqueIds.length === 0) return map;
  const { data, error } = await supabase.from('projects').select('id, likes_count').in('id', uniqueIds);
  if (error && isMissingColumn(error)) return countLikeRows(uniqueIds);
  if (error) throw new Error(error.message);
  data.forEach((row) => map.set(row.id, row.likes_count || 0));
  return map;
}

// A database that has not re-run schema.sql yet has no likes_count; until it
// does, count the rows the old way rather than show nothing.
function isMissingColumn(error) {
  return error.code === '42703' || /likes_count/.test(error.message || '');
}

async function countLikeRows(projectIds) {
  const map = new Map();
  const { data, error } = await supabase.from(TABLE).select('project_id').in('project_id', projectIds);
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
