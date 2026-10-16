import { Feather } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { isAdmin } from '../data/admin';
import { addUpdate, deleteUpdate, getUpdates, ProjectUpdate } from '../data/updates';
import { timeAgo } from '../lib/utils';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, typography } from '../theme/tokens';
import { Text, TextInput } from './Text';
import { Button } from './ui';

// A project's changelog, under the post: "v0.3 - added the editor". Anyone
// who can see the project reads it; only its owner posts, and the owner or an
// admin can remove an entry - there is no edit, so a history stays a history.
// The app's side of the #updates section on the site's project page.

type Props = {
  projectId: string;
  ownerId: string;
};

export function UpdatesSection({ projectId, ownerId }: Props) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const isOwner = !!user && user.id === ownerId;

  const [updates, setUpdates] = useState<ProjectUpdate[]>([]);
  const [admin, setAdmin] = useState(false);
  const [version, setVersion] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    getUpdates(projectId)
      .then(setUpdates)
      // Before schema.sql has added project_updates there is simply no section.
      .catch(() => setUpdates([]))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    isAdmin(user?.id ?? null)
      .then(setAdmin)
      .catch(() => setAdmin(false));
  }, [user?.id]);

  const submit = async () => {
    if (!user || !body.trim()) return;
    setSending(true);
    setError('');
    try {
      const created = await addUpdate(projectId, user.id, { version, body });
      setUpdates((prev) => [created, ...prev]);
      setVersion('');
      setBody('');
    } catch (e: any) {
      // Kept in the boxes, so nothing typed is lost.
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  const remove = async (update: ProjectUpdate) => {
    try {
      await deleteUpdate(update.id);
      setUpdates((prev) => prev.filter((u) => u.id !== update.id));
    } catch {
      // RLS refused it - nothing to undo locally.
    }
  };

  if (loading) return <ActivityIndicator style={{ marginVertical: space.md }} color={colors.primary} />;
  // Nothing to read and nothing you could post: no section at all, as on the site.
  if (updates.length === 0 && !isOwner) return null;

  const box = {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: colors.border,
    borderRadius: radius.lg,
  };

  return (
    <View style={{ gap: space.md }}>
      <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>
        Updates{updates.length ? ` · ${updates.length}` : ''}
      </Text>

      {isOwner ? (
        <View style={[box, { padding: space.md, gap: space.sm }]}>
          <TextInput
            value={version}
            onChangeText={setVersion}
            placeholder="Version (optional), e.g. v0.3"
            placeholderTextColor={colors.textFaint}
            maxLength={24}
            autoCapitalize="none"
            style={{ color: colors.text, fontSize: 14, paddingVertical: 6 }}
          />
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="What changed?"
            placeholderTextColor={colors.textFaint}
            multiline
            maxLength={2000}
            style={{ color: colors.text, fontSize: 14, minHeight: 60, maxHeight: 160, paddingVertical: 6 }}
          />
          {error ? <Text style={[typography.small, { color: colors.danger }]}>{error}</Text> : null}
          <Button small label="Post update" onPress={submit} loading={sending} disabled={!body.trim()} style={{ alignSelf: 'flex-end' }} />
        </View>
      ) : null}

      {updates.length === 0 ? (
        <Text style={[typography.small, { color: colors.textFaint, textAlign: 'center', paddingVertical: space.sm }]}>
          No updates yet - post the first one when something changes.
        </Text>
      ) : (
        <View style={[box, { overflow: 'hidden' }]}>
          {updates.map((u, i) => {
            const canDelete = !!user && (u.uid === user.id || admin);
            return (
              <View
                key={u.id}
                style={{
                  gap: 4,
                  padding: space.md,
                  borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth * 2,
                  borderTopColor: colors.border,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <Text style={{ color: colors.primaryDeep, fontWeight: '800', fontSize: 13 }}>{u.version || 'Update'}</Text>
                  <Text style={{ color: colors.textFaint, fontSize: 11 }}>{timeAgo(u.createdAt)}</Text>
                  <View style={{ flex: 1 }} />
                  {canDelete ? (
                    <Pressable onPress={() => remove(u)} hitSlop={8} accessibilityLabel="Delete update">
                      <Feather name="trash-2" size={14} color={colors.textFaint} />
                    </Pressable>
                  ) : null}
                </View>
                <Text style={[typography.body, { color: colors.text }]}>{u.body}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
