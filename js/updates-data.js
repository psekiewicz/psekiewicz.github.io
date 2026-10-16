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

// The newest update for each of a page of projects, in one round trip, as
// a Map<projectId, update>. A card uses it to say "v0.3 - 2d ago". Ids go
// in the query string, so callers pass one page of them, not every project.
//
// project_latest_updates (schema.sql) returns one row per project. Reading
// the table itself returned every update of every project on the page and
// kept the first of each, which grows with each project's history and stops
// at PostgREST's 1000-row cap.
export async function getLatestUpdates(projectIds) {
  const ids = [...new Set(projectIds)].filter(Boolean);
  const latest = new Map();
  if (ids.length === 0) return latest;
  const { data, error } = await supabase.from('project_latest_updates').select('*').in('project_id', ids);
  if (error && isMissingView(error)) return latestFromTable(ids);
  if (error) throw new Error(error.message);
  data.forEach((row) => latest.set(row.project_id, toPlainUpdate(row)));
  return latest;
}

// Until schema.sql has created the view, PostgREST answers that it cannot
// find it (PGRST205; 42P01 from older versions).
function isMissingView(error) {
  return error.code === 'PGRST205' || error.code === '42P01' || /project_latest_updates/.test(error.message || '');
}

async function latestFromTable(ids) {
  const latest = new Map();
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .in('project_id', ids)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  // Newest first, so the first row seen for a project is its latest.
  data.forEach((row) => {
    if (!latest.has(row.project_id)) latest.set(row.project_id, toPlainUpdate(row));
  });
  return latest;
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
