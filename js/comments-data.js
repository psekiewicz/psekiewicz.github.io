import { supabase } from './supabase-init.js';

const TABLE = 'comments';

function toPlainComment(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    authorName: row.author_name || 'Unknown',
    body: row.body,
    createdAt: row.created_at,
  };
}

export async function getComments(projectId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data.map(toPlainComment);
}

export async function addComment(projectId, userId, authorName, body) {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ project_id: projectId, user_id: userId, author_name: authorName, body })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return toPlainComment(data);
}

export async function deleteComment(commentId) {
  const { error } = await supabase.from(TABLE).delete().eq('id', commentId);
  if (error) throw new Error(error.message);
}

// Batch-fetch comment counts for a page/feed of projects in one round trip.
// Returns a Map<projectId, count>.
export async function getCommentCounts(projectIds) {
  const uniqueIds = [...new Set(projectIds)].filter(Boolean);
  const map = new Map();
  if (uniqueIds.length === 0) return map;
  const { data, error } = await supabase.from(TABLE).select('project_id').in('project_id', uniqueIds);
  if (error) throw new Error(error.message);
  data.forEach((row) => map.set(row.project_id, (map.get(row.project_id) || 0) + 1));
  return map;
}
