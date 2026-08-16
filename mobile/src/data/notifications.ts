import { supabase } from '../lib/supabase';

const TABLE = 'notifications';

export type Notification = {
  id: string;
  actorId: string;
  type: string;
  projectId: string | null;
  createdAt: string;
  read: boolean;
};

function toPlainNotification(row: any): Notification {
  return {
    id: row.id,
    actorId: row.actor_id,
    type: row.type,
    projectId: row.project_id,
    createdAt: row.created_at,
    read: Boolean(row.read_at),
  };
}

// RLS restricts this to the signed-in user's own rows.
export async function getNotifications(limit = 30) {
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
