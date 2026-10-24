import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '../lib/supabase';
import type { Comment } from './comments';

// News: newsletters and the articles in them (the news_* tables in
// schema.sql). Anyone reads; only news editors write, and only an admin
// decides who is one - RLS enforces it, this only shapes rows. People like
// and comment on an article, which earns nobody XP, and each reader's "read"
// marks are their own: kept in news_reads when signed in, on this device
// otherwise. The mirror of js/news-data.js.

const NEWSLETTERS = 'newsletters';
const ARTICLES = 'news_articles';

export type Newsletter = {
  id: string;
  title: string;
  summary: string;
  coverUrl: string;
  createdBy: string | null;
  published: boolean;
  createdAt: string;
};

export type NewsArticle = {
  id: string;
  newsletterId: string;
  authorId: string | null;
  authorName: string;
  title: string;
  lead: string;
  body: string;
  imageUrl: string;
  sourceName: string;
  sourceUrl: string;
  likesCount: number;
  commentsCount: number;
  createdAt: string;
};

export type NewsletterFields = {
  title: string;
  summary?: string;
  coverUrl?: string;
  published?: boolean;
};

export type ArticleFields = {
  title: string;
  lead?: string;
  body?: string;
  imageUrl?: string;
  sourceName?: string;
  sourceUrl?: string;
};

function toNewsletter(row: any): Newsletter {
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

function toArticle(row: any): NewsArticle {
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

// Shaped like a project comment, so CommentsSection can draw either.
function toComment(row: any): Comment {
  return {
    id: row.id,
    projectId: row.article_id,
    userId: row.user_id,
    authorName: row.author_name || 'Unknown',
    body: row.body,
    createdAt: row.created_at,
  };
}

/** "24 Oct 2026" - the date an article came out. */
export function articleDate(article: Pick<NewsArticle, 'createdAt'>) {
  return new Date(article.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export async function isNewsEditor() {
  const { data, error } = await supabase.rpc('is_news_editor');
  if (error) return false;
  return Boolean(data);
}

/** Drafts come back only for an editor (RLS). */
export async function getNewsletters() {
  const { data, error } = await supabase.from(NEWSLETTERS).select('*').order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map(toNewsletter);
}

export async function getNewsletter(id: string) {
  const { data, error } = await supabase.from(NEWSLETTERS).select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toNewsletter(data) : null;
}

/** Every article id per newsletter, newest first - to count them and tell how many are unread. */
export async function getArticleIdsByNewsletter(newsletterIds: string[]) {
  const ids = [...new Set(newsletterIds)].filter(Boolean);
  const byLetter = new Map<string, string[]>(ids.map((id) => [id, []]));
  if (!ids.length) return byLetter;
  const { data, error } = await supabase
    .from(ARTICLES)
    .select('id, newsletter_id')
    .in('newsletter_id', ids)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  (data || []).forEach((row: any) => byLetter.get(row.newsletter_id)?.push(row.id));
  return byLetter;
}

/** Newest first. */
export async function getArticles(newsletterId: string) {
  const { data, error } = await supabase
    .from(ARTICLES)
    .select('*')
    .eq('newsletter_id', newsletterId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map(toArticle);
}

export async function getArticle(id: string) {
  const { data, error } = await supabase.from(ARTICLES).select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toArticle(data) : null;
}

function newsletterRow(fields: NewsletterFields) {
  return {
    title: fields.title.trim(),
    summary: (fields.summary || '').trim(),
    cover_url: (fields.coverUrl || '').trim(),
    published: fields.published !== false,
  };
}

export async function createNewsletter(uid: string, fields: NewsletterFields) {
  const { data, error } = await supabase
    .from(NEWSLETTERS)
    .insert({ ...newsletterRow(fields), created_by: uid })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return toNewsletter(data);
}

export async function updateNewsletter(id: string, fields: NewsletterFields) {
  const { error } = await supabase.from(NEWSLETTERS).update(newsletterRow(fields)).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteNewsletter(id: string) {
  const { error } = await supabase.from(NEWSLETTERS).delete().eq('id', id);
  if (error) throw new Error(error.message);
}

function articleRow(fields: ArticleFields) {
  return {
    title: fields.title.trim(),
    lead: (fields.lead || '').trim(),
    body: (fields.body || '').trim(),
    image_url: (fields.imageUrl || '').trim(),
    source_name: (fields.sourceName || '').trim(),
    source_url: (fields.sourceUrl || '').trim(),
  };
}

export async function createArticle(newsletterId: string, uid: string, fields: ArticleFields) {
  const { data, error } = await supabase
    .from(ARTICLES)
    .insert({ ...articleRow(fields), newsletter_id: newsletterId, author_id: uid })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return toArticle(data);
}

export async function updateArticle(id: string, fields: ArticleFields) {
  const { error } = await supabase.from(ARTICLES).update(articleRow(fields)).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteArticle(id: string) {
  const { error } = await supabase.from(ARTICLES).delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// --- read marks ---------------------------------------------------------
// Signed in, they live in news_reads and follow the reader to the site; a
// guest's stay on this device only.

const GUEST_READS_KEY = 'xoxd.newsReads';

async function guestReads() {
  try {
    const ids = JSON.parse((await AsyncStorage.getItem(GUEST_READS_KEY)) || '[]');
    return new Set<string>(Array.isArray(ids) ? ids : []);
  } catch {
    return new Set<string>();
  }
}

/** The ids among `articleIds` that this reader has opened. */
export async function getReadIds(userId: string | null | undefined, articleIds: string[]) {
  const ids = [...new Set(articleIds)].filter(Boolean);
  if (!ids.length) return new Set<string>();
  if (!userId) {
    const read = await guestReads();
    return new Set(ids.filter((id) => read.has(id)));
  }
  const { data, error } = await supabase.from('news_reads').select('article_id').in('article_id', ids);
  if (error) throw new Error(error.message);
  return new Set<string>((data || []).map((row: any) => row.article_id));
}

export async function markRead(userId: string | null | undefined, articleId: string) {
  if (!userId) {
    const read = await guestReads();
    read.add(articleId);
    await AsyncStorage.setItem(GUEST_READS_KEY, JSON.stringify([...read])).catch(() => {});
    return;
  }
  const { error } = await supabase
    .from('news_reads')
    .upsert({ user_id: userId, article_id: articleId }, { onConflict: 'user_id,article_id', ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}

// --- reactions ----------------------------------------------------------

export async function hasLikedArticle(userId: string | null, articleId: string) {
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

export async function likeArticle(userId: string, articleId: string) {
  const { error } = await supabase.from('news_likes').insert({ article_id: articleId, user_id: userId });
  if (error) throw new Error(error.message);
}

export async function unlikeArticle(userId: string, articleId: string) {
  const { error } = await supabase.from('news_likes').delete().eq('article_id', articleId).eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export async function getArticleComments(articleId: string) {
  const { data, error } = await supabase
    .from('news_comments')
    .select('*')
    .eq('article_id', articleId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map(toComment);
}

// The signature CommentsSection calls (authorName is set by the database).
export async function addArticleComment(articleId: string, userId: string, _authorName: string, body: string) {
  const { data, error } = await supabase
    .from('news_comments')
    .insert({ article_id: articleId, user_id: userId, body: body.trim() })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return toComment(data);
}

export async function deleteArticleComment(id: string) {
  const { error } = await supabase.from('news_comments').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Admin only (the function refuses anyone else). */
export async function setNewsEditor(userId: string, editor: boolean) {
  const { error } = await supabase.rpc('admin_set_news_editor', { p_user: userId, p_editor: editor });
  if (error) throw new Error(error.message);
}

export async function getNewsEditorIds() {
  const { data, error } = await supabase.from('news_editors').select('user_id');
  if (error) throw new Error(error.message);
  return new Set<string>((data || []).map((row: any) => row.user_id));
}
