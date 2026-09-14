import { supabase } from '../lib/supabase';

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
export async function reportProject(projectId: string, reporterId: string, reason: string, note = '') {
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
  // SELECT policies to a RETURNING clause - asking for the row back turns
  // a working insert into "new row violates row-level security policy".
  return true;
}
