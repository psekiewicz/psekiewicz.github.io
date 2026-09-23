import { Feather } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../components/icons';
import { PostTile } from '../components/PostTile';
import { TopBar } from '../components/TopBar';
import { Text, TextInput } from '../components/Text';
import { Avatar, Button, DisplayName, EmptyState, ErrorNote, Loading } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { getCommentCounts } from '../data/comments';
import { followUser, getFollowingIds, unfollowUser } from '../data/follows';
import { getLikeCounts } from '../data/likes';
import { getAllProfiles, getProfilesByIds, Profile } from '../data/profiles';
import { getTopByXp } from '../data/reputation';
import { DISCOVER_POOL, getPublishedProjects, Project } from '../data/projects';
import { useCardColumns, column, MAX_PAGE_WIDTH } from '../lib/layout';
import { PROJECT_TYPE_OPTIONS, typeMeta } from '../lib/utils';
import { useTheme } from '../theme/ThemeProvider';
import { gutter, radius, space } from '../theme/tokens';

// Explore, as on the website (projects.html): one search over posts, tags and
// people, type chips, and a grid of picture tiles. Search runs over what has
// been fetched; past DISCOVER_POOL entries the oldest drop out, and searching
// server-side is the honest fix for that.

export function ExploreScreen({ navigation, route }: any) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const tileColumns = Math.max(2, useCardColumns());
  const { user } = useAuth();

  const [query, setQuery] = useState<string>(route.params?.q ?? '');
  const [type, setType] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(route.params?.tag ?? null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [likeCounts, setLikeCounts] = useState<Map<string, number>>(new Map());
  const [commentCounts, setCommentCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // The website keeps people worth following and what is being tagged in the
  // rail beside its feed. There is no rail on a phone, so they live here, on
  // the screen whose whole job is finding something you were not looking for.
  const [suggested, setSuggested] = useState<{ profile: Profile; xp: number }[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [followBusy, setFollowBusy] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const [rows, people] = await Promise.all([
          getPublishedProjects({ limit: DISCOVER_POOL }),
          getAllProfiles().catch(() => []),
        ]);
        setProjects(rows);
        setProfiles(people);
        const ids = rows.map((p) => p.id);
        const [likes, comments] = await Promise.all([
          getLikeCounts(ids).catch(() => new Map()),
          getCommentCounts(ids).catch(() => new Map()),
        ]);
        setLikeCounts(likes);
        setCommentCounts(comments);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Suggestions are a garnish: they load on their own so a slow or failing
  // leaderboard query never holds up the grid, exactly as the rail does it.
  useEffect(() => {
    (async () => {
      try {
        const mine = await getFollowingIds(user?.id ?? null).catch(() => new Set<string>());
        setFollowingIds(mine);
        const top = await getTopByXp(20);
        const candidates = top
          .filter((r) => r.userId !== user?.id && !mine.has(r.userId))
          .slice(0, 3);
        if (candidates.length === 0) return;
        const map = await getProfilesByIds(candidates.map((r) => r.userId));
        setSuggested(
          candidates
            .map((r) => ({ profile: map.get(r.userId) as Profile, xp: r.xp }))
            .filter((p) => p.profile)
        );
      } catch {
        // No suggestions is a quieter failure than an error over the grid.
      }
    })();
  }, [user?.id]);

  const toggleFollow = async (targetId: string) => {
    if (!user) {
      navigation.navigate('Login');
      return;
    }
    if (followBusy.has(targetId)) return;
    const wasFollowing = followingIds.has(targetId);
    setFollowBusy((prev) => new Set(prev).add(targetId));
    setFollowingIds((prev) => {
      const next = new Set(prev);
      if (wasFollowing) next.delete(targetId);
      else next.add(targetId);
      return next;
    });
    try {
      if (wasFollowing) await unfollowUser(user.id, targetId);
      else await followUser(user.id, targetId);
    } catch {
      // Put it back: the row should say what the server thinks, not what the
      // tap hoped for.
      setFollowingIds((prev) => {
        const next = new Set(prev);
        if (wasFollowing) next.add(targetId);
        else next.delete(targetId);
        return next;
      });
    } finally {
      setFollowBusy((prev) => {
        const next = new Set(prev);
        next.delete(targetId);
        return next;
      });
    }
  };

  const q = query.trim().toLowerCase();
  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  const people = useMemo(
    () => (q ? profiles.filter((p) => p.displayName.toLowerCase().includes(q)).slice(0, 12) : []),
    [profiles, q]
  );

  const posts = useMemo(
    () =>
      projects.filter((p) => {
        if (type && p.type !== type) return false;
        if (tag && !p.tags.includes(tag)) return false;
        if (!q) return true;
        return (
          p.title.toLowerCase().includes(q) ||
          p.summary.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.authorName.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q))
        );
      }),
    [projects, type, tag, q]
  );

  // Counted across what has been fetched, most used first - the same rule as
  // `trendingTags` in js/feed-rail.js, over the same pool of entries.
  const trending = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of projects) {
      for (const t of p.tags) counts.set(t, (counts.get(t) || 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 6);
  }, [projects]);

  // Discovery sits above the grid only while the grid is showing everything;
  // once a search or a filter is on, the answer to it is what matters.
  const idle = !q && !tag && !type;

  const chips = [{ value: null as string | null, label: 'Everything', icon: 'grid' }].concat(
    PROJECT_TYPE_OPTIONS.map((o) => ({ value: o.value as string | null, label: o.label, icon: typeMeta(o.value).icon }))
  );

  const header = (
    <View style={{ gap: 14, paddingBottom: 6 }}>
      <ErrorNote message={error} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {chips.map((chip) => {
          const active = type === chip.value;
          return (
            <Pressable
              key={chip.label}
              onPress={() => setType(chip.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 13,
                paddingVertical: 8,
                borderRadius: radius.pill,
                backgroundColor: active ? colors.primarySoft : colors.bg,
                borderWidth: 1.5,
                borderColor: active ? 'transparent' : colors.border,
              }}
            >
              <Feather name={chip.icon as any} size={13} color={active ? colors.primaryDeep : colors.textMuted} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: active ? colors.primaryDeep : colors.textMuted }}>
                {chip.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {tag ? (
        <Pressable
          onPress={() => setTag(null)}
          accessibilityRole="button"
          accessibilityLabel={`Remove the #${tag} filter`}
          style={{
            alignSelf: 'flex-start',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 13,
            paddingVertical: 7,
            borderRadius: radius.pill,
            backgroundColor: colors.primarySoft,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primaryDeep }}>#{tag}</Text>
          <Feather name="x" size={13} color={colors.primaryDeep} />
        </Pressable>
      ) : null}

      {idle && suggested.length ? (
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>Who to follow</Text>
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={() => navigation.navigate('Leaderboard')}
              hitSlop={8}
              accessibilityRole="button"
            >
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: colors.primaryDeep }}>
                Show more
              </Text>
            </Pressable>
          </View>

          {suggested.map(({ profile, xp }) => {
            const follows = followingIds.has(profile.id);
            return (
              <View
                key={profile.id}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}
              >
                <Pressable
                  onPress={() => navigation.navigate('UserProfile', { userId: profile.id })}
                  hitSlop={6}
                  accessibilityRole="link"
                  accessibilityLabel={profile.displayName}
                >
                  <Avatar
                    url={profile.avatarUrl}
                    name={profile.displayName}
                    size={40}
                    ring={profile.equippedBorder}
                  />
                </Pressable>
                <Pressable
                  onPress={() => navigation.navigate('UserProfile', { userId: profile.id })}
                  style={{ flex: 1, minWidth: 0 }}
                >
                  <DisplayName
                    name={profile.displayName}
                    effect={profile.equippedNameEffect}
                    style={{ fontSize: 14 }}
                  />
                  <Text style={{ fontSize: 12, color: colors.textFaint }}>
                    {xp.toLocaleString()} XP
                  </Text>
                </Pressable>
                <Button
                  small
                  label={follows ? 'Following' : 'Follow'}
                  variant={follows ? 'secondary' : 'primary'}
                  disabled={followBusy.has(profile.id)}
                  onPress={() => toggleFollow(profile.id)}
                />
              </View>
            );
          })}
        </View>
      ) : null}

      {idle && trending.length ? (
        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>Trending tags</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {trending.map(([t, count]) => (
              <Pressable
                key={t}
                onPress={() => setTag(t)}
                accessibilityRole="button"
                accessibilityLabel={`${count} ${count === 1 ? 'post' : 'posts'} tagged ${t}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 13,
                  paddingVertical: 8,
                  borderRadius: radius.pill,
                  backgroundColor: colors.surface,
                  borderWidth: StyleSheet.hairlineWidth * 2,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: colors.primaryDeep }}>
                  #{t}
                </Text>
                <Text style={{ fontSize: 11.5, color: colors.textFaint }}>{count}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {people.length ? (
        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>People</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {people.map((person) => (
              <Pressable
                key={person.id}
                onPress={() => navigation.navigate('UserProfile', { userId: person.id })}
                style={({ pressed }) => ({
                  width: 104,
                  alignItems: 'center',
                  gap: 8,
                  paddingVertical: 14,
                  paddingHorizontal: 8,
                  borderRadius: radius.md,
                  backgroundColor: colors.surface,
                  borderWidth: StyleSheet.hairlineWidth * 2,
                  borderColor: colors.border,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Avatar url={person.avatarUrl} name={person.displayName} size={52} ring={person.equippedBorder} />
                <DisplayName
                  name={person.displayName}
                  effect={person.equippedNameEffect}
                  style={{ fontSize: 12, textAlign: 'center' }}
                />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>Posts</Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Search field in place of a title - the whole screen is the search. */}
      <TopBar
        leading={
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={{ paddingRight: 2 }}
          >
            <Icon name="back" size={22} color={colors.text} strokeWidth={2.4} />
          </Pressable>
        }
        title={
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 9,
              paddingHorizontal: 14,
              borderRadius: radius.pill,
              backgroundColor: colors.surfaceAlt,
            }}
          >
            <Icon name="search" size={16} color={colors.textFaint} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search posts, tags and people"
              placeholderTextColor={colors.textFaint}
              autoFocus={!route.params?.tag}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              style={{ flex: 1, paddingVertical: 9, fontSize: 13.5, color: colors.text }}
            />
            {query ? (
              <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Clear search">
                <Feather name="x" size={16} color={colors.textFaint} />
              </Pressable>
            ) : null}
          </View>
        }
      />

      {loading ? (
        <Loading label="Loading posts" />
      ) : (
        <FlatList
          key={`tiles-${tileColumns}`}
          data={posts}
          numColumns={tileColumns}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          columnWrapperStyle={{ gap: 10 }}
          contentContainerStyle={{ ...column(MAX_PAGE_WIDTH), padding: gutter, paddingTop: 14, gap: 10, paddingBottom: space.xxl + insets.bottom }}
          ListHeaderComponent={header}
          ListEmptyComponent={<EmptyState icon="search" title="No posts match" body="Try another word, or clear the filters." />}
          renderItem={({ item, index }) => {
            // The last row keeps tile widths when it's short, like the website's grid.
            const isLastRowFiller = index === posts.length - 1 && posts.length % tileColumns !== 0;
            return (
              <>
                <PostTile
                  project={item}
                  author={profileMap.get(item.uid)}
                  likeCount={likeCounts.get(item.id) || 0}
                  commentCount={commentCounts.get(item.id) || 0}
                  onPress={() => navigation.navigate('ProjectDetail', { projectId: item.id })}
                />
                {isLastRowFiller
                  ? Array.from({ length: tileColumns - (posts.length % tileColumns) }, (_, i) => (
                      <View key={`filler-${i}`} style={{ flex: 1 }} />
                    ))
                  : null}
              </>
            );
          }}
        />
      )}
    </View>
  );
}
