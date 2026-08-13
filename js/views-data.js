import { supabase } from './supabase-init.js';

// Fire-and-forget: logs one view and bumps projects.views_count, via a
// security-definer RPC (see log_project_view() in schema.sql) so it works
// for signed-out visitors too, without opening up public write access to
// the projects table itself.
export async function logProjectView(projectId) {
  const { error } = await supabase.rpc('log_project_view', { p_project_id: projectId });
  if (error) throw new Error(error.message);
}

// Raw view timestamps for every one of the current user's projects over
// the last `days` days. RLS on project_views restricts this to rows the
// caller actually owns (or is admin for), so no explicit filtering by
// project id is needed here — the database does it.
export async function getRecentViewTimestamps(days = 14) {
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const { data, error } = await supabase.from('project_views').select('created_at').gte('created_at', since);
  if (error) throw new Error(error.message);
  return data.map((row) => row.created_at);
}
