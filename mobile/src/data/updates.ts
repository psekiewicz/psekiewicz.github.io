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

// The newest update for each of a page of projects, in one round trip, as a
// Map<projectId, update>. project_latest_updates (schema.sql) returns one row
// per project; until schema.sql has created it, read the table the old way.
export async function getLatestUpdates(projectIds: string[]) {
  const ids = [...new Set(projectIds)].filter(Boolean);
  const latest = new Map<string, ProjectUpdate>();
  if (ids.length === 0) return latest;
  const { data, error } = await supabase.from('project_latest_updates').select('*').in('project_id', ids);
  if (error && (error.code === 'PGRST205' || error.code === '42P01' || /project_latest_updates/.test(error.message || ''))) {
    return latestFromTable(ids);
  }
  if (error) throw new Error(error.message);
  (data || []).forEach((row: any) => latest.set(row.project_id, toPlainUpdate(row)));
  return latest;
}

async function latestFromTable(ids: string[]) {
  const latest = new Map<string, ProjectUpdate>();
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .in('project_id', ids)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  // Newest first, so the first row seen for a project is its latest.
  (data || []).forEach((row: any) => {
    if (!latest.has(row.project_id)) latest.set(row.project_id, toPlainUpdate(row));
  });
  return latest;
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
