import { supabase } from '../lib/supabase';

export async function isAdmin(userId: string | null) {
  if (!userId) return false;
  const { data, error } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data && (data as any).is_admin);
}

export async function getUserCount() {
  const { count, error } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true });
  if (error) throw new Error(error.message);
  return count || 0;
}

export type AdminUser = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string;
  isAdmin: boolean;
  bannedUntil: string | null;
  createdAt: string;
};

// Every account, including email and real ban status - only returns anything
// for admins (see admin_list_users() in schema.sql).
export async function listUsersForAdmin(): Promise<AdminUser[]> {
  const { data, error } = await supabase.rpc('admin_list_users');
  if (error) throw new Error(error.message);
  return (data || []).map((row: any) => ({
    id: row.id,
    email: row.email,
    displayName: row.display_name || 'Unknown',
    avatarUrl: row.avatar_url || '',
    isAdmin: row.is_admin,
    bannedUntil: row.banned_until,
    createdAt: row.created_at,
  }));
}

// The three actions below call the admin-actions Edge Function, which is the
// only place the service_role key needed to actually ban/unban/delete a
// Supabase Auth account is ever used. That key must never ship inside a client
// - and an APK is a client that can be unzipped, so this is if anything more
// true here than on the web.
async function callAdminAction(payload: any) {
  const { data, error } = await supabase.functions.invoke('admin-actions', { body: payload });
  if (error) throw new Error(error.message || 'Request failed.');
  if (data && data.error) throw new Error(data.error);
  return data;
}

export async function banUser(targetUserId: string, durationHours: number) {
  return callAdminAction({ action: 'ban', targetUserId, durationHours });
}

export async function unbanUser(targetUserId: string) {
  return callAdminAction({ action: 'unban', targetUserId });
}

// Also used for self-service account deletion (targetUserId === your own id) -
// the Edge Function allows that without requiring admin.
export async function deleteAccount(targetUserId: string) {
  return callAdminAction({ action: 'delete', targetUserId });
}
