import { supabase } from '../lib/supabase';

const EQUIP_COLUMN: Record<string, string> = {
  bg: 'equipped_bg',
  border: 'equipped_border',
  name: 'equipped_name_effect',
};

// Item ids the given user has purchased. owned_items is RLS-restricted to its
// own owner, so this only ever returns rows for the signed-in user.
export async function getOwnedItemIds(userId: string) {
  const { data, error } = await supabase.from('owned_items').select('item_id').eq('user_id', userId);
  if (error) throw new Error(error.message);
  return new Set<string>(data.map((row: any) => row.item_id));
}

// Charges points and records ownership server-side (purchase_item() in
// schema.sql owns the real price list) - resolves with the new balance.
export async function purchaseItem(itemId: string) {
  const { data, error } = await supabase.rpc('purchase_item', { p_item_id: itemId });
  if (error) throw new Error(error.message);
  return data as number;
}

export async function purchaseBundle(bundleId: string) {
  const { data, error } = await supabase.rpc('purchase_bundle', { p_bundle_id: bundleId });
  if (error) throw new Error(error.message);
  return {
    charged: (data as any)?.charged || 0,
    granted: (data as any)?.granted || 0,
    points: (data as any)?.points || 0,
  };
}

// Equips (or un-equips with itemId 'none') a purchased item into one of the
// three cosmetic slots. A database trigger silently reverts this if the item
// isn't actually owned, so this never needs to duplicate that check.
export async function equipItem(userId: string, category: string, itemId: string) {
  const column = EQUIP_COLUMN[category];
  if (!column) throw new Error(`Unknown shop category: ${category}`);
  const { error } = await supabase
    .from('profiles')
    .update({ [column]: itemId })
    .eq('id', userId);
  if (error) throw new Error(error.message);
}

// ---- Achievements (js/points-data.js) ----

export async function getAchievementRecords(userId: string) {
  const { data, error } = await supabase
    .from('unlocked_achievements')
    .select('achievement_id, claimed_at')
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
  return {
    unlocked: new Set<string>(data.map((row: any) => row.achievement_id)),
    claimed: new Set<string>(
      data.filter((row: any) => row.claimed_at).map((row: any) => row.achievement_id)
    ),
  };
}

export const EMPTY_ACHIEVEMENT_RECORDS = {
  unlocked: new Set<string>(),
  claimed: new Set<string>(),
};

// Marks an achievement as permanently earned without paying anything out.
// Eligibility is re-checked server-side.
export async function recordAchievementUnlock(achievementId: string) {
  const { error } = await supabase.rpc('record_achievement_unlock', {
    p_achievement_id: achievementId,
  });
  if (error) throw new Error(error.message);
}

// Pays out the reward exactly once - resolves with the new points balance.
export async function claimAchievement(achievementId: string) {
  const { data, error } = await supabase.rpc('claim_achievement', {
    p_achievement_id: achievementId,
  });
  if (error) throw new Error(error.message);
  return data as number;
}
