import { ACHIEVEMENTS, unrecordedAchievementIds, getUserStats } from './achievements.js';
import { recordAchievementUnlock, getAchievementRecords, EMPTY_ACHIEVEMENT_RECORDS } from './points-data.js';
import { levelFromStats } from './levels.js';
import { showAchievementToast, showLevelUpToast, showXpToast } from './toast.js';

// XP and levels are derived rather than stored, so there is nothing on the
// server that says "you just levelled up" — the only way to notice is to
// compare against what this browser last saw. That's what the snapshot
// below is for. It's per-device by nature; the silent-seed rule in
// runCheck() is what stops a first visit on a new phone from
// congratulating you on everything you already had.
const STORAGE_PREFIX = 'showcase:progress:';

// Fired after every check so the navbar can refresh the level chip without
// re-querying — carries { stats, records }.
export const PROGRESS_EVENT = 'showcase:progress';

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
    // Nothing to do — worst case the next check re-seeds silently.
  }
}

let currentUserId = null;
let inFlight = false;

async function runCheck(userId, stats, records) {
  if (!userId || !stats) return;

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

  document.dispatchEvent(new CustomEvent(PROGRESS_EVENT, { detail: { stats, records } }));

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

// Re-checks progress from scratch. Call this after anything that can change
// your own XP — publishing a project, posting a comment, claiming an
// achievement — otherwise the check only ever happens on page load and the
// reward doesn't show up until you navigate somewhere else.
export async function refreshProgress() {
  if (!currentUserId || inFlight) return;
  inFlight = true;
  try {
    const [stats, records] = await Promise.all([
      getUserStats(currentUserId),
      getAchievementRecords(currentUserId).catch(() => EMPTY_ACHIEVEMENT_RECORDS),
    ]);
    await runCheck(currentUserId, stats, records);
  } catch {
    // A failed refresh is not worth surfacing — the next one will catch up.
  } finally {
    inFlight = false;
  }
}

let listenersBound = false;

export async function watchProgress(userId, stats, records) {
  currentUserId = userId;

  if (!listenersBound) {
    listenersBound = true;
    // Covers rewards earned while you were elsewhere — someone liking your
    // project, or a new follower — without polling for them.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refreshProgress();
    });
    // Back/forward out of the bfcache doesn't re-run page scripts.
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) refreshProgress();
    });
  }

  if (inFlight) return;
  inFlight = true;
  try {
    await runCheck(userId, stats, records);
  } finally {
    inFlight = false;
  }
}
