import { supabase } from '../lib/supabase';

const TABLE = 'comments';

export type Comment = {
  id: string;
  projectId: string;
  userId: string;
  authorName: string;
  body: string;
  createdAt: string;
};

function toPlainComment(row: any): Comment {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    authorName: row.author_name || 'Unknown',
    body: row.body,
    createdAt: row.created_at,
  };
}

export async function getComments(projectId: string) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data.map(toPlainComment);
}

export async function addComment(
  projectId: string,
  userId: string,
  authorName: string,
  body: string
) {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ project_id: projectId, user_id: userId, author_name: authorName, body })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return toPlainComment(data);
}

export async function deleteComment(commentId: string) {
  const { error } = await supabase.from(TABLE).delete().eq('id', commentId);
  if (error) throw new Error(error.message);
}

// Comment counts for a page/feed of projects, from projects.comments_count
// (kept by a trigger) - the same as getLikeCounts() in likes.ts.
export async function getCommentCounts(projectIds: string[]) {
  const uniqueIds = [...new Set(projectIds)].filter(Boolean);
  const map = new Map<string, number>();
  if (uniqueIds.length === 0) return map;
  const { data, error } = await supabase.from('projects').select('id, comments_count').in('id', uniqueIds);
  if (error && (error.code === '42703' || /comments_count/.test(error.message || ''))) {
    return countCommentRows(uniqueIds);
  }
  if (error) throw new Error(error.message);
  data.forEach((row: any) => map.set(row.id, row.comments_count || 0));
  return map;
}

// Before schema.sql has added comments_count.
async function countCommentRows(projectIds: string[]) {
  const map = new Map<string, number>();
  const { data, error } = await supabase.from(TABLE).select('project_id').in('project_id', projectIds);
  if (error) throw new Error(error.message);
  data.forEach((row: any) => map.set(row.project_id, (map.get(row.project_id) || 0) + 1));
  return map;
}

export async function getCommentCountByUser(userId: string) {
  const { count, error } = await supabase
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
  return count || 0;
}
