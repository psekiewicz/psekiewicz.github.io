import { Feather } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProjectCard } from '../components/ProjectCard';
import { Chip, EmptyState, ErrorNote, Eyebrow, IconButton, Loading, Title } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { getCommentCounts } from '../data/comments';
import { getLikeCounts } from '../data/likes';
import { getUnreadCount } from '../data/notifications';
import { getProfilesByIds, Profile } from '../data/profiles';
import { getPublishedProjects, Project } from '../data/projects';
import { getLevelsForUsers } from '../lib/levels';
import { PROJECT_TYPE_OPTIONS } from '../lib/utils';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space } from '../theme/tokens';

export function HomeScreen({ navigation }: any) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [projects, setProjects] = useState<Project[]>([]);
  const [authors, setAuthors] = useState<Map<string, Profile>>(new Map());
  const [levels, setLevels] = useState<Map<string, any>>(new Map());
  const [likeCounts, setLikeCounts] = useState<Map<string, number>>(new Map());
  const [commentCounts, setCommentCounts] = useState<Map<string, number>>(new Map());
  const [unread, setUnread] = useState(0);

  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const rows = await getPublishedProjects();
      setProjects(rows);

      const ids = rows.map((p) => p.id);
      const uids = rows.map((p) => p.uid);

      // Everything a page of cards needs, batched — the same round-trip
      // discipline the web build uses, for the same reason: one query per card
      // is what made the gallery the slowest thing on the site.
      const [profileMap, levelMap, likes, comments] = await Promise.all([
        getProfilesByIds(uids).catch(() => new Map()),
        getLevelsForUsers(uids).catch(() => new Map()),
        getLikeCounts(ids).catch(() => new Map()),
        getCommentCounts(ids).catch(() => new Map()),
      ]);
      setAuthors(profileMap);
      setLevels(levelMap);
      setLikeCounts(likes);
      setCommentCounts(comments);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!user) {
      setUnread(0);
      return;
    }
    getUnreadCount()
      .then(setUnread)
      .catch(() => setUnread(0));
  }, [user]);

  // Refetch the badge whenever this screen comes back into focus, so marking
  // everything read on the notifications screen is reflected here.
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      if (user) getUnreadCount().then(setUnread).catch(() => {});
    });
    return unsub;
  }, [navigation, user]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => {
      if (typeFilter && p.type !== typeFilter) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.summary.toLowerCase().includes(q) ||
        p.authorName.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [projects, query, typeFilter]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View
        style={{
          paddingHorizontal: space.lg,
          paddingBottom: space.md,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <View style={{ flex: 1 }}>
          <Eyebrow>Showcase</Eyebrow>
          <Title style={{ fontSize: 22 }}>Discover</Title>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <IconButton
            icon="award"
            label="Leaderboard"
            onPress={() => navigation.navigate('Leaderboard')}
          />
          <View>
            <IconButton
              icon="bell"
              label="Notifications"
              onPress={() =>
                user ? navigation.navigate('Notifications') : navigation.navigate('Login')
              }
            />
            {unread > 0 ? (
              <View
                style={{
                  position: 'absolute',
                  top: 2,
                  right: 2,
                  minWidth: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: colors.primary,
                }}
              />
            ) : null}
          </View>
        </View>
      </View>

      <View style={{ paddingHorizontal: space.lg, gap: space.sm }}>
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
          <Feather name="search" size={15} color={colors.textFaint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search titles, tags, people"
            placeholderTextColor={colors.textFaint}
            style={{ flex: 1, color: colors.text, paddingVertical: space.md, fontSize: 14 }}
          />
          {query ? (
            <IconButton icon="x" size={15} label="Clear search" onPress={() => setQuery('')} />
          ) : null}
        </View>

        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[{ value: null, label: 'All' }, ...PROJECT_TYPE_OPTIONS]}
          keyExtractor={(item) => item.value || 'all'}
          contentContainerStyle={{ gap: space.sm, paddingVertical: space.xs }}
          renderItem={({ item }) => (
            <Chip
              label={item.label}
              active={typeFilter === item.value}
              onPress={() => setTypeFilter(item.value)}
            />
          )}
        />
      </View>

      {loading ? (
        <Loading label="Loading entries" />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={error ? <ErrorNote message={error} /> : null}
          ListEmptyComponent={
            <EmptyState
              icon="search"
              title="Nothing here yet"
              body={
                query || typeFilter
                  ? 'No entries match that search.'
                  : 'Nothing has been published yet.'
              }
            />
          }
          renderItem={({ item }) => (
            <ProjectCard
              project={item}
              author={authors.get(item.uid)}
              level={levels.get(item.uid)?.level}
              likeCount={likeCounts.get(item.id) || 0}
              commentCount={commentCounts.get(item.id) || 0}
              onPress={() => navigation.navigate('ProjectDetail', { projectId: item.id })}
              onAuthorPress={() => navigation.navigate('UserProfile', { userId: item.uid })}
            />
          )}
        />
      )}
    </View>
  );
}
