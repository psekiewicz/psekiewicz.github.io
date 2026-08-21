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

// Every account, including email and real ban status - only returns
// anything for admins (see admin_list_users() in schema.sql).
export async function listUsersForAdmin() {
  const { data, error } = await supabase.rpc('admin_list_users');
  if (error) throw new Error(error.message);
  return data.map((row) => ({
    id: row.id,
    email: row.email,
    displayName: row.display_name || 'Unknown',
    avatarUrl: row.avatar_url || '',
    isAdmin: row.is_admin,
    bannedUntil: row.banned_until,
    createdAt: row.created_at,
  }));
}

// The three actions below call the admin-actions Edge Function, which is
// the only place the service_role key needed to actually ban/unban/delete
// a Supabase Auth account is ever used - that key must never be shipped
// to the browser, so it can't happen client-side. See
// supabase/functions/admin-actions/index.ts and the README for setup.
async function callAdminAction(payload) {
  const { data, error } = await supabase.functions.invoke('admin-actions', { body: payload });
  if (error) throw new Error(error.message || 'Request failed.');
  if (data && data.error) throw new Error(data.error);
  return data;
}

export async function banUser(targetUserId, durationHours) {
  return callAdminAction({ action: 'ban', targetUserId, durationHours });
}

export async function unbanUser(targetUserId) {
  return callAdminAction({ action: 'unban', targetUserId });
}

// Also used for self-service account deletion (targetUserId === your own
// id) - the Edge Function allows that without requiring admin.
export async function deleteAccount(targetUserId) {
  return callAdminAction({ action: 'delete', targetUserId });
}
