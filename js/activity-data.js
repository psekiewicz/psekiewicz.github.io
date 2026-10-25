import { supabase } from './supabase-init.js';
import { ACHIEVEMENTS } from './achievements.js';
import { findItem, RETIRED_ALIASES } from './shop-items.js';

// One person's activity across all of XOXD, newest first: the demos they
// published, the updates they posted, what they commented on (demos and
// news), the achievements they claimed and what they got in the shop. It's
// what a profile's Activity tab shows, so a profile reads as one person doing
// things in one place rather than separate counters per feature.
//
// Everything here is public anyway (each table's RLS lets anyone read it), so
// it's the same list whoever looks; private things - saves, read marks,
// views - are never part of it. The mirror of mobile/src/data/activity.ts.

const PER_KIND = 20;

const ACHIEVEMENT_LABELS = new Map(ACHIEVEMENTS.map((a) => [a.id, a.label]));

async function rows(query) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

async function titlesOf(table, ids) {
  const unique = [...new Set(ids)].filter(Boolean);
  if (!unique.length) return new Map();
  const data = await rows(supabase.from(table).select('id, title').in('id', unique));
  return new Map(data.map((r) => [r.id, r.title]));
}

/**
 * Up to `limit` items, each { kind, at, text, target, detail? }:
 * - kind: 'demo' | 'update' | 'comment' | 'news-comment' | 'achievement' | 'item'
 * - text: what happened, e.g. "Published Pocket Synth"
 * - target: { type: 'project' | 'article' | 'shop' | 'achievements', id? }
 */
export async function getActivity(userId, { limit = 30 } = {}) {
  const recent = (q, col = 'created_at') => q.order(col, { ascending: false }).limit(PER_KIND);
  const [demos, updates, comments, newsComments, claimed, items] = await Promise.all([
    rows(recent(supabase.from('projects').select('id, title, created_at').eq('user_id', userId).eq('published', true).neq('live_url', ''))),
    rows(recent(supabase.from('project_updates').select('project_id, version, created_at').eq('user_id', userId))),
    rows(recent(supabase.from('comments').select('project_id, body, created_at').eq('user_id', userId))),
    rows(recent(supabase.from('news_comments').select('article_id, body, created_at').eq('user_id', userId))),
    rows(recent(supabase.from('unlocked_achievements').select('achievement_id, claimed_at').eq('user_id', userId).not('claimed_at', 'is', null), 'claimed_at')),
    rows(recent(supabase.from('owned_items').select('item_id, purchased_at').eq('user_id', userId), 'purchased_at')),
  ]);

  const [projectTitles, articleTitles] = await Promise.all([
    titlesOf('projects', [...updates, ...comments].map((r) => r.project_id)),
    titlesOf('news_articles', newsComments.map((r) => r.article_id)),
  ]);

  const activity = [
    ...demos.map((r) => ({ kind: 'demo', at: r.created_at, text: `Published ${r.title}`, target: { type: 'project', id: r.id } })),
    ...updates
      .filter((r) => projectTitles.has(r.project_id))
      .map((r) => ({
        kind: 'update',
        at: r.created_at,
        text: `Posted ${r.version ? `${r.version} of ` : 'an update to '}${projectTitles.get(r.project_id)}`,
        target: { type: 'project', id: r.project_id },
      })),
    ...comments
      .filter((r) => projectTitles.has(r.project_id))
      .map((r) => ({
        kind: 'comment',
        at: r.created_at,
        text: `Commented on ${projectTitles.get(r.project_id)}`,
        detail: r.body,
        target: { type: 'project', id: r.project_id },
      })),
    ...newsComments
      .filter((r) => articleTitles.has(r.article_id))
      .map((r) => ({
        kind: 'news-comment',
        at: r.created_at,
        text: `Commented on ${articleTitles.get(r.article_id)}`,
        detail: r.body,
        target: { type: 'article', id: r.article_id },
      })),
    ...claimed
      .filter((r) => ACHIEVEMENT_LABELS.has(r.achievement_id))
      .map((r) => ({
        kind: 'achievement',
        at: r.claimed_at,
        text: `Earned ${ACHIEVEMENT_LABELS.get(r.achievement_id)}`,
        target: { type: 'achievements' },
      })),
    ...items
      .map((r) => ({ row: r, item: findItem(RETIRED_ALIASES[r.item_id] || r.item_id) }))
      .filter(({ item }) => item)
      .map(({ row, item }) => ({ kind: 'item', at: row.purchased_at, text: `Got ${item.label} in the shop`, target: { type: 'shop' } })),
  ];

  return activity.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, limit);
}
