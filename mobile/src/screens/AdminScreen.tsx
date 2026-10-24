import { Feather } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { FormatEditor } from '../components/FormatEditor';
import { Text, TextInput } from '../components/Text';

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
import {
  Announcement,
  BODY_MAX,
  clearAnnouncements,
  getActiveAnnouncement,
  publishAnnouncement,
  TITLE_MAX,
} from '../data/announcements';
import { deleteProject, getAllProjects, Project, togglePublish } from '../data/projects';
import { safeUrl, timeAgo } from '../lib/utils';
import { getNewsEditorIds, setNewsEditor } from '../data/news';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, typography } from '../theme/tokens';

export function AdminScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();

  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<'projects' | 'users' | 'notice'>('projects');
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeBody, setNoticeBody] = useState('');
  const [noticeImage, setNoticeImage] = useState('');
  const [noticeVideo, setNoticeVideo] = useState('');
  const [noticeHours, setNoticeHours] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  // The notice users are seeing right now, if any - so it is plain whether one is out.
  const [live, setLive] = useState<Announcement | null>(null);
  const refreshLive = useCallback(async () => setLive(await getActiveAnnouncement()), []);
  // A hidden list stays hidden until you search: typing is a deliberate ask for
  // rows, so matches show, and clearing the box puts the list away again.
  const [hidden, setHidden] = useState({ projects: false, users: false });
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [newsEditors, setNewsEditors] = useState<Set<string>>(new Set());
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
      const [projectRows, userRows, editorIds] = await Promise.all([
        getAllProjects().catch(() => []),
        listUsersForAdmin().catch(() => []),
        getNewsEditorIds().catch(() => new Set<string>()),
      ]);
      setProjects(projectRows);
      setUsers(userRows);
      setNewsEditors(editorIds);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (tab === 'notice') refreshLive();
  }, [tab, refreshLive]);

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
    (p) => (!hidden.projects || !!q) && (!q || p.title.toLowerCase().includes(q) || p.authorName.toLowerCase().includes(q))
  );
  const shownUsers = users.filter(
    (u) =>
      (!hidden.users || !!q) &&
      (!q || u.displayName.toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q))
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

  // Who may write in News. Only an admin can change it, and
  // admin_set_news_editor() checks that again (schema.sql).
  const toggleNewsEditor = (target: AdminUser) => {
    const on = !newsEditors.has(target.id);
    Alert.alert(on ? 'Make news editor?' : 'Remove from News?', on ? `${target.displayName} will be able to create newsletters and write articles.` : `${target.displayName} will no longer write in News.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: on ? 'Make editor' : 'Remove',
        onPress: async () => {
          try {
            await setNewsEditor(target.id, on);
            setNotice(on ? `${target.displayName} can now write in News.` : `${target.displayName} no longer writes in News.`);
            load();
          } catch (e: any) {
            setError(e.message);
          }
        },
      },
    ]);
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

  const confirmNotice = () => {
    const image = noticeImage.trim();
    const video = noticeVideo.trim();
    if ((image && !safeUrl(image)) || (video && !safeUrl(video))) {
      setError('The picture and film links must be full https:// addresses.');
      return;
    }
    const expiresAt = noticeHours ? new Date(Date.now() + noticeHours * 3600 * 1000) : null;
    const when = expiresAt ? ` until ${expiresAt.toLocaleString()}` : '';
    Alert.alert('Send to everyone?', `"${noticeTitle.trim()}" will pop up for every user${when}.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Send',
        onPress: async () => {
          if (!user) return;
          setSending(true);
          setError('');
          try {
            await publishAnnouncement(user.id, {
              title: noticeTitle,
              body: noticeBody,
              imageUrl: image ? safeUrl(image) : '',
              videoUrl: video ? safeUrl(video) : '',
              expiresAt,
            });
            setNoticeTitle('');
            setNoticeBody('');
            setNoticeImage('');
            setNoticeVideo('');
            setNoticeHours(null);
            setNotice('Notice sent. Users see it the next time they open the app.');
            Alert.alert('Notice sent', `"${noticeTitle.trim()}" is live for everyone.`);
            refreshLive();
          } catch (e: any) {
            setError(`${e.message} - notices need the announcements table from schema.sql.`);
          } finally {
            setSending(false);
          }
        },
      },
    ]);
  };

  const withdrawNotice = async () => {
    setError('');
    try {
      await clearAnnouncements();
      setNotice('Notice withdrawn.');
      Alert.alert('Notice withdrawn', 'Users will no longer see it.');
      refreshLive();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const noticeInput = {
    color: colors.text,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: 14,
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: space.lg, gap: space.md }}>
        <ErrorNote message={error} />
        <SuccessNote message={notice} />

        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {(['projects', 'users', 'notice'] as const).map((t) => (
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
                {t === 'projects'
                  ? `ENTRIES · ${projects.length}`
                  : t === 'users'
                    ? `USERS · ${users.length}`
                    : 'NOTICE'}
              </Text>
            </Pressable>
          ))}
        </View>

        {tab !== 'notice' && (
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
        )}
        {tab !== 'notice' && (
          <Pressable
            onPress={() => setHidden((h) => ({ ...h, [tab]: !h[tab] }))}
            accessibilityRole="button"
            accessibilityState={{ expanded: !hidden[tab] }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}
          >
            <Feather name={hidden[tab] ? 'eye' : 'eye-off'} size={14} color={colors.textMuted} />
            <Text style={[typography.small, { color: colors.textMuted }]}>
              {hidden[tab] ? 'Show list' : 'Hide list'}
            </Text>
          </Pressable>
        )}
      </View>

      {tab === 'notice' ? (
        <View style={{ padding: space.lg, paddingTop: 0, gap: space.md }}>
          <View
            accessibilityRole="summary"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.md,
              padding: space.md,
              borderRadius: radius.md,
              borderWidth: 1.5,
              borderColor: live ? colors.success : colors.border,
              backgroundColor: live ? colors.successSoft : colors.surface,
            }}
          >
            <View
              style={{
                paddingVertical: 3,
                paddingHorizontal: space.sm,
                borderRadius: radius.pill,
                backgroundColor: live ? colors.success : colors.borderStrong,
              }}
            >
              <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: live ? '#ffffff' : colors.text }}>
                {live ? 'LIVE NOW' : 'NOT LIVE'}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', fontSize: 13, color: colors.text }} numberOfLines={2}>
                {live ? live.title : 'No notice is showing to users.'}
              </Text>
              {live ? (
                <Text style={[typography.small, { color: colors.textMuted }]}>
                  {live.expiresAt ? `Until ${new Date(live.expiresAt).toLocaleString()}` : 'Until you withdraw it'}
                  {live.attachments.length ? ` · ${live.attachments.length} file${live.attachments.length === 1 ? '' : 's'}` : ''}
                </Text>
              ) : null}
            </View>
            {live ? <Button small label="Withdraw" variant="secondary" onPress={withdrawNotice} /> : null}
          </View>
          <Text style={[typography.small, { color: colors.textMuted }]}>
            Shown once to every user as a popup, the next time they open the app or the site.
          </Text>
          <TextInput
            value={noticeTitle}
            onChangeText={setNoticeTitle}
            maxLength={TITLE_MAX}
            placeholder="Title"
            placeholderTextColor={colors.textFaint}
            style={noticeInput}
          />
          <FormatEditor
            value={noticeBody}
            onChangeText={(v) => setNoticeBody(v.slice(0, BODY_MAX))}
            placeholder="Message"
            colors={colors}
          />
          <Text style={[typography.small, { color: colors.textFaint }]}>
            {noticeBody.length}/{BODY_MAX}
          </Text>
          <TextInput
            value={noticeImage}
            onChangeText={setNoticeImage}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="Picture link (https://…), optional"
            placeholderTextColor={colors.textFaint}
            style={noticeInput}
          />
          <TextInput
            value={noticeVideo}
            onChangeText={setNoticeVideo}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="Film link (https://…, MP4 or WebM), optional"
            placeholderTextColor={colors.textFaint}
            style={noticeInput}
          />
          <Text style={[typography.small, { color: colors.textFaint }]}>
            To upload a file instead of linking one, use the admin page on the site.
          </Text>
          <Text style={[typography.small, { color: colors.textMuted }]}>Show for</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {([[null, 'Until withdrawn'], [1, '1 hour'], [24, '1 day'], [24 * 7, '1 week']] as const).map(
              ([hours, label]) => {
                const on = noticeHours === hours;
                return (
                  <Pressable
                    key={label}
                    onPress={() => setNoticeHours(hours)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    style={{
                      paddingVertical: 6,
                      paddingHorizontal: space.md,
                      borderRadius: radius.pill,
                      borderWidth: 1.5,
                      borderColor: on ? colors.primary : colors.border,
                      backgroundColor: on ? colors.primarySoft : colors.surface,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: on ? colors.primaryDeep : colors.textMuted }}>
                      {label}
                    </Text>
                  </Pressable>
                );
              }
            )}
          </View>
          <Button
            label="Send to everyone"
            loading={sending}
            disabled={!noticeTitle.trim() || !noticeBody.trim()}
            onPress={confirmNotice}
          />
        </View>
      ) : tab === 'projects' ? (
        <FlatList
          data={shownProjects}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: space.lg, paddingTop: 0, gap: space.sm, paddingBottom: space.xxl }}
          ListEmptyComponent={
            hidden.projects && !q ? (
              <EmptyState icon="eye-off" title="List hidden" body="Search to find entries, or show the list." />
            ) : (
              <EmptyState icon="package" title="No entries match" />
            )
          }
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
            hidden.users && !q ? (
              <EmptyState icon="eye-off" title="List hidden" body="Search to find accounts, or show the list." />
            ) : (
              <EmptyState
                icon="users"
                title="No accounts listed"
                body="The Users tab needs admin_list_users() from schema.sql."
              />
            )
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
                      {newsEditors.has(item.id) ? (
                        <Text style={[typography.eyebrow, { color: colors.primary }]}>News</Text>
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

                <Button
                  small
                  label={newsEditors.has(item.id) ? 'Remove from News' : 'Make news editor'}
                  variant="secondary"
                  onPress={() => toggleNewsEditor(item)}
                />
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
