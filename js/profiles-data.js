import { supabase } from './supabase-init.js';

const TABLE = 'profiles';

function toPlainProfile(row) {
  return {
    id: row.id,
    displayName: row.display_name || 'Unknown',
    bio: row.bio || '',
    avatarUrl: row.avatar_url || '',
    createdAt: row.created_at,
  };
}

export async function getProfile(userId) {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return toPlainProfile(data);
}

export async function updateProfile(userId, fields) {
  const { data, error } = await supabase
    .from(TABLE)
    .update({
      display_name: fields.displayName,
      bio: fields.bio,
      avatar_url: fields.avatarUrl,
    })
    .eq('id', userId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return toPlainProfile(data);
}
