// A level is a display of one number — xp — computed by the database, not
// here (see the user_reputation view in schema.sql). What lives in this module
// is the curve: pure functions of an xp number, with nothing to keep in sync
// with the server.

// Each level costs quadratically more than the last: level L starts at
// 100*(L-1)^2 XP (L1 at 0, L2 at 100, L3 at 400, L4 at 900, L5 at 1600...).
const LEVEL_CONSTANT = 100;

export function xpForLevel(level: number) {
  return LEVEL_CONSTANT * (level - 1) ** 2;
}

export type LevelInfo = {
  level: number;
  xp: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  xpToNextLevel: number;
  progress: number;
};

export function levelFromXp(xp: number): LevelInfo {
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
    // Guarded against a zero span so the bar can never render a NaN width.
    progress: span > 0 ? Math.min(1, into / span) : 0,
  };
}

export function levelFromStats(stats: { xp?: number } | null) {
  return levelFromXp(stats ? stats.xp || 0 : 0);
}

// Levels for a whole page of authors in a single query. The reputation module
// is imported lazily so card rendering stays free of the Supabase client.
export async function getLevelsForUsers(userIds: string[]) {
  const levels = new Map<string, LevelInfo>();
  const { getReputations } = await import('../data/reputation');
  const reputations = await getReputations(userIds).catch(() => new Map());
  reputations.forEach((reputation: any, id: string) =>
    levels.set(id, levelFromXp(reputation.xp))
  );
  return levels;
}
