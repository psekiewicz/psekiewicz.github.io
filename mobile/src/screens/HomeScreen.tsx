import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';

import { AccentHeader, FilterChip, HeaderButton, SearchPill } from '../components/bloom';
import { ProjectCard } from '../components/ProjectCard';
import { EmptyState, ErrorNote, Loading } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { getCommentCounts } from '../data/comments';
import { getLikeCounts } from '../data/likes';
import { getUnreadCount } from '../data/notifications';
import { getProfilesByIds, Profile } from '../data/profiles';
import { DISCOVER_POOL, getPublishedProjects, Project } from '../data/projects';
import { useCardColumns, padRow } from '../lib/layout';
import { getLevelsForUsers } from '../lib/levels';
import { PROJECT_TYPE_OPTIONS, typeMeta } from '../lib/utils';
import { useTheme } from '../theme/ThemeProvider';
import { gutter, radius, space } from '../theme/tokens';

export function HomeScreen({ navigation }: any) {
  const { colors } = useTheme();
  // One column on a phone, more as the screen gets wider - the same rule the
  // site's project grid follows.
  const columns = useCardColumns();
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
      // Search and the type filter run over what has been fetched, so the
      // pool is asked for explicitly rather than inheriting the feed's page
      // size. Past this many entries the search stops seeing the older ones -
      // the honest fix is to search server-side, which is a bigger change than
      // this one.
      const rows = await getPublishedProjects({ limit: DISCOVER_POOL });
      setProjects(rows);

      const ids = rows.map((p) => p.id);
      const uids = rows.map((p) => p.uid);

      // Everything a page of cards needs, batched - the same round-trip
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

  // "FRIDAY · 41 NEW" - the artboard's own header line: today, then how many
  // entries are currently in view.
  const eyebrow = `${new Date()
    .toLocaleDateString(undefined, { weekday: 'long' })
    .toUpperCase()} · ${filtered.length} NEW`;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AccentHeader
        eyebrow={eyebrow}
        title="Discover"
        actions={
          <>
            <HeaderButton
              icon="refresh"
              label="Refresh"
              onPress={() => {
                setRefreshing(true);
                load();
              }}
            />
            {/* The site links the leaderboard from its top nav; the app had the
                screen registered but nothing that opened it. */}
            <HeaderButton
              icon="trophy"
              label="Leaderboard"
              onPress={() => navigation.navigate('Leaderboard')}
            />
            <View>
              <HeaderButton
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
                    width: 9,
                    height: 9,
                    borderRadius: radius.pill,
                    backgroundColor: colors.bg,
                  }}
                />
              ) : null}
            </View>
          </>
        }
      >
        <SearchPill value={query} onChangeText={setQuery} />
      </AccentHeader>

      {loading ? (
        <Loading label="Loading entries" />
      ) : (
        <FlatList
          // React Native refuses to change numColumns on a mounted list, so the
          // key forces a fresh one when the tablet is rotated.
          key={`grid-${columns}`}
          numColumns={columns}
          {...(columns > 1 ? { columnWrapperStyle: { gap: space.lg } } : null)}
          data={padRow(filtered, columns)}
          keyExtractor={(item, index) => item?.id ?? `blank-${index}`}
          // 116 of bottom padding is what clears Bloom's floating tab bar and
          // the add button overhanging it.
          contentContainerStyle={{
            paddingHorizontal: gutter,
            paddingTop: 18,
            gap: 16,
            paddingBottom: 116,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={colors.primary}
              // tintColor is iOS-only. Android draws a spinner on its own disc, and
              // that disc is white unless it is told otherwise - which is what was
              // flashing a white circle down the top of every dark-mode list.
              colors={[colors.primary]}
              progressBackgroundColor={colors.surface}
            />
          }
          ListHeaderComponent={
            <View style={{ gap: 16 }}>
              {error ? <ErrorNote message={error} /> : null}
              <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                {[{ value: null, label: 'Everything' }, ...PROJECT_TYPE_OPTIONS].map((item) => (
                  <FilterChip
                    key={item.value || 'all'}
                    label={item.label}
                    active={typeFilter === item.value}
                    onPress={() => setTypeFilter(item.value)}
                  />
                ))}
              </View>
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              icon="search"
              title="Nothing here yet"
              body={
                query
                  ? 'No entries match that search.'
                  : typeFilter
                    ? `No ${typeMeta(typeFilter).label} entries yet.`
                    : 'Nothing has been published yet.'
              }
            />
          }
          renderItem={({ item, index }) => {
            // A blank from padRow: holds a column open so the last real card
            // keeps the width of every other one.
            if (!item) return <View style={{ flex: 1 }} />;
            const card = (
              <ProjectCard
                project={item}
                author={authors.get(item.uid)}
                level={levels.get(item.uid)?.level}
                likeCount={likeCounts.get(item.id) || 0}
                commentCount={commentCounts.get(item.id) || 0}
                onPress={() => navigation.navigate('ProjectDetail', { projectId: item.id })}
                onAuthorPress={() => navigation.navigate('UserProfile', { userId: item.uid })}
                index={index}
              />
            );
            return columns > 1 ? <View style={{ flex: 1 }}>{card}</View> : card;
          }}
        />
      )}
    </View>
  );
}
