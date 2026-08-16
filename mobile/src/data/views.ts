import { supabase } from '../lib/supabase';

// Fire-and-forget: logs one view and bumps projects.views_count via a
// security-definer RPC, so it works for signed-out visitors too without
// opening up public write access to the projects table.
// Resolves to whether the view was actually counted — it isn't for your own
// entry, and isn't again for the same signed-in person within 6 hours.
export async function logProjectView(projectId: string) {
  const { data, error } = await supabase.rpc('log_project_view', { p_project_id: projectId });
  if (error) throw new Error(error.message);
  return data === true;
}

// View timestamps for the current user's own projects over the last `days`
// days, for the dashboard chart.
export async function getRecentViewTimestamps(days = 14): Promise<string[]> {
  const { data, error } = await supabase.rpc('my_view_timestamps', { p_days: days });
  if (error) throw new Error(error.message);
  return (data || []).map((row: any) =>
    typeof row === 'string' ? row : row.my_view_timestamps
  );
}
