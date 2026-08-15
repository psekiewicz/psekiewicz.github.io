import { supabase } from './supabase-init.js';

export const REPORT_REASONS = [
  { id: 'broken', label: "Link is broken or doesn't play" },
  { id: 'spam', label: 'Spam or advertising' },
  { id: 'stolen', label: "Someone else's work, posted as their own" },
  { id: 'nsfw', label: 'Adult or graphic content' },
  { id: 'other', label: 'Something else' },
];

// Filing a report is all an ordinary account can do with this table:
// there is no select policy for non-admins, deliberately. Being able to
// read your own reports means being able to check whether one landed, and
// re-file until it does.
export async function reportProject(projectId, reporterId, reason, note = '') {
  const { error } = await supabase.from('reports').insert({
    project_id: projectId,
    reporter_id: reporterId,
    reason,
    note: String(note || '').slice(0, 500),
  });
  if (error) {
    // A unique violation means this person already reported this entry.
    // That's the rule working, not a failure worth alarming them about.
    if (error.code === '23505') return false;
    throw new Error(error.message);
  }
  // Note for later: do not chain .select() onto this insert. Reports have
  // no select policy for ordinary users on purpose, and Postgres applies
  // SELECT policies to a RETURNING clause — asking for the row back turns
  // a working insert into "new row violates row-level security policy".
  return true;
}

// One row per reported entry with its report count — not one row per
// report, which would make working the queue mean clicking through five
// rows about the same thing. Admin-only, enforced inside the function.
export async function adminListReports() {
  const { data, error } = await supabase.rpc('admin_list_reports');
  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({
    projectId: row.project_id,
    title: row.title || '',
    authorName: row.author_name || 'Unknown',
    ownerId: row.owner_id,
    published: Boolean(row.published),
    reportCount: Number(row.report_count) || 0,
    reasons: row.reasons || '',
    latestNote: row.latest_note || '',
    lastReportedAt: row.last_reported_at,
  }));
}

// Closes every open report on one entry at once.
export async function adminCloseReports(projectId, status) {
  const { data, error } = await supabase.rpc('admin_close_reports', {
    p_project_id: projectId,
    p_status: status,
  });
  if (error) throw new Error(error.message);
  return data || 0;
}
