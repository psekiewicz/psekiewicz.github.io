import { supabase } from '../lib/supabase';

const TABLE = 'projects';

export type Project = {
  id: string;
  uid: string;
  authorName: string;
  title: string;
  summary: string;
  description: string;
  imageUrl: string;
  tags: string[];
  repoUrl: string;
  liveUrl: string;
  type: string;
  viewsCount: number;
  mediaUrl: string;
  scrollImageUrl: string;
  published: boolean;
  createdAt: string;
  updatedAt: string;
};

function toPlainProject(row: any): Project {
  return {
    id: row.id,
    uid: row.user_id,
    authorName: row.author_name || 'Unknown',
    title: row.title || '',
    summary: row.summary || '',
    description: row.description || '',
    imageUrl: row.image_url || '',
    tags: Array.isArray(row.tags) ? row.tags : [],
    repoUrl: row.repo_url || '',
    liveUrl: row.live_url || '',
    type: row.project_type || 'other',
    viewsCount: row.views_count || 0,
    mediaUrl: row.media_url || '',
    scrollImageUrl: row.scroll_image_url || '',
    published: Boolean(row.published),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sortByCreatedDesc(projects: Project[]) {
  return [...projects].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

// Demos: published entries with somewhere to try them (a live URL), newest
// first, keyset-paged so a demo arriving mid-scroll doesn't make a page repeat
// one. XOXD shows nothing else publicly. Kept identical to js/projects-data.js.
export const DEMOS_PAGE_SIZE = 12;

export async function getDemoProjects(
  { limit = DEMOS_PAGE_SIZE, before }: { limit?: number; before?: string } = {}
) {
  let query = supabase
    .from(TABLE)
    .select('*')
    .eq('published', true)
    .neq('live_url', '')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (before) query = query.lt('created_at', before);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return sortByCreatedDesc(data.map(toPlainProject));
}

// A person's demos, for their profile: published and with a live link, the
// same rule as the Demos feed. Kept identical to js/projects-data.js.
export async function getDemosByUser(uid: string) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', uid)
    .eq('published', true)
    .neq('live_url', '');
  if (error) throw new Error(error.message);
  return sortByCreatedDesc(data.map(toPlainProject));
}

// Every project regardless of owner or published state. Only returns anything
// for admins - RLS enforces that, this function doesn't check.
export async function getAllProjects() {
  const { data, error } = await supabase.from(TABLE).select('*');
  if (error) throw new Error(error.message);
  return sortByCreatedDesc(data.map(toPlainProject));
}

export async function getMyProjects(uid: string) {
  const { data, error } = await supabase.from(TABLE).select('*').eq('user_id', uid);
  if (error) throw new Error(error.message);
  return sortByCreatedDesc(data.map(toPlainProject));
}

export async function getProjectById(id: string) {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return toPlainProject(data);
}

export async function createProject(uid: string, authorName: string, fields: any) {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id: uid,
      author_name: authorName,
      title: fields.title,
      summary: fields.summary,
      description: fields.description,
      image_url: fields.imageUrl,
      tags: fields.tags,
      repo_url: fields.repoUrl,
      live_url: fields.liveUrl,
      project_type: fields.type || 'other',
      media_url: fields.mediaUrl || '',
      scroll_image_url: fields.scrollImageUrl || '',
      published: Boolean(fields.published),
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

async function applyUpdate(id: string, patch: any) {
  const { data, error } = await supabase.from(TABLE).update(patch).eq('id', id).select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error('You do not have permission to update this project.');
  }
  return toPlainProject(data[0]);
}

// Titles for a set of project ids in one round trip - the notifications screen
// needs "liked <title>" for a handful of unrelated projects.
export async function getProjectTitles(projectIds: string[]) {
  const uniqueIds = [...new Set(projectIds)].filter(Boolean);
  const map = new Map<string, string>();
  if (uniqueIds.length === 0) return map;
  const { data, error } = await supabase.from(TABLE).select('id, title').in('id', uniqueIds);
  if (error) throw new Error(error.message);
  data.forEach((row: any) => map.set(row.id, row.title));
  return map;
}

export async function updateProject(id: string, fields: any) {
  return applyUpdate(id, {
    title: fields.title,
    summary: fields.summary,
    description: fields.description,
    image_url: fields.imageUrl,
    tags: fields.tags,
    repo_url: fields.repoUrl,
    live_url: fields.liveUrl,
    project_type: fields.type || 'other',
    media_url: fields.mediaUrl || '',
    scroll_image_url: fields.scrollImageUrl || '',
    published: Boolean(fields.published),
  });
}

export async function togglePublish(id: string, published: boolean) {
  return applyUpdate(id, { published });
}

export async function deleteProject(id: string) {
  const { data, error } = await supabase.from(TABLE).delete().eq('id', id).select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error('You do not have permission to delete this project.');
  }
}
