import { supabase } from './supabase-init.js';

// Reputation is what other people did with your work: how many distinct
// signed-in people opened your entries, liked them, commented on them, and
// how many follow you. Everything the progression system runs on comes
// from the `user_reputation` view (see schema.sql) - one row per account,
// aggregates only, publicly readable.
//
// The weights that turn those counts into XP and points live in the view,
// not here. The browser can't be the authority on what a like is worth,
// and having a single copy of the formula is what stops the level on a
// profile card disagreeing with the level on the profile page.
const VIEW = 'user_reputation';

const BASE_COLUMNS =
  'user_id, published_projects, total_views, unique_viewers, likes_received, comments_received, followers, xp, lifetime_points';
const FULL_COLUMNS = `${BASE_COLUMNS}, releases, demo_projects`;

// releases and demo_projects arrived with project updates. A site that has
// shipped this file before its database has re-run schema.sql would have the
// whole select rejected for naming a column that is not there yet - and with
// it every level chip and the leaderboard. So the first rejection that names
// one of them drops back to the columns that always existed, and stays there.
let columns = FULL_COLUMNS;

async function selectReputation(build) {
  const { data, error } = await build(supabase.from(VIEW).select(columns));
  if (error && columns === FULL_COLUMNS && /releases|demo_projects/.test(error.message)) {
    columns = BASE_COLUMNS;
    return selectReputation(build);
  }
  if (error) throw new Error(error.message);
  return data;
}

export const EMPTY_REPUTATION = {
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

function toPlainReputation(row) {
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

export async function getReputation(userId) {
  if (!userId) return { ...EMPTY_REPUTATION };
  const data = await selectReputation((q) => q.eq('user_id', userId).maybeSingle());
  return data ? toPlainReputation(data) : { ...EMPTY_REPUTATION, userId };
}

// Reputation for a whole page of authors in one round trip. This is the
// query that used to be four (projects + likes + comments + follows) per
// page, which is why levelling a feed of cards was the slowest thing on
// the site. Returns a Map<userId, reputation>.
export async function getReputations(userIds) {
  const uniqueIds = [...new Set(userIds)].filter(Boolean);
  const map = new Map();
  if (uniqueIds.length === 0) return map;
  const data = await selectReputation((q) => q.in('user_id', uniqueIds));
  data.forEach((row) => map.set(row.user_id, toPlainReputation(row)));
  // Accounts with no row yet (nothing published) still get an entry, so
  // callers never have to special-case a missing key.
  uniqueIds.forEach((id) => {
    if (!map.has(id)) map.set(id, { ...EMPTY_REPUTATION, userId: id });
  });
  return map;
}

// The top of the leaderboard, ranked by the server rather than by pulling
// every profile and sorting in the browser.
export async function getTopByXp(limit = 50) {
  const data = await selectReputation((q) => q.gt('xp', 0).order('xp', { ascending: false }).limit(limit));
  return data.map(toPlainReputation);
}

// Pays out everything earned since the last collect and returns
// { paid, points }. Server-side (see collect_earnings() in schema.sql):
// it re-derives the figure from the view and tracks a high-water mark, so
// calling it in a loop pays exactly once and a withdrawn like never claws
// back points that may already have been spent.
export async function collectEarnings() {
  const { data, error } = await supabase.rpc('collect_earnings');
  if (error) throw new Error(error.message);
  return { paid: data?.paid || 0, points: data?.points || 0 };
}
