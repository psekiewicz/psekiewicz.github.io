import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';

import { FeedTabs } from '../components/FeedTabs';
import { PostCard } from '../components/PostCard';
import { TopBar, TopBarButton } from '../components/TopBar';
import { Avatar, Button, EmptyState, ErrorNote, Loading } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { getCommentCounts } from '../data/comments';
import { getFollowingIds } from '../data/follows';
import { getLikeCounts, getLikedSet } from '../data/likes';
import { getUnreadCount } from '../data/notifications';
import { getProfilesByIds, Profile } from '../data/profiles';
import { DISCOVER_POOL, getPublishedProjects, Project } from '../data/projects';
import { getSavedSet } from '../data/saves';
import { loadSeenIds, rankFeed } from '../lib/feedRank';
import { getLevelsForUsers } from '../lib/levels';
import { usePostActions } from '../lib/usePostActions';
import { useTheme } from '../theme/ThemeProvider';
import { space } from '../theme/tokens';

// Home is the feed: For you (ranked), Following and Latest, drawn as posts you
// can like, save and share without opening them. Searching and filtering by
// type moved to Explore, behind the bar's search.
//
// The chrome is a timeline's: a 50px bar carrying your avatar, the tabs pinned
// under it, and then posts straight away, full-bleed and divided by hairlines.

type Tab = 'foryou' | 'following' | 'latest';

const TABS: { value: Tab; label: string }[] = [
  { value: 'foryou', label: 'For you' },
  { value: 'following', label: 'Following' },
  { value: 'latest', label: 'Latest' },
];

// Wide enough for a comfortable post on a tablet without stretching the
// picture into a banner.
const MAX_POST_WIDTH = 620;

export function HomeScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user, profile } = useAuth();

  const [projects, setProjects] = useState<Project[]>([]);
  const [authors, setAuthors] = useState<Map<string, Profile>>(new Map());
  const [levels, setLevels] = useState<Map<string, any>>(new Map());
  const [commentCounts, setCommentCounts] = useState<Map<string, number>>(new Map());
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [ranked, setRanked] = useState<Project[]>([]);
  const [unread, setUnread] = useState(0);
  const [tab, setTab] = useState<Tab>('foryou');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const signIn = useCallback(() => navigation.navigate('Login'), [navigation]);
  const actions = usePostActions(user?.id ?? null, signIn);
  const { setLikeCounts, setLiked, setSaved } = actions;

  const load = useCallback(async () => {
    setError('');
    try {
      const rows = await getPublishedProjects({ limit: DISCOVER_POOL });
      const ids = rows.map((p) => p.id);
      const uids = rows.map((p) => p.uid);

      // Everything a page of posts needs, batched - one query per post is what
      // made the gallery the slowest thing on the site.
      const [profileMap, levelMap, likes, comments, likedSet, savedSet, follows, seen] = await Promise.all([
        getProfilesByIds(uids).catch(() => new Map()),
        getLevelsForUsers(uids).catch(() => new Map()),
        getLikeCounts(ids).catch(() => new Map()),
        getCommentCounts(ids).catch(() => new Map()),
        getLikedSet(user?.id ?? null, ids).catch(() => new Set<string>()),
        getSavedSet(user?.id ?? null, ids).catch(() => new Set<string>()),
        getFollowingIds(user?.id ?? null).catch(() => new Set<string>()),
        loadSeenIds(),
      ]);
      setProjects(rows);
      setAuthors(profileMap);
      setLevels(levelMap);
      setLikeCounts(likes);
      setCommentCounts(comments);
      setLiked(likedSet);
      setSaved(savedSet);
      setFollowingIds(follows);
      // Ranked once per load and kept, so For you doesn't reshuffle under you
      // every time a like changes a count.
      setRanked(rankFeed(rows, { likeCounts: likes, commentCounts: comments, followingIds: follows, seenIds: seen }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, setLikeCounts, setLiked, setSaved]);

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

  const items = useMemo(() => {
    if (tab === 'foryou') return ranked;
    const newest = [...projects].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return tab === 'following' ? newest.filter((p) => followingIds.has(p.uid)) : newest;
  }, [tab, ranked, projects, followingIds]);

  const empty =
    tab === 'following' ? (
      user ? (
        <EmptyState
          icon="users"
          title="Nothing from people you follow yet"
          body="Follow a few people and their posts show up here."
          action={<Button label="Find people" onPress={() => navigation.navigate('Leaderboard')} />}
        />
      ) : (
        <EmptyState
          icon="users"
          title="Follow people to fill this tab"
          body="Log in to see posts from the people you follow."
          action={<Button label="Log in" onPress={signIn} />}
        />
      )
    ) : (
      <EmptyState icon="inbox" title="No posts yet" body="Be the first to share something." />
    );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar
        leading={
          <Pressable
            onPress={() => (user ? navigation.navigate('Profile') : signIn())}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={user ? 'Your profile' : 'Log in'}
          >
            <Avatar url={profile?.avatarUrl} name={profile?.displayName || 'You'} size={32} />
          </Pressable>
        }
        title="Home"
        actions={
          <>
            <TopBarButton icon="search" label="Explore" onPress={() => navigation.navigate('Explore')} />
            <TopBarButton icon="trophy" label="Leaderboard" onPress={() => navigation.navigate('Leaderboard')} />
            <TopBarButton
              icon="bell"
              label="Notifications"
              badge={unread > 0}
              onPress={() => (user ? navigation.navigate('Notifications') : signIn())}
            />
          </>
        }
      >
        <View style={{ width: '100%', maxWidth: MAX_POST_WIDTH, alignSelf: 'center' }}>
          <FeedTabs tabs={TABS} value={tab} onChange={(next) => setTab(next as Tab)} />
        </View>
      </TopBar>

      {loading ? (
        <Loading label="Loading posts" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          // No padding and no gaps: posts run edge to edge and are told apart
          // by the hairline each one draws under itself. The bottom pad clears
          // the tab bar the list scrolls behind.
          contentContainerStyle={{
            width: '100%',
            maxWidth: MAX_POST_WIDTH,
            alignSelf: 'center',
            paddingBottom: 96,
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
          ListHeaderComponent={error ? <ErrorNote message={error} /> : null}
          ListEmptyComponent={<View style={{ paddingTop: space.xxl }}>{empty}</View>}
          renderItem={({ item, index }) => (
            <PostCard
              project={item}
              author={authors.get(item.uid)}
              level={levels.get(item.uid)?.level}
              likeCount={actions.likeCounts.get(item.id) || 0}
              commentCount={commentCounts.get(item.id) || 0}
              liked={actions.liked.has(item.id)}
              saved={actions.saved.has(item.id)}
              onPress={() => navigation.navigate('ProjectDetail', { projectId: item.id })}
              onAuthorPress={() => navigation.navigate('UserProfile', { userId: item.uid })}
              onLike={() => actions.toggleLike(item.id)}
              onSave={() => actions.toggleSave(item.id)}
              onShare={() => actions.share(item)}
              index={index}
            />
          )}
        />
      )}
    </View>
  );
}
