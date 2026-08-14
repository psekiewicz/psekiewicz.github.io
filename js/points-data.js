import { supabase } from './supabase-init.js';

// Achievement records for one user, in a single round trip:
//   unlocked — every achievement they've ever earned. This is what makes
//              achievements permanent: the row survives even if the
//              activity behind it goes away (project deleted, likes lost).
//   claimed  — the subset whose points reward has already been paid out.
// Readable for anyone, so a profile page can show someone else's badges.
export async function getAchievementRecords(userId) {
  const { data, error } = await supabase
    .from('unlocked_achievements')
    .select('achievement_id, claimed_at')
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
  return {
    unlocked: new Set(data.map((row) => row.achievement_id)),
    claimed: new Set(data.filter((row) => row.claimed_at).map((row) => row.achievement_id)),
  };
}

export const EMPTY_ACHIEVEMENT_RECORDS = { unlocked: new Set(), claimed: new Set() };

// Marks an achievement as permanently earned without paying anything out.
// Eligibility is re-checked server-side, so this can't be used to hand
// yourself a badge. Safe to call for something already recorded — it's a
// no-op then.
export async function recordAchievementUnlock(achievementId) {
  const { error } = await supabase.rpc('record_achievement_unlock', { p_achievement_id: achievementId });
  if (error) throw new Error(error.message);
}

// Pays out the reward exactly once (see claim_achievement() in schema.sql)
// — resolves with the caller's new points balance.
export async function claimAchievement(achievementId) {
  const { data, error } = await supabase.rpc('claim_achievement', { p_achievement_id: achievementId });
  if (error) throw new Error(error.message);
  return data;
}
