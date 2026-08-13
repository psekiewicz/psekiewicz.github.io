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
