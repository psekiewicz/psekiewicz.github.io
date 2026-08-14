// Levels are derived, never stored: XP is recomputed from the same
// activity numbers the achievements system already reads (published
// projects, likes received, comments posted, followers, views). That means
// a level can never drift out of sync with reality, there's nothing extra
// to migrate, and there's no XP column anyone could forge from the browser
// console — the underlying counts all come from RLS-protected tables.
//
// The trade-off, by design: XP can only ever reflect measurable activity.
// There's no way to hand out a one-off bonus (an event, a manual reward)
// without giving XP a table of its own.

export const XP_WEIGHTS = {
  publishedProject: 100,
  likeReceived: 25,
  followerGained: 40,
  commentPosted: 10,
  viewReceived: 1,
};

// Each level costs quadratically more than the last, so early levels come
// quickly and later ones stay meaningful: level L starts at 100*(L-1)^2 XP
// (L1 at 0, L2 at 100, L3 at 400, L4 at 900, L5 at 1600...).
const LEVEL_CONSTANT = 100;

export function computeXp(stats) {
  if (!stats) return 0;
  return Math.round(
    (stats.projectsPublished || 0) * XP_WEIGHTS.publishedProject +
      (stats.totalLikes || 0) * XP_WEIGHTS.likeReceived +
      (stats.followerCount || 0) * XP_WEIGHTS.followerGained +
      (stats.totalComments || 0) * XP_WEIGHTS.commentPosted +
      (stats.totalViews || 0) * XP_WEIGHTS.viewReceived
  );
}

export function xpForLevel(level) {
  return LEVEL_CONSTANT * (level - 1) ** 2;
}

// Full progress breakdown for one XP total — everything the profile's
// progress bar needs, so the page never has to redo this arithmetic.
export function levelFromXp(xp) {
  const total = Math.max(0, Math.round(xp || 0));
  const level = Math.floor(Math.sqrt(total / LEVEL_CONSTANT)) + 1;
  const currentLevelXp = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  const span = nextLevelXp - currentLevelXp;
  const into = total - currentLevelXp;
  return {
    level,
    xp: total,
    xpIntoLevel: into,
    xpForNextLevel: span,
    xpToNextLevel: nextLevelXp - total,
    // Guarded against a zero span so the bar can never render NaN width.
    progress: span > 0 ? Math.min(1, into / span) : 0,
  };
}

export function levelFromStats(stats) {
  return levelFromXp(computeXp(stats));
}

// The compact "Lv 7" chip shown next to a name. `size` is 'sm' next to
// inline names (cards, comments, navbar) and '' on the profile header.
export function levelChipHtml(level, size = '') {
  return `<span class="level-chip${size ? ' level-chip-' + size : ''}" title="Level ${level}">Lv ${level}</span>`;
}

// Levels for a whole page of authors (project cards, comment lists) using a
// fixed four queries no matter how many users are passed in — the whole
// reason the batch helpers in the *-data modules exist. Returns a
// Map<userId, levelInfo> shaped exactly like levelFromXp's result.
//
// Note this deliberately only gathers the five activity numbers XP is made
// of, not the full achievement stat set: nothing here needs account age,
// profile completeness or shop ownership, and skipping them keeps this to
// four queries instead of six.
export async function getLevelsForUsers(userIds) {
  const uniqueIds = [...new Set(userIds)].filter(Boolean);
  const levels = new Map();
  if (uniqueIds.length === 0) return levels;

  const [{ getPublishedProjectsByUsers }, { getLikeCounts }, { getCommentCountsByUsers }, { getFollowerCounts }] =
    await Promise.all([
      import('./projects-data.js'),
      import('./likes-data.js'),
      import('./comments-data.js'),
      import('./follows-data.js'),
    ]);

  const [projectsByUser, commentCounts, followerCounts] = await Promise.all([
    getPublishedProjectsByUsers(uniqueIds).catch(() => new Map()),
    getCommentCountsByUsers(uniqueIds).catch(() => new Map()),
    getFollowerCounts(uniqueIds).catch(() => new Map()),
  ]);

  const allProjectIds = [...projectsByUser.values()].flat().map((p) => p.id);
  const likeCounts = allProjectIds.length ? await getLikeCounts(allProjectIds).catch(() => new Map()) : new Map();

  uniqueIds.forEach((id) => {
    const projects = projectsByUser.get(id) || [];
    levels.set(
      id,
      levelFromStats({
        projectsPublished: projects.length,
        totalViews: projects.reduce((sum, p) => sum + p.viewsCount, 0),
        totalLikes: projects.reduce((sum, p) => sum + (likeCounts.get(p.id) || 0), 0),
        totalComments: commentCounts.get(id) || 0,
        followerCount: followerCounts.get(id) || 0,
      })
    );
  });

  return levels;
}
