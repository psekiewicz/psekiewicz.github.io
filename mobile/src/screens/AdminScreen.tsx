import { Feather } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  Avatar,
  Button,
  EmptyState,
  ErrorNote,
  Eyebrow,
  Loading,
  SuccessNote,
  TypeBadge,
} from '../components/ui';
import { useAuth } from '../context/AuthContext';
import {
  AdminUser,
  banUser,
  deleteAccount,
  isAdmin,
  listUsersForAdmin,
  unbanUser,
} from '../data/admin';
import { deleteProject, getAllProjects, Project, togglePublish } from '../data/projects';
import { timeAgo } from '../lib/utils';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, typography } from '../theme/tokens';

export function AdminScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();

  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<'projects' | 'users'>('projects');
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (!user) {
      setAllowed(false);
      setLoading(false);
      return;
    }
    // RLS is what actually gates the data - this check only decides what to
    // draw, and an admin-only query returns nothing for anyone else anyway.
    const ok = await isAdmin(user.id).catch(() => false);
    setAllowed(ok);
    if (!ok) {
      setLoading(false);
      return;
    }
    try {
      const [projectRows, userRows] = await Promise.all([
        getAllProjects().catch(() => []),
        listUsersForAdmin().catch(() => []),
      ]);
      setProjects(projectRows);
      setUsers(userRows);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <Loading />;

  if (!allowed) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <EmptyState
          icon="shield-off"
          title="Not an admin"
          body="This panel is only available to accounts with the admin role."
        />
      </View>
    );
  }

  const q = query.trim().toLowerCase();
  const shownProjects = projects.filter(
    (p) => !q || p.title.toLowerCase().includes(q) || p.authorName.toLowerCase().includes(q)
  );
  const shownUsers = users.filter(
    (u) =>
      !q || u.displayName.toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q)
  );

  const unpublish = async (project: Project) => {
    try {
      await togglePublish(project.id, false);
      setProjects((prev) =>
        prev.map((p) => (p.id === project.id ? { ...p, published: false } : p))
      );
      setNotice(`Unpublished "${project.title}".`);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const removeProject = (project: Project) => {
    Alert.alert('Delete this entry?', `"${project.title}" - this cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteProject(project.id);
            setProjects((prev) => prev.filter((p) => p.id !== project.id));
          } catch (e: any) {
            setError(e.message);
          }
        },
      },
    ]);
  };

  const promptBan = (target: AdminUser) => {
    Alert.alert('Ban this account', `${target.displayName} (${target.email})`, [
      { text: 'Cancel', style: 'cancel' },
      { text: '24 hours', onPress: () => doBan(target, 24) },
      { text: '7 days', onPress: () => doBan(target, 24 * 7) },
      { text: '1 year', style: 'destructive', onPress: () => doBan(target, 24 * 365) },
    ]);
  };

  const doBan = async (target: AdminUser, hours: number) => {
    try {
      await banUser(target.id, hours);
      setNotice(`Banned ${target.displayName}.`);
      load();
    } catch (e: any) {
      setError(`${e.message} - bans need the admin-actions Edge Function deployed.`);
    }
  };

  const doUnban = async (target: AdminUser) => {
    try {
      await unbanUser(target.id);
      setNotice(`Unbanned ${target.displayName}.`);
      load();
    } catch (e: any) {
      setError(`${e.message} - bans need the admin-actions Edge Function deployed.`);
    }
  };

  const removeUser = (target: AdminUser) => {
    Alert.alert(
      'Delete this account?',
      `${target.displayName} (${target.email}) and everything they published. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount(target.id);
              setUsers((prev) => prev.filter((u) => u.id !== target.id));
            } catch (e: any) {
              setError(`${e.message} - deletion needs the admin-actions Edge Function deployed.`);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: space.lg, gap: space.md }}>
        <ErrorNote message={error} />
        <SuccessNote message={notice} />

        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {(['projects', 'users'] as const).map((t) => (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              style={{
                flex: 1,
                paddingVertical: space.sm,
                alignItems: 'center',
                borderBottomWidth: 2,
                borderBottomColor: tab === t ? colors.primary : 'transparent',
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '700',
                  letterSpacing: 0.8,
                  color: tab === t ? colors.primary : colors.textMuted,
                }}
              >
                {t === 'projects' ? `ENTRIES · ${projects.length}` : `USERS · ${users.length}`}
              </Text>
            </Pressable>
          ))}
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.sm,
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: StyleSheet.hairlineWidth * 2,
            borderRadius: radius.sm,
            paddingHorizontal: space.md,
          }}
        >
          <Feather name="search" size={14} color={colors.textFaint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={tab === 'projects' ? 'Search entries' : 'Search accounts'}
            placeholderTextColor={colors.textFaint}
            style={{ flex: 1, color: colors.text, paddingVertical: space.sm, fontSize: 13 }}
          />
        </View>
      </View>

      {tab === 'projects' ? (
        <FlatList
          data={shownProjects}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: space.lg, paddingTop: 0, gap: space.sm, paddingBottom: space.xxl }}
          ListEmptyComponent={<EmptyState icon="package" title="No entries match" />}
          renderItem={({ item }) => (
            <View
              style={{
                padding: space.md,
                borderRadius: radius.sm,
                borderWidth: StyleSheet.hairlineWidth * 2,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                gap: space.sm,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TypeBadge type={item.type} />
                <View style={{ flex: 1 }} />
                <Text
                  style={[
                    typography.eyebrow,
                    { color: item.published ? colors.success : colors.textFaint },
                  ]}
                >
                  {item.published ? 'Live' : 'Draft'}
                </Text>
              </View>

              <Pressable onPress={() => navigation.navigate('ProjectDetail', { projectId: item.id })}>
                <Text style={{ fontWeight: '700', fontSize: 13, color: colors.text }} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={[typography.small, { color: colors.textFaint }]}>
                  {item.authorName} · {timeAgo(item.createdAt)}
                </Text>
              </Pressable>

              <View style={{ flexDirection: 'row', gap: space.sm }}>
                {item.published ? (
                  <Button
                    small
                    label="Unpublish"
                    variant="secondary"
                    style={{ flex: 1 }}
                    onPress={() => unpublish(item)}
                  />
                ) : null}
                <Button
                  small
                  label="Delete"
                  variant="danger"
                  style={{ flex: 1 }}
                  onPress={() => removeProject(item)}
                />
              </View>
            </View>
          )}
        />
      ) : (
        <FlatList
          data={shownUsers}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: space.lg, paddingTop: 0, gap: space.sm, paddingBottom: space.xxl }}
          ListEmptyComponent={
            <EmptyState
              icon="users"
              title="No accounts listed"
              body="The Users tab needs admin_list_users() from schema.sql."
            />
          }
          renderItem={({ item }) => {
            const banned = item.bannedUntil && new Date(item.bannedUntil) > new Date();
            return (
              <View
                style={{
                  padding: space.md,
                  borderRadius: radius.sm,
                  borderWidth: StyleSheet.hairlineWidth * 2,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  gap: space.sm,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                  <Avatar url={item.avatarUrl} name={item.displayName} size={32} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontWeight: '700', fontSize: 13, color: colors.text }}>
                        {item.displayName}
                      </Text>
                      {item.isAdmin ? (
                        <Text style={[typography.eyebrow, { color: colors.accent }]}>Admin</Text>
                      ) : null}
                      {banned ? (
                        <Text style={[typography.eyebrow, { color: colors.danger }]}>Banned</Text>
                      ) : null}
                    </View>
                    <Text style={[typography.small, { color: colors.textFaint }]} numberOfLines={1}>
                      {item.email}
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: space.sm }}>
                  <Button
                    small
                    label={banned ? 'Unban' : 'Ban'}
                    variant="secondary"
                    style={{ flex: 1 }}
                    onPress={() => (banned ? doUnban(item) : promptBan(item))}
                  />
                  <Button
                    small
                    label="Delete"
                    variant="danger"
                    style={{ flex: 1 }}
                    onPress={() => removeUser(item)}
                  />
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}
