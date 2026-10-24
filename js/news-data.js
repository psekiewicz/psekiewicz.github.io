import { supabase } from './supabase-init.js';

// News: weekly issues and the articles in them (the news_* tables in
// schema.sql). Anyone reads; only news editors write, and only an admin
// decides who is one - RLS enforces all of it, these functions only shape
// the rows and throw on error. People like and comment on an issue as a
// whole, which earns nobody XP. The mirror of mobile/src/data/news.ts.

const ISSUES = 'news_issues';
const ARTICLES = 'news_articles';

function toIssue(row) {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary || '',
    coverUrl: row.cover_url || '',
    periodStart: row.period_start || null,
    periodEnd: row.period_end || null,
    createdBy: row.created_by,
    published: Boolean(row.published),
    likesCount: row.likes_count || 0,
    commentsCount: row.comments_count || 0,
    createdAt: row.created_at,
  };
}

function toArticle(row) {
  return {
    id: row.id,
    issueId: row.issue_id,
    authorId: row.author_id,
    authorName: row.author_name || 'Unknown',
    title: row.title,
    lead: row.lead || '',
    body: row.body || '',
    imageUrl: row.image_url || '',
    sourceName: row.source_name || '',
    sourceUrl: row.source_url || '',
    position: row.position || 0,
    createdAt: row.created_at,
  };
}

function toComment(row) {
  return {
    id: row.id,
    issueId: row.issue_id,
    userId: row.user_id,
    authorName: row.author_name || 'Unknown',
    body: row.body,
    createdAt: row.created_at,
  };
}

// "24 Oct - 31 Oct 2026", or '' for an issue with no period.
export function periodLabel(issue) {
  const fmt = (d, withYear) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      ...(withYear ? { year: 'numeric' } : {}),
      timeZone: 'UTC',
    });
  if (issue.periodStart && issue.periodEnd) return `${fmt(issue.periodStart, false)} - ${fmt(issue.periodEnd, true)}`;
  if (issue.periodStart) return `From ${fmt(issue.periodStart, true)}`;
  return '';
}

export async function isNewsEditor() {
  const { data, error } = await supabase.rpc('is_news_editor');
  if (error) return false;
  return Boolean(data);
}

// Newest first. Drafts come back only for an editor (RLS).
export async function getIssues({ limit = 20, before } = {}) {
  let query = supabase.from(ISSUES).select('*').order('created_at', { ascending: false }).limit(limit);
  if (before) query = query.lt('created_at', before);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data.map(toIssue);
}

export async function getIssue(id) {
  const { data, error } = await supabase.from(ISSUES).select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toIssue(data) : null;
}

// How many articles each issue holds, as a Map<issueId, count>.
export async function getArticleCounts(issueIds) {
  const ids = [...new Set(issueIds)].filter(Boolean);
  const counts = new Map();
  if (!ids.length) return counts;
  const { data, error } = await supabase.from(ARTICLES).select('issue_id').in('issue_id', ids);
  if (error) throw new Error(error.message);
  data.forEach((row) => counts.set(row.issue_id, (counts.get(row.issue_id) || 0) + 1));
  return counts;
}

export async function getArticles(issueId) {
  const { data, error } = await supabase
    .from(ARTICLES)
    .select('*')
    .eq('issue_id', issueId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data.map(toArticle);
}

export async function getArticle(id) {
  const { data, error } = await supabase.from(ARTICLES).select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toArticle(data) : null;
}

function issueRow(fields) {
  return {
    title: fields.title.trim(),
    summary: (fields.summary || '').trim(),
    cover_url: (fields.coverUrl || '').trim(),
    period_start: fields.periodStart || null,
    period_end: fields.periodEnd || null,
    published: fields.published !== false,
  };
}

export async function createIssue(uid, fields) {
  const { data, error } = await supabase
    .from(ISSUES)
    .insert({ ...issueRow(fields), created_by: uid })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return toIssue(data);
}

export async function updateIssue(id, fields) {
  const { error } = await supabase.from(ISSUES).update(issueRow(fields)).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteIssue(id) {
  const { error } = await supabase.from(ISSUES).delete().eq('id', id);
  if (error) throw new Error(error.message);
}

function articleRow(fields) {
  return {
    title: fields.title.trim(),
    lead: (fields.lead || '').trim(),
    body: (fields.body || '').trim(),
    image_url: (fields.imageUrl || '').trim(),
    source_name: (fields.sourceName || '').trim(),
    source_url: (fields.sourceUrl || '').trim(),
    position: Number.isFinite(fields.position) ? fields.position : 0,
  };
}

export async function createArticle(issueId, uid, fields) {
  const { data, error } = await supabase
    .from(ARTICLES)
    .insert({ ...articleRow(fields), issue_id: issueId, author_id: uid })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return toArticle(data);
}

export async function updateArticle(id, fields) {
  const { error } = await supabase.from(ARTICLES).update(articleRow(fields)).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteArticle(id) {
  const { error } = await supabase.from(ARTICLES).delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function hasLikedIssue(userId, issueId) {
  if (!userId) return false;
  const { data, error } = await supabase
    .from('news_likes')
    .select('issue_id')
    .eq('issue_id', issueId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function likeIssue(userId, issueId) {
  const { error } = await supabase.from('news_likes').insert({ issue_id: issueId, user_id: userId });
  if (error) throw new Error(error.message);
}

export async function unlikeIssue(userId, issueId) {
  const { error } = await supabase.from('news_likes').delete().eq('issue_id', issueId).eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export async function getIssueComments(issueId) {
  const { data, error } = await supabase
    .from('news_comments')
    .select('*')
    .eq('issue_id', issueId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data.map(toComment);
}

export async function addIssueComment(issueId, userId, body) {
  const { error } = await supabase.from('news_comments').insert({ issue_id: issueId, user_id: userId, body: body.trim() });
  if (error) throw new Error(error.message);
}

export async function deleteIssueComment(id) {
  const { error } = await supabase.from('news_comments').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// Admin only (the function refuses anyone else).
export async function setNewsEditor(userId, editor) {
  const { error } = await supabase.rpc('admin_set_news_editor', { p_user: userId, p_editor: editor });
  if (error) throw new Error(error.message);
}

export async function getNewsEditorIds() {
  const { data, error } = await supabase.from('news_editors').select('user_id');
  if (error) throw new Error(error.message);
  return new Set(data.map((row) => row.user_id));
}
