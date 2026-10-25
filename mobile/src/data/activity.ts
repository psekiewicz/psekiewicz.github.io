import { ACHIEVEMENTS } from '../lib/achievements';
import { findItem, RETIRED_ALIASES } from '../lib/shopItems';
import { supabase } from '../lib/supabase';

// One person's activity across all of XOXD, newest first: the demos they
// published, the updates they posted, what they commented on (demos and
// news), the achievements they claimed and what they got in the shop - a
// profile's Activity tab. Everything here is public anyway (each table's RLS
// lets anyone read it); saves, read marks and views never appear. The mirror
// of js/activity-data.js.

const PER_KIND = 20;

const ACHIEVEMENT_LABELS = new Map(ACHIEVEMENTS.map((a) => [a.id, a.label]));

export type ActivityKind = 'demo' | 'update' | 'comment' | 'news-comment' | 'achievement' | 'item';

export type ActivityTarget =
  | { type: 'project'; id: string }
  | { type: 'article'; id: string }
  | { type: 'shop' }
  | { type: 'achievements' };

export type Activity = { kind: ActivityKind; at: string; text: string; detail?: string; target: ActivityTarget };

async function rows(query: PromiseLike<{ data: any[] | null; error: any }>) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

async function titlesOf(table: string, ids: string[]) {
  const unique = [...new Set(ids)].filter(Boolean);
  if (!unique.length) return new Map<string, string>();
  const data = await rows(supabase.from(table).select('id, title').in('id', unique));
  return new Map<string, string>(data.map((r: any) => [r.id, r.title]));
}

export async function getActivity(userId: string, { limit = 30 } = {}): Promise<Activity[]> {
  const recent = (q: any, col = 'created_at') => q.order(col, { ascending: false }).limit(PER_KIND);
  const [demos, updates, comments, newsComments, claimed, items] = await Promise.all([
    rows(recent(supabase.from('projects').select('id, title, created_at').eq('user_id', userId).eq('published', true).neq('live_url', ''))),
    rows(recent(supabase.from('project_updates').select('project_id, version, created_at').eq('user_id', userId))),
    rows(recent(supabase.from('comments').select('project_id, body, created_at').eq('user_id', userId))),
    rows(recent(supabase.from('news_comments').select('article_id, body, created_at').eq('user_id', userId))),
    rows(recent(supabase.from('unlocked_achievements').select('achievement_id, claimed_at').eq('user_id', userId).not('claimed_at', 'is', null), 'claimed_at')),
    rows(recent(supabase.from('owned_items').select('item_id, purchased_at').eq('user_id', userId), 'purchased_at')),
  ]);

  const [projectTitles, articleTitles] = await Promise.all([
    titlesOf('projects', [...updates, ...comments].map((r: any) => r.project_id)),
    titlesOf('news_articles', newsComments.map((r: any) => r.article_id)),
  ]);

  const activity: Activity[] = [
    ...demos.map((r: any): Activity => ({ kind: 'demo', at: r.created_at, text: `Published ${r.title}`, target: { type: 'project', id: r.id } })),
    ...updates
      .filter((r: any) => projectTitles.has(r.project_id))
      .map((r: any): Activity => ({
        kind: 'update',
        at: r.created_at,
        text: `Posted ${r.version ? `${r.version} of ` : 'an update to '}${projectTitles.get(r.project_id)}`,
        target: { type: 'project', id: r.project_id },
      })),
    ...comments
      .filter((r: any) => projectTitles.has(r.project_id))
      .map((r: any): Activity => ({
        kind: 'comment',
        at: r.created_at,
        text: `Commented on ${projectTitles.get(r.project_id)}`,
        detail: r.body,
        target: { type: 'project', id: r.project_id },
      })),
    ...newsComments
      .filter((r: any) => articleTitles.has(r.article_id))
      .map((r: any): Activity => ({
        kind: 'news-comment',
        at: r.created_at,
        text: `Commented on ${articleTitles.get(r.article_id)}`,
        detail: r.body,
        target: { type: 'article', id: r.article_id },
      })),
    ...claimed
      .filter((r: any) => ACHIEVEMENT_LABELS.has(r.achievement_id))
      .map((r: any): Activity => ({
        kind: 'achievement',
        at: r.claimed_at,
        text: `Earned ${ACHIEVEMENT_LABELS.get(r.achievement_id)}`,
        target: { type: 'achievements' },
      })),
    ...items.flatMap((r: any): Activity[] => {
      const item = findItem(RETIRED_ALIASES[r.item_id] || r.item_id);
      return item ? [{ kind: 'item', at: r.purchased_at, text: `Got ${item.label} in the shop`, target: { type: 'shop' } }] : [];
    }),
  ];

  return activity.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, limit);
}
