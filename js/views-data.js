import { supabase } from './supabase-init.js';

// Fire-and-forget: logs one view and bumps projects.views_count, via a
// security-definer RPC (see log_project_view() in schema.sql) so it works
// for signed-out visitors too, without opening up public write access to
// the projects table itself.
// Resolves to whether the view was actually counted. It isn't for your own
// entry, and isn't again for the same signed-in person within 6 hours - so
// the caller has to ask rather than assume, or the counter on screen drifts
// away from the number everyone else sees.
export async function logProjectView(projectId) {
  const { data, error } = await supabase.rpc('log_project_view', { p_project_id: projectId });
  if (error) throw new Error(error.message);
  return data === true;
}

// View timestamps for the current user's own projects over the last `days`
// days, for the dashboard chart.
//
// This used to select from project_views directly, under a policy that let
// the owner read their rows. The log now records who viewed (so a view can
// count once per person instead of once per reload), and that policy would
// have quietly turned the chart into a "who looked at your entry" list.
// The table is no longer readable by anyone; this RPC returns timestamps
// and nothing else.
export async function getRecentViewTimestamps(days = 14) {
  const { data, error } = await supabase.rpc('my_view_timestamps', { p_days: days });
  if (error) throw new Error(error.message);
  return (data || []).map((row) => (typeof row === 'string' ? row : row.my_view_timestamps));
}
