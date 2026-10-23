import { supabase } from './supabase-init.js';

// Reads and writes for the `comments` table. Who may read, add or delete a
// comment is decided by its RLS policies in schema.sql; these functions only
// shape the rows (snake_case columns -> camelCase objects) and throw on error.

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

// Comment counts for a page/feed of projects in one round trip, as a
// Map<projectId, count>. Read from projects.comments_count, kept by a
// trigger, for the same reason as getLikeCounts() in likes-data.js: tallying
// comment rows here stopped at PostgREST's 1000-row cap.
export async function getCommentCounts(projectIds) {
  const uniqueIds = [...new Set(projectIds)].filter(Boolean);
  const map = new Map();
  if (uniqueIds.length === 0) return map;
  const { data, error } = await supabase.from('projects').select('id, comments_count').in('id', uniqueIds);
  if (error && (error.code === '42703' || /comments_count/.test(error.message || ''))) {
    return countCommentRows(uniqueIds);
  }
  if (error) throw new Error(error.message);
  data.forEach((row) => map.set(row.id, row.comments_count || 0));
  return map;
}

// Before schema.sql has added comments_count.
async function countCommentRows(projectIds) {
  const map = new Map();
  const { data, error } = await supabase.from(TABLE).select('project_id').in('project_id', projectIds);
  if (error) throw new Error(error.message);
  data.forEach((row) => map.set(row.project_id, (map.get(row.project_id) || 0) + 1));
  return map;
}

// How many comments this user has authored, for the achievements system.
// Subject to the same RLS as everything else here - a viewer who isn't the
// author only ever counts comments on projects they can actually see.
export async function getCommentCountByUser(userId) {
  const { count, error } = await supabase.from(TABLE).select('*', { count: 'exact', head: true }).eq('user_id', userId);
  if (error) throw new Error(error.message);
  return count || 0;
}
