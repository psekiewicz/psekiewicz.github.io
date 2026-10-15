import { supabase } from '../lib/supabase';

// Reputation is what other people did with your work. Everything the
// progression system runs on comes from the `user_reputation` view in
// schema.sql - one row per account, aggregates only, publicly readable.
// The weights that turn those counts into XP and points live in the view, not
// here: the client can't be the authority on what a like is worth.
const VIEW = 'user_reputation';

const BASE_COLUMNS =
  'user_id, published_projects, total_views, unique_viewers, likes_received, comments_received, followers, xp, lifetime_points';
const FULL_COLUMNS = `${BASE_COLUMNS}, releases, demo_projects`;

// releases and demo_projects arrived with project updates. A database that has
// not re-run schema.sql since would reject the whole select for naming them,
// and with it every level chip - so the first rejection that names one drops
// back to the columns that always existed, and stays there. Same as
// js/reputation-data.js.
let columns = FULL_COLUMNS;

async function selectReputation<T>(build: (q: any) => PromiseLike<{ data: T; error: any }>): Promise<T> {
  const { data, error } = await build(supabase.from(VIEW).select(columns));
  if (error && columns === FULL_COLUMNS && /releases|demo_projects/.test(error.message || '')) {
    columns = BASE_COLUMNS;
    return selectReputation(build);
  }
  if (error) throw new Error(error.message);
  return data;
}

export type Reputation = {
  userId: string;
  publishedProjects: number;
  totalViews: number;
  uniqueViewers: number;
  likesReceived: number;
  commentsReceived: number;
  followers: number;
  xp: number;
  lifetimePoints: number;
  releases: number;
  demoProjects: number;
};

export const EMPTY_REPUTATION: Reputation = {
  userId: '',
  publishedProjects: 0,
  totalViews: 0,
  uniqueViewers: 0,
  likesReceived: 0,
  commentsReceived: 0,
  followers: 0,
  xp: 0,
  lifetimePoints: 0,
  releases: 0,
  demoProjects: 0,
};

function toPlainReputation(row: any): Reputation {
  return {
    userId: row.user_id,
    publishedProjects: row.published_projects || 0,
    totalViews: row.total_views || 0,
    uniqueViewers: row.unique_viewers || 0,
    likesReceived: row.likes_received || 0,
    commentsReceived: row.comments_received || 0,
    followers: row.followers || 0,
    xp: row.xp || 0,
    lifetimePoints: row.lifetime_points || 0,
    releases: row.releases || 0,
    demoProjects: row.demo_projects || 0,
  };
}

export async function getReputation(userId: string | null) {
  if (!userId) return { ...EMPTY_REPUTATION };
  const data = await selectReputation<any>((q) => q.eq('user_id', userId).maybeSingle());
  return data ? toPlainReputation(data) : { ...EMPTY_REPUTATION, userId };
}

// Reputation for a whole page of authors in one round trip.
export async function getReputations(userIds: string[]) {
  const uniqueIds = [...new Set(userIds)].filter(Boolean);
  const map = new Map<string, Reputation>();
  if (uniqueIds.length === 0) return map;
  const data = await selectReputation<any[]>((q) => q.in('user_id', uniqueIds));
  (data || []).forEach((row: any) => map.set(row.user_id, toPlainReputation(row)));
  // Accounts with no row yet still get an entry, so callers never have to
  // special-case a missing key.
  uniqueIds.forEach((id) => {
    if (!map.has(id)) map.set(id, { ...EMPTY_REPUTATION, userId: id });
  });
  return map;
}

export async function getTopByXp(limit = 50) {
  const data = await selectReputation<any[]>((q) => q.gt('xp', 0).order('xp', { ascending: false }).limit(limit));
  return (data || []).map(toPlainReputation);
}

// Pays out everything earned since the last collect. Server-side: it
// re-derives the figure from the view and tracks a high-water mark, so calling
// it in a loop pays exactly once.
export async function collectEarnings() {
  const { data, error } = await supabase.rpc('collect_earnings');
  if (error) throw new Error(error.message);
  return { paid: (data as any)?.paid || 0, points: (data as any)?.points || 0 };
}
