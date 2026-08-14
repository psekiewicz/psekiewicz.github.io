import { ACHIEVEMENTS, unrecordedAchievementIds } from './achievements.js';
import { recordAchievementUnlock } from './points-data.js';
import { levelFromStats } from './levels.js';
import { showAchievementToast, showLevelUpToast, showXpToast } from './toast.js';

// XP and levels are derived rather than stored, so there is nothing on the
// server that says "you just levelled up" — the only way to notice is to
// compare against what this browser last saw. That's what the snapshot
// below is for. It's per-device by nature; the silent-seed rule in
// watchProgress() is what stops a first visit on a new phone from
// congratulating you on everything you already had.
const STORAGE_PREFIX = 'showcase:progress:';

function readSnapshot(userId) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + userId);
    return raw ? JSON.parse(raw) : null;
  } catch {
    // Private mode / storage disabled — behave as if nothing was ever seen,
    // which just means no toasts rather than a broken page.
    return null;
  }
}

function writeSnapshot(userId, snapshot) {
  try {
    localStorage.setItem(STORAGE_PREFIX + userId, JSON.stringify(snapshot));
  } catch {
    // Nothing to do — worst case the next load re-seeds silently.
  }
}

// onAuthChange can fire more than once per page load, and each pass would
// otherwise re-toast the same rewards.
let alreadyRan = false;

export async function watchProgress(userId, stats, records) {
  if (alreadyRan || !userId || !stats) return;
  alreadyRan = true;

  // Recording lives here, not just on the profile page, so achievements
  // become permanent as soon as they're earned — someone who never opens
  // their own profile would otherwise keep losing them when the project
  // behind them is deleted.
  const justEarned = unrecordedAchievementIds(stats, records.unlocked);
  if (justEarned.length) {
    await Promise.all(justEarned.map((id) => recordAchievementUnlock(id).catch(() => {})));
  }

  const unlocked = new Set([...records.unlocked, ...justEarned]);
  const level = levelFromStats(stats);
  const previous = readSnapshot(userId);

  writeSnapshot(userId, { level: level.level, xp: level.xp, achievements: [...unlocked] });

  // First time this browser has seen this account: seed and stay quiet.
  if (!previous) return;

  const previouslyUnlocked = new Set(previous.achievements || []);
  [...unlocked]
    .filter((id) => !previouslyUnlocked.has(id))
    .forEach((id) => {
      const achievement = ACHIEVEMENTS.find((a) => a.id === id);
      if (achievement) showAchievementToast(achievement);
    });

  // A level-up already implies XP was gained, so only one of these fires —
  // two toasts saying the same thing would just be noise.
  if (level.level > (previous.level || 1)) {
    showLevelUpToast(level.level);
  } else if (level.xp > (previous.xp || 0)) {
    showXpToast(level.xp - previous.xp);
  }
}
