import { supabase } from '../lib/supabase';

const TABLE = 'push_tokens';

// Idempotent by design (user_id, token) is the primary key - registering
// the same device twice (e.g. on every app launch) is a harmless no-op
// rather than a duplicate row.
export async function registerPushToken(userId: string, token: string) {
  const { error } = await supabase.from(TABLE).upsert({ user_id: userId, token }, { onConflict: 'user_id,token' });
  if (error) throw new Error(error.message);
}

export async function unregisterPushToken(userId: string, token: string) {
  const { error } = await supabase.from(TABLE).delete().eq('user_id', userId).eq('token', token);
  if (error) throw new Error(error.message);
}
