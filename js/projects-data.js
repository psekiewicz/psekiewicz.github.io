import { supabase } from './supabase-init.js';

const TABLE = 'projects';

function toPlainProject(row) {
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
    scrollImageUrl: row.scroll_image_url || '',
    scrollBg: row.scroll_bg || '',
    published: Boolean(row.published),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sortByCreatedDesc(projects) {
  return [...projects].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function getPublishedProjects() {
  const { data, error } = await supabase.from(TABLE).select('*').eq('published', true);
  if (error) throw new Error(error.message);
  return sortByCreatedDesc(data.map(toPlainProject));
}

export async function getPublishedProjectsByUser(uid) {
  const { data, error } = await supabase.from(TABLE).select('*').eq('user_id', uid).eq('published', true);
  if (error) throw new Error(error.message);
  return sortByCreatedDesc(data.map(toPlainProject));
}

// Published projects for a whole set of authors in one round trip — used to
// work out the levels of every author on a page of cards without firing a
// query per card. Returns a Map<userId, project[]>.
export async function getPublishedProjectsByUsers(userIds) {
  const uniqueIds = [...new Set(userIds)].filter(Boolean);
  const map = new Map();
  if (uniqueIds.length === 0) return map;
  const { data, error } = await supabase
    .from(TABLE)
    .select('id, user_id, views_count')
    .in('user_id', uniqueIds)
    .eq('published', true);
  if (error) throw new Error(error.message);
  data.forEach((row) => {
    if (!map.has(row.user_id)) map.set(row.user_id, []);
    map.get(row.user_id).push({ id: row.id, viewsCount: row.views_count || 0 });
  });
  return map;
}

// Every project regardless of owner or published state. Only returns
// anything for admins — RLS enforces that, this function doesn't check.
export async function getAllProjects() {
  const { data, error } = await supabase.from(TABLE).select('*');
  if (error) throw new Error(error.message);
  return sortByCreatedDesc(data.map(toPlainProject));
}

export async function getMyProjects(uid) {
  const { data, error } = await supabase.from(TABLE).select('*').eq('user_id', uid);
  if (error) throw new Error(error.message);
  return sortByCreatedDesc(data.map(toPlainProject));
}

export async function getProjectById(id) {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return toPlainProject(data);
}

export async function createProject(uid, authorName, fields) {
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
      scroll_image_url: fields.scrollImageUrl || '',
      scroll_bg: fields.scrollBg || '',
      published: Boolean(fields.published),
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

async function applyUpdate(id, patch) {
  const { data, error } = await supabase.from(TABLE).update(patch).eq('id', id).select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error('You do not have permission to update this project.');
  }
  return toPlainProject(data[0]);
}

// Titles for a set of project ids in one round trip — the notifications
// panel needs "liked <title>" for a handful of unrelated projects.
// Returns a Map<projectId, title>.
export async function getProjectTitles(projectIds) {
  const uniqueIds = [...new Set(projectIds)].filter(Boolean);
  const map = new Map();
  if (uniqueIds.length === 0) return map;
  const { data, error } = await supabase.from(TABLE).select('id, title').in('id', uniqueIds);
  if (error) throw new Error(error.message);
  data.forEach((row) => map.set(row.id, row.title));
  return map;
}

export async function updateProject(id, fields) {
  return applyUpdate(id, {
    title: fields.title,
    summary: fields.summary,
    description: fields.description,
    image_url: fields.imageUrl,
    tags: fields.tags,
    repo_url: fields.repoUrl,
    live_url: fields.liveUrl,
    project_type: fields.type || 'other',
    scroll_image_url: fields.scrollImageUrl || '',
    scroll_bg: fields.scrollBg || '',
    published: Boolean(fields.published),
  });
}

export async function togglePublish(id, published) {
  return applyUpdate(id, { published });
}

export async function deleteProject(id) {
  const { data, error } = await supabase.from(TABLE).delete().eq('id', id).select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error('You do not have permission to delete this project.');
  }
}
