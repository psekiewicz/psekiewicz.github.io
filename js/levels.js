// A level is a display of one number — xp — and that number is computed by
// the database, not here (see the user_reputation view in schema.sql).
//
// It used to be computed in this file, from stats that included things you
// could do to yourself: 100 XP per published entry, 10 per comment you
// posted, 1 per view including your own reloads. Ten throwaway entries and
// a refresh loop beat anything anyone actually made. XP now comes only
// from what other people did with your work — distinct viewers, likes,
// comments received, followers — which is both the honest measure and the
// expensive one to fake.
//
// What's left in this module is the curve and the chip: pure functions of
// an xp number, with nothing to keep in sync with the server.

// Each level costs quadratically more than the last, so early levels come
// quickly and later ones stay meaningful: level L starts at 100*(L-1)^2 XP
// (L1 at 0, L2 at 100, L3 at 400, L4 at 900, L5 at 1600...).
const LEVEL_CONSTANT = 100;

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

// Convenience for callers that already hold a stats object from
// getUserStats() — `xp` on it is the server's number, carried through
// untouched.
export function levelFromStats(stats) {
  return levelFromXp(stats ? stats.xp : 0);
}

// The compact "Lv 7" chip shown next to a name. `size` is 'sm' next to
// inline names (cards, comments, navbar) and '' on the profile header.
export function levelChipHtml(level, size = '') {
  return `<span class="level-chip${size ? ' level-chip-' + size : ''}" title="Level ${level}">Lv ${level}</span>`;
}

// Levels for a whole page of authors (project cards, comment lists) in a
// single query — it used to take four, one per activity number, and then
// a fifth for likes once the project ids were known. Returns a
// Map<userId, levelInfo> shaped exactly like levelFromXp's result.
// The reputation module is imported dynamically so that everything above —
// the curve and the chip, which card rendering uses — stays free of the
// Supabase client and the CDN it loads from. A page that can't reach the
// network still draws its chips from whatever xp it already has.
export async function getLevelsForUsers(userIds) {
  const levels = new Map();
  const { getReputations } = await import('./reputation-data.js');
  const reputations = await getReputations(userIds).catch(() => new Map());
  reputations.forEach((reputation, id) => levels.set(id, levelFromXp(reputation.xp)));
  return levels;
}
