import { supabase } from './supabase-init.js';

// Which achievement ids the given user has already claimed (and been paid
// for) — used to show "Claim" vs "Claimed" on profile.html. The
// unlocked_achievements table is RLS-restricted to its own owner, so this
// only ever returns rows for the signed-in user.
export async function getClaimedAchievementIds(userId) {
  const { data, error } = await supabase.from('unlocked_achievements').select('achievement_id').eq('user_id', userId);
  if (error) throw new Error(error.message);
  return new Set(data.map((row) => row.achievement_id));
}

// Re-verifies eligibility server-side and pays out the reward exactly
// once (see claim_achievement() in schema.sql) — resolves with the
// caller's new points balance.
export async function claimAchievement(achievementId) {
  const { data, error } = await supabase.rpc('claim_achievement', { p_achievement_id: achievementId });
  if (error) throw new Error(error.message);
  return data;
}
