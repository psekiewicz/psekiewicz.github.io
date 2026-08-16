import { supabase } from '../lib/supabase';

const TABLE = 'saves';

// A private shelf. Unlike likes there is no public read policy on this table,
// no count anywhere in the UI, and saving something earns its author nothing.

export async function isSaved(userId: string | null, projectId: string) {
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

export async function getSavedSet(userId: string | null, projectIds: string[]) {
  const uniqueIds = [...new Set(projectIds)].filter(Boolean);
  if (!userId || uniqueIds.length === 0) return new Set<string>();
  const { data, error } = await supabase
    .from(TABLE)
    .select('project_id')
    .eq('user_id', userId)
    .in('project_id', uniqueIds);
  if (error) throw new Error(error.message);
  return new Set<string>(data.map((row: any) => row.project_id));
}

export async function saveProject(userId: string, projectId: string) {
  const { error } = await supabase.from(TABLE).insert({ user_id: userId, project_id: projectId });
  // Saving something already saved is a no-op, not an error — the button can be
  // double-tapped and two devices can disagree about the state.
  if (error && (error as any).code !== '23505') throw new Error(error.message);
}

export async function unsaveProject(userId: string, projectId: string) {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('user_id', userId)
    .eq('project_id', projectId);
  if (error) throw new Error(error.message);
}

// The saved entries themselves, newest save first. The join reads through the
// projects table's own RLS, so anything since unpublished or deleted simply
// doesn't come back.
export async function getSavedProjects(userId: string) {
  const { data, error } = await supabase
    .from(TABLE)
    .select(
      'created_at, projects (id, user_id, author_name, title, summary, image_url, tags, project_type, media_url, views_count, published, created_at)'
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || [])
    .filter((row: any) => row.projects)
    .map((row: any) => ({
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
