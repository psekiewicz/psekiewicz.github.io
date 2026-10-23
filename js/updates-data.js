import { supabase } from './supabase-init.js';

// A project's changelog (see project_updates in schema.sql). Anyone who can
// see a project can read its updates; only its owner can post one, and the
// date is the server's.
const TABLE = 'project_updates';

function toPlainUpdate(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    uid: row.user_id,
    version: row.version || '',
    body: row.body || '',
    createdAt: row.created_at,
  };
}

export async function getUpdates(projectId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data.map(toPlainUpdate);
}

export async function addUpdate(projectId, uid, { version = '', body }) {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ project_id: projectId, user_id: uid, version: version.trim(), body: body.trim() })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return toPlainUpdate(data);
}

export async function deleteUpdate(id) {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw new Error(error.message);
}
