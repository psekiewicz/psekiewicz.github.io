import { supabase } from './supabase-init.js';

const TABLE = 'notifications';

function toPlainNotification(row) {
  return {
    id: row.id,
    actorId: row.actor_id,
    type: row.type,
    projectId: row.project_id,
    createdAt: row.created_at,
    read: Boolean(row.read_at),
  };
}

// RLS restricts this to the signed-in user's own rows, so there's no need
// to filter by recipient here — and no way to read anyone else's.
export async function getNotifications(limit = 20) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data.map(toPlainNotification);
}

export async function getUnreadCount() {
  const { count, error } = await supabase
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .is('read_at', null);
  if (error) throw new Error(error.message);
  return count || 0;
}

export async function markAllRead() {
  const { error } = await supabase
    .from(TABLE)
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null);
  if (error) throw new Error(error.message);
}
