import { supabase } from './supabase-init.js';

// News: newsletters and the articles in them (the news_* tables in
// schema.sql). Anyone reads; only news editors write, and only an admin
// decides who is one - RLS enforces all of it, these functions only shape
// the rows and throw on error. People like and comment on an article, which
// earns nobody XP, and each reader's "read" marks are their own: kept in
// news_reads when signed in, in this browser otherwise. The mirror of
// mobile/src/data/news.ts.

const NEWSLETTERS = 'newsletters';
const ARTICLES = 'news_articles';

function toNewsletter(row) {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary || '',
    coverUrl: row.cover_url || '',
    createdBy: row.created_by,
    published: Boolean(row.published),
    createdAt: row.created_at,
  };
}

function toArticle(row) {
  return {
    id: row.id,
    newsletterId: row.newsletter_id,
    authorId: row.author_id,
    authorName: row.author_name || 'Unknown',
    title: row.title,
    lead: row.lead || '',
    body: row.body || '',
    imageUrl: row.image_url || '',
    sourceName: row.source_name || '',
    sourceUrl: row.source_url || '',
    likesCount: row.likes_count || 0,
    commentsCount: row.comments_count || 0,
    createdAt: row.created_at,
  };
}

function toComment(row) {
  return {
    id: row.id,
    articleId: row.article_id,
    userId: row.user_id,
    authorName: row.author_name || 'Unknown',
    body: row.body,
    createdAt: row.created_at,
  };
}

// "24 Oct 2026" - the date an article came out.
export function articleDate(article) {
  return new Date(article.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export async function isNewsEditor() {
  const { data, error } = await supabase.rpc('is_news_editor');
  if (error) return false;
  return Boolean(data);
}

// Drafts come back only for an editor (RLS).
export async function getNewsletters() {
  const { data, error } = await supabase.from(NEWSLETTERS).select('*').order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data.map(toNewsletter);
}

export async function getNewsletter(id) {
  const { data, error } = await supabase.from(NEWSLETTERS).select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toNewsletter(data) : null;
}

// Every article id per newsletter, newest first, as a Map<newsletterId, ids[]>
// - enough to count them and to tell how many a reader hasn't opened.
export async function getArticleIdsByNewsletter(newsletterIds) {
  const ids = [...new Set(newsletterIds)].filter(Boolean);
  const byLetter = new Map(ids.map((id) => [id, []]));
  if (!ids.length) return byLetter;
  const { data, error } = await supabase
    .from(ARTICLES)
    .select('id, newsletter_id')
    .in('newsletter_id', ids)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  data.forEach((row) => byLetter.get(row.newsletter_id)?.push(row.id));
  return byLetter;
}

// Newest first.
export async function getArticles(newsletterId) {
  const { data, error } = await supabase
    .from(ARTICLES)
    .select('*')
    .eq('newsletter_id', newsletterId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data.map(toArticle);
}

export async function getArticle(id) {
  const { data, error } = await supabase.from(ARTICLES).select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toArticle(data) : null;
}

function newsletterRow(fields) {
  return {
    title: fields.title.trim(),
    summary: (fields.summary || '').trim(),
    cover_url: (fields.coverUrl || '').trim(),
    published: fields.published !== false,
  };
}

export async function createNewsletter(uid, fields) {
  const { data, error } = await supabase
    .from(NEWSLETTERS)
    .insert({ ...newsletterRow(fields), created_by: uid })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return toNewsletter(data);
}

export async function updateNewsletter(id, fields) {
  const { error } = await supabase.from(NEWSLETTERS).update(newsletterRow(fields)).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteNewsletter(id) {
  const { error } = await supabase.from(NEWSLETTERS).delete().eq('id', id);
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
  };
}

export async function createArticle(newsletterId, uid, fields) {
  const { data, error } = await supabase
    .from(ARTICLES)
    .insert({ ...articleRow(fields), newsletter_id: newsletterId, author_id: uid })
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

// --- read marks ---------------------------------------------------------
// Signed in, they live in news_reads and follow the reader to the app; a
// guest's stay in this browser only.

const GUEST_READS_KEY = 'xoxd.newsReads';

function guestReads() {
  try {
    const ids = JSON.parse(localStorage.getItem(GUEST_READS_KEY) || '[]');
    return new Set(Array.isArray(ids) ? ids : []);
  } catch {
    return new Set();
  }
}

// The ids among `articleIds` that this reader has opened.
export async function getReadIds(userId, articleIds) {
  const ids = [...new Set(articleIds)].filter(Boolean);
  if (!ids.length) return new Set();
  if (!userId) {
    const read = guestReads();
    return new Set(ids.filter((id) => read.has(id)));
  }
  const { data, error } = await supabase.from('news_reads').select('article_id').in('article_id', ids);
  if (error) throw new Error(error.message);
  return new Set(data.map((row) => row.article_id));
}

export async function markRead(userId, articleId) {
  if (!userId) {
    const read = guestReads();
    read.add(articleId);
    try {
      localStorage.setItem(GUEST_READS_KEY, JSON.stringify([...read]));
    } catch {
      // Private mode or full storage: the mark just isn't kept.
    }
    return;
  }
  const { error } = await supabase
    .from('news_reads')
    .upsert({ user_id: userId, article_id: articleId }, { onConflict: 'user_id,article_id', ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}

// --- reactions ----------------------------------------------------------

export async function hasLikedArticle(userId, articleId) {
  if (!userId) return false;
  const { data, error } = await supabase
    .from('news_likes')
    .select('article_id')
    .eq('article_id', articleId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function likeArticle(userId, articleId) {
  const { error } = await supabase.from('news_likes').insert({ article_id: articleId, user_id: userId });
  if (error) throw new Error(error.message);
}

export async function unlikeArticle(userId, articleId) {
  const { error } = await supabase.from('news_likes').delete().eq('article_id', articleId).eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export async function getArticleComments(articleId) {
  const { data, error } = await supabase
    .from('news_comments')
    .select('*')
    .eq('article_id', articleId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data.map(toComment);
}

export async function addArticleComment(articleId, userId, body) {
  const { error } = await supabase.from('news_comments').insert({ article_id: articleId, user_id: userId, body: body.trim() });
  if (error) throw new Error(error.message);
}

export async function deleteArticleComment(id) {
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
