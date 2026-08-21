import { supabase } from './supabase-init.js';

const EQUIP_COLUMN = {
  bg: 'equipped_bg',
  border: 'equipped_border',
  name: 'equipped_name_effect',
};

// Item ids the given user has purchased. owned_items is RLS-restricted to
// its own owner, so this only ever returns rows for the signed-in user.
export async function getOwnedItemIds(userId) {
  const { data, error } = await supabase.from('owned_items').select('item_id').eq('user_id', userId);
  if (error) throw new Error(error.message);
  return new Set(data.map((row) => row.item_id));
}

// Charges points and records ownership server-side (see purchase_item()
// in schema.sql, which owns the real price list) - resolves with the
// caller's new points balance.
export async function purchaseItem(itemId) {
  const { data, error } = await supabase.rpc('purchase_item', { p_item_id: itemId });
  if (error) throw new Error(error.message);
  return data;
}

// Buys a whole set and returns { charged, granted, points }.
// purchase_bundle() in schema.sql owns both the set's price and its
// contents, and works out what to charge from the members the caller
// doesn't already have - so a set is never a worse deal than buying
// what's left of it one item at a time.
export async function purchaseBundle(bundleId) {
  const { data, error } = await supabase.rpc('purchase_bundle', { p_bundle_id: bundleId });
  if (error) throw new Error(error.message);
  return { charged: data?.charged || 0, granted: data?.granted || 0, points: data?.points || 0 };
}

// Equips (or un-equips with itemId 'none') a purchased item into one of
// the three cosmetic slots. A database trigger (prevent_unowned_equip in
// schema.sql) silently reverts this if itemId isn't 'none' and isn't
// actually owned, so this never needs to duplicate that ownership check.
export async function equipItem(userId, category, itemId) {
  const column = EQUIP_COLUMN[category];
  if (!column) throw new Error(`Unknown shop category: ${category}`);
  const { error } = await supabase
    .from('profiles')
    .update({ [column]: itemId })
    .eq('id', userId);
  if (error) throw new Error(error.message);
}
