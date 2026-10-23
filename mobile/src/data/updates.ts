import { supabase } from '../lib/supabase';

// A project's changelog (see project_updates in schema.sql). Anyone who can
// see a project can read its updates; only its owner can post one, and the
// date is the server's. A direct port of js/updates-data.js.
const TABLE = 'project_updates';

export type ProjectUpdate = {
  id: string;
  projectId: string;
  uid: string;
  version: string;
  body: string;
  createdAt: string;
};

function toPlainUpdate(row: any): ProjectUpdate {
  return {
    id: row.id,
    projectId: row.project_id,
    uid: row.user_id,
    version: row.version || '',
    body: row.body || '',
    createdAt: row.created_at,
  };
}

export async function getUpdates(projectId: string) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map(toPlainUpdate);
}

export async function addUpdate(projectId: string, uid: string, { version = '', body }: { version?: string; body: string }) {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ project_id: projectId, user_id: uid, version: version.trim(), body: body.trim() })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return toPlainUpdate(data);
}

export async function deleteUpdate(id: string) {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw new Error(error.message);
}
