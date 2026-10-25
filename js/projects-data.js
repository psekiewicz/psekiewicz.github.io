import { supabase } from './supabase-init.js';

// Reads and writes for the `projects` table - the entries people publish,
// shown as posts, tiles and Demos cards. Drafts (published = false) are
// visible only to their owner, and only the owner can edit or delete; both are
// RLS policies in schema.sql, not checks made here. Counters (views, likes,
// comments) are kept by the database and cannot be written from here.

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
    mediaUrl: row.media_url || '',
    scrollImageUrl: row.scroll_image_url || '',
    published: Boolean(row.published),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sortByCreatedDesc(projects) {
  return [...projects].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// Demos: published entries with somewhere to try them (a live URL), newest
// first. XOXD shows nothing else publicly. Keyset pagination rather than
// offset, so a demo arriving mid-scroll doesn't make a page repeat one. A page
// is small because each card is a full screen; the home page asks for the next
// one while there are still a few left to watch. Kept identical to mobile/src/data/projects.ts.
export const DEMOS_PAGE_SIZE = 12;

export async function getDemoProjects({ limit = DEMOS_PAGE_SIZE, before } = {}) {
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
// same rule as the Demos feed. Their other entries stay in the database (and
// in their dashboard) but are not shown anywhere public.
export async function getDemosByUser(uid) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', uid)
    .eq('published', true)
    .neq('live_url', '');
  if (error) throw new Error(error.message);
  return sortByCreatedDesc(data.map(toPlainProject));
}

// Particular demos, in the order asked for - the ones a news article links to.
// Anything unpublished or without a live link is left out, as everywhere.
export async function getDemosByIds(ids) {
  const unique = [...new Set(ids)].filter(Boolean);
  if (!unique.length) return [];
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .in('id', unique)
    .eq('published', true)
    .neq('live_url', '');
  if (error) throw new Error(error.message);
  const byId = new Map(data.map((row) => [row.id, toPlainProject(row)]));
  return unique.map((id) => byId.get(id)).filter(Boolean);
}

// Every project regardless of owner or published state. Only returns
// anything for admins - RLS enforces that, this function doesn't check.
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
      media_url: fields.mediaUrl || '',
      scroll_image_url: fields.scrollImageUrl || '',
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

// Titles for a set of project ids in one round trip - the notifications
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
    media_url: fields.mediaUrl || '',
    scroll_image_url: fields.scrollImageUrl || '',
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
