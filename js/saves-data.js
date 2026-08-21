import { supabase } from './supabase-init.js';

const TABLE = 'saves';

// A private shelf. Unlike likes there is no public read policy on this
// table, no count anywhere in the UI, and saving something earns its
// author nothing - the moment it pays, it stops being a shelf and becomes
// another number to farm.

export async function isSaved(userId, projectId) {
  if (!userId || !projectId) return false;
  const { data, error } = await supabase
    .from(TABLE)
    .select('project_id')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

// Which of these entries the user has saved - one round trip for a whole
// feed, so the Scrolls rail can paint its filled/hollow state in one go.
export async function getSavedSet(userId, projectIds) {
  const uniqueIds = [...new Set(projectIds)].filter(Boolean);
  if (!userId || uniqueIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from(TABLE)
    .select('project_id')
    .eq('user_id', userId)
    .in('project_id', uniqueIds);
  if (error) throw new Error(error.message);
  return new Set(data.map((row) => row.project_id));
}

export async function saveProject(userId, projectId) {
  const { error } = await supabase.from(TABLE).insert({ user_id: userId, project_id: projectId });
  // Saving something already saved is a no-op, not an error - the button
  // can be double-tapped and two tabs can disagree about the state.
  if (error && error.code !== '23505') throw new Error(error.message);
}

export async function unsaveProject(userId, projectId) {
  const { error } = await supabase.from(TABLE).delete().eq('user_id', userId).eq('project_id', projectId);
  if (error) throw new Error(error.message);
}

// The saved entries themselves, newest save first. The join reads through
// the projects table's own RLS, so anything that has since been
// unpublished or deleted simply doesn't come back.
export async function getSavedProjects(userId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('created_at, projects (id, user_id, author_name, title, summary, image_url, tags, project_type, media_url, views_count, published, created_at)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || [])
    .filter((row) => row.projects)
    .map((row) => ({
      id: row.projects.id,
      uid: row.projects.user_id,
      authorName: row.projects.author_name || 'Unknown',
      title: row.projects.title || '',
      summary: row.projects.summary || '',
      imageUrl: row.projects.image_url || '',
      tags: Array.isArray(row.projects.tags) ? row.projects.tags : [],
      type: row.projects.project_type || 'other',
      mediaUrl: row.projects.media_url || '',
      viewsCount: row.projects.views_count || 0,
      published: Boolean(row.projects.published),
      createdAt: row.projects.created_at,
      savedAt: row.created_at,
    }));
}
