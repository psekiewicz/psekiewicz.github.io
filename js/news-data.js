import { supabase } from './supabase-init.js';

// News: newsletters and the articles in them (the news_* tables in
// schema.sql). Anyone reads. The newsroom (news editors, whom only an admin
// picks) writes anywhere; anyone else can start a newsletter of their own -
// for points, or free once they're popular - and pick its editors. RLS
// enforces all of it, these functions only shape the rows and throw on error. People like and comment on an article, which
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

// The newsroom, this newsletter's owner, or one of its editors.
export async function canWriteNewsletter(newsletterId) {
  const { data, error } = await supabase.rpc('can_write_newsletter', { p_newsletter: newsletterId });
  if (error) return false;
  return Boolean(data);
}

// Drafts come back only for whoever writes in them (RLS).
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

// --- starting a newsletter of your own -------------------------------------

// Where the signed-in person stands: what a newsletter costs them now (0 once
// they're popular), and whether they can start one at all.
export async function getMyNewsletterTerms() {
  const { data, error } = await supabase.rpc('my_newsletter_terms');
  if (error) throw new Error(error.message);
  return {
    price: data.price,
    popularFollowers: data.popular_followers,
    maxOwned: data.max_owned,
    followers: data.followers,
    owned: data.owned,
    points: data.points,
    cost: data.cost,
    canStart: Boolean(data.can_start),
  };
}

// Pays (unless popular) and creates it, owned by the caller. Returns its id.
export async function startNewsletter(fields) {
  const row = newsletterRow(fields);
  const { data, error } = await supabase.rpc('start_newsletter', {
    p_title: row.title,
    p_summary: row.summary,
    p_cover_url: row.cover_url,
  });
  if (error) throw new Error(error.message);
  if (!row.published) await updateNewsletter(data, fields);
  return data;
}

// --- a newsletter's editors -------------------------------------------------

export async function getNewsletterEditorIds(newsletterId) {
  const { data, error } = await supabase.from('newsletter_editors').select('user_id').eq('newsletter_id', newsletterId);
  if (error) throw new Error(error.message);
  return data.map((row) => row.user_id);
}

export async function addNewsletterEditor(newsletterId, ownerId, userId) {
  const { error } = await supabase
    .from('newsletter_editors')
    .insert({ newsletter_id: newsletterId, user_id: userId, added_by: ownerId });
  if (error) throw new Error(error.message);
}

// The owner removes an editor, or an editor steps down.
export async function removeNewsletterEditor(newsletterId, userId) {
  const { error } = await supabase.from('newsletter_editors').delete().eq('newsletter_id', newsletterId).eq('user_id', userId);
  if (error) throw new Error(error.message);
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

// --- demos in the news ---------------------------------------------------
// A news article that links to a demo on XOXD shows that demo as a card, and
// the demo's page shows the articles that featured it - the two halves of
// XOXD pointing at each other. A link counts in any of its forms: the full
// address, /project?id=… or /project.html?id=….

const DEMO_LINK = /(?:https?:\/\/psekiewicz\.github\.io)?\/project(?:\.html)?\?id=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;

// The demo ids an article's text links to, first mention first.
export function linkedDemoIds(body) {
  const ids = [];
  for (const m of String(body || '').matchAll(DEMO_LINK)) {
    const id = m[1].toLowerCase();
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

// The articles that link to a demo, newest first, with their newsletter's
// name - for "Featured in" on the demo's page.
export async function getArticlesFeaturing(projectId) {
  const { data, error } = await supabase
    .from(ARTICLES)
    .select('id, title, newsletter_id, created_at')
    .ilike('body', `%${projectId}%`)
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) throw new Error(error.message);
  const letterIds = [...new Set(data.map((row) => row.newsletter_id))];
  const letters = new Map();
  if (letterIds.length) {
    const res = await supabase.from(NEWSLETTERS).select('id, title').in('id', letterIds);
    if (res.error) throw new Error(res.error.message);
    res.data.forEach((row) => letters.set(row.id, row.title));
  }
  return data.map((row) => ({ id: row.id, title: row.title, newsletterTitle: letters.get(row.newsletter_id) || '', createdAt: row.created_at }));
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
