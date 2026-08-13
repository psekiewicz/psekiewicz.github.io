import { supabase } from './supabase-init.js';

export async function isAdmin(userId) {
  if (!userId) return false;
  const { data, error } = await supabase.from('profiles').select('is_admin').eq('id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data && data.is_admin);
}

export async function getUserCount() {
  const { count, error } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
  if (error) throw new Error(error.message);
  return count || 0;
}
