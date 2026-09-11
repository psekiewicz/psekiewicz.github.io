import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewToken,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CommentsSheet } from '../components/CommentsSheet';
import { Avatar, EmptyState, Loading } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { getCommentCounts } from '../data/comments';
import { getFollowingIds } from '../data/follows';
import { getLikeCounts, getLikedSet, likeProject, unlikeProject } from '../data/likes';
import { getProfilesByIds, Profile } from '../data/profiles';
import { FEED_PAGE_SIZE, getPublishedProjects, Project } from '../data/projects';
import { getSavedSet, saveProject, unsaveProject } from '../data/saves';
import { logProjectView } from '../data/views';
import { loadSeenIds, markSeen, rankFeed } from '../lib/feedRank';
import { resolveMedia } from '../lib/media';
import { formatCount } from '../lib/utils';
import { useMotion } from '../theme/MotionProvider';
import { Icon } from '../components/icons';
import { useTheme } from '../theme/ThemeProvider';
import { gutter, radius, space } from '../theme/tokens';

// Scrolls is full-bleed dark in both themes - a feed of media reads better on
// black, and the artboard draws it that way too. Bloom's dark is a warm
// near-black with cream ink rather than white on pure black.
const INK = '#fdf7ea';
const SUBTLE = 'rgba(253,247,234,0.75)';
const NIGHT = '#241f18';
/** The translucent cream every control on this screen sits in. */
const GLASS = 'rgba(253,247,234,0.16)';

export function ScrollsScreen({ navigation }: any) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [feed, setFeed] = useState<Project[]>([]);
  const [authors, setAuthors] = useState<Map<string, Profile>>(new Map());
  const [likeCounts, setLikeCounts] = useState<Map<string, number>>(new Map());
  const [commentCounts, setCommentCounts] = useState<Map<string, number>>(new Map());
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [commentsFor, setCommentsFor] = useState<string | null>(null);
  // The artboard's two feed tabs. "Following" narrows to the accounts you
  // follow, which the feed already fetches for ranking.
  const [tab, setTab] = useState<'foryou' | 'following'>('foryou');
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());

  // Bloom's tab bar floats over the feed rather than taking layout height, so a
  // card is the full window and paging still snaps cleanly. onLayout corrects
  // this straight away; the seed only avoids a first-frame jump.
  const [cardHeight, setCardHeight] = useState(Dimensions.get('window').height);

  // Paging state lives in refs: the loader reads it while it runs, and a
  // re-render in the middle of a fetch must not hand it stale values.
  const cursorRef = useRef<string | null>(null);
  const exhaustedRef = useRef(false);
  const busyRef = useRef(false);
  // Fetched once per session rather than once per page - neither depends on
  // which slice of the feed is being loaded.
  const followingRef = useRef<Set<string>>(new Set());
  const seenRef = useRef<Map<string, number>>(new Map());

  const loadPage = useCallback(
    async (reset: boolean) => {
      if (busyRef.current) return;
      if (!reset && exhaustedRef.current) return;
      busyRef.current = true;

      try {
        if (reset) {
          cursorRef.current = null;
          exhaustedRef.current = false;
          followingRef.current = await getFollowingIds(user?.id ?? null).catch(
            () => new Set<string>()
          );
          setFollowingIds(followingRef.current);
          seenRef.current = await loadSeenIds();
        }

        const rows = await getPublishedProjects({ before: cursorRef.current ?? undefined });
        // A short page means there is nothing older left; asking again would
        // just repeat the same empty answer on every scroll to the bottom.
        if (rows.length < FEED_PAGE_SIZE) exhaustedRef.current = true;
        if (rows.length === 0) {
          if (reset) setFeed([]);
          return;
        }
        // Rows come back newest first, so the oldest is the cursor for the
        // next page.
        cursorRef.current = rows[rows.length - 1].createdAt;

        const ids = rows.map((p) => p.id);
        const uids = rows.map((p) => p.uid);
        const [likes, comments, profileMap, likedSet, savedSet] = await Promise.all([
          getLikeCounts(ids).catch(() => new Map<string, number>()),
          getCommentCounts(ids).catch(() => new Map<string, number>()),
          getProfilesByIds(uids).catch(() => new Map<string, Profile>()),
          getLikedSet(user?.id ?? null, ids).catch(() => new Set<string>()),
          getSavedSet(user?.id ?? null, ids).catch(() => new Set<string>()),
        ]);

        const merge = <K, V>(prev: Map<K, V>, next: Map<K, V>) =>
          reset ? next : new Map([...prev, ...next]);
        setLikeCounts((prev) => merge(prev, likes));
        setCommentCounts((prev) => merge(prev, comments));
        setAuthors((prev) => merge(prev, profileMap));
        setLiked((prev) => (reset ? likedSet : new Set([...prev, ...likedSet])));
        setSaved((prev) => (reset ? savedSet : new Set([...prev, ...savedSet])));

        // Each page is ranked among itself. Ranking across the whole archive
        // would mean holding the whole archive, which is the thing this
        // replaces; within a page the ordering still does its work.
        const ranked = rankFeed(rows, {
          likeCounts: likes,
          commentCounts: comments,
          followingIds: followingRef.current,
          seenIds: seenRef.current,
        });
        setFeed((prev) => (reset ? ranked : [...prev, ...ranked]));
      } catch {
        if (reset) setFeed([]);
      } finally {
        busyRef.current = false;
        setLoading(false);
      }
    },
    [user?.id]
  );

  const load = useCallback(() => loadPage(true), [loadPage]);

  useEffect(() => {
    load();
  }, [load]);

  // A view counts on a 3-second dwell - the same threshold the web build uses,
  // and the same one that marks a card seen for ranking purposes.
  const dwellTimer = useRef<any>(null);
  const startDwell = useCallback((project: Project) => {
    clearTimeout(dwellTimer.current);
    dwellTimer.current = setTimeout(() => {
      markSeen(project.id);
      logProjectView(project.id)
        .then((counted) => {
          if (!counted) return;
          setFeed((prev) =>
            prev.map((p) => (p.id === project.id ? { ...p, viewsCount: p.viewsCount + 1 } : p))
          );
        })
        .catch(() => {});
    }, 3000);
  }, []);

  useEffect(() => () => clearTimeout(dwellTimer.current), []);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0];
    if (!first) return;
    setActiveIndex(first.index ?? 0);
    if (first.item) startDwell(first.item as Project);
  }).current;

  const toggleLike = async (project: Project) => {
    if (!user) return navigation.navigate('Login');
    const isLiked = liked.has(project.id);
    // Optimistic: the heart has to answer the tap immediately, and a failure
    // just puts it back.
    setLiked((prev) => {
      const next = new Set(prev);
      isLiked ? next.delete(project.id) : next.add(project.id);
      return next;
    });
    setLikeCounts((prev) =>
      new Map(prev).set(project.id, (prev.get(project.id) || 0) + (isLiked ? -1 : 1))
    );
    try {
      if (isLiked) await unlikeProject(user.id, project.id);
      else await likeProject(user.id, project.id);
    } catch {
      setLiked((prev) => {
        const next = new Set(prev);
        isLiked ? next.add(project.id) : next.delete(project.id);
        return next;
      });
      setLikeCounts((prev) =>
        new Map(prev).set(project.id, (prev.get(project.id) || 0) + (isLiked ? 1 : -1))
      );
    }
  };

  const toggleSave = async (project: Project) => {
    if (!user) return navigation.navigate('Login');
    const isSaved = saved.has(project.id);
    setSaved((prev) => {
      const next = new Set(prev);
      isSaved ? next.delete(project.id) : next.add(project.id);
      return next;
    });
    try {
      if (isSaved) await unsaveProject(user.id, project.id);
      else await saveProject(user.id, project.id);
    } catch {
      setSaved((prev) => {
        const next = new Set(prev);
        isSaved ? next.add(project.id) : next.delete(project.id);
        return next;
      });
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: NIGHT, justifyContent: 'center' }}>
        <Loading />
      </View>
    );
  }

  if (feed.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <EmptyState
          icon="play-circle"
          title="Nothing to scroll yet"
          body="Once entries are published they show up here."
        />
      </View>
    );
  }

  const visible = tab === 'following' ? feed.filter((p) => followingIds.has(p.uid)) : feed;

  return (
    <View
      style={{ flex: 1, backgroundColor: NIGHT }}
      onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
    >
      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={cardHeight}
        snapToAlignment="start"
        decelerationRate="fast"
        // Two screens of runway: the next page starts arriving while there
        // are still cards left to watch, so the feed never stops at the seam.
        onEndReached={() => loadPage(false)}
        onEndReachedThreshold={2}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 80 }}
        getItemLayout={(_, index) => ({
          length: cardHeight,
          offset: cardHeight * index,
          index,
        })}
        // Only the active card and its immediate neighbours stay mounted -
        // a feed of video players all alive at once is what kills the frame
        // rate on a mid-range phone.
        windowSize={3}
        maxToRenderPerBatch={2}
        initialNumToRender={2}
        removeClippedSubviews
        renderItem={({ item, index }) => (
          <ScrollCard
            project={item}
            author={authors.get(item.uid)}
            height={cardHeight}
            active={index === activeIndex}
            liked={liked.has(item.id)}
            saved={saved.has(item.id)}
            likeCount={likeCounts.get(item.id) || 0}
            commentCount={commentCounts.get(item.id) || 0}
            insetBottom={insets.bottom}
            onLike={() => toggleLike(item)}
            onSave={() => toggleSave(item)}
            onComments={() => setCommentsFor(item.id)}
            onAuthor={() => navigation.navigate('UserProfile', { userId: item.uid })}
            onOpen={() => navigation.navigate('ProjectDetail', { projectId: item.id })}
          />
        )}
      />

      {/* Feed tabs, floating over the media. */}
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: insets.top + 12,
          left: 0,
          right: 0,
          flexDirection: 'row',
          justifyContent: 'center',
          gap: 22,
        }}
      >
        {([
          ['following', 'Following'],
          ['foryou', 'For you'],
        ] as const).map(([key, label]) => {
          const on = tab === key;
          return (
            <Pressable key={key} onPress={() => setTab(key)} hitSlop={8}>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: on ? INK : 'rgba(253,247,234,0.55)',
                  borderBottomWidth: on ? 2.5 : 0,
                  borderBottomColor: INK,
                  paddingBottom: 4,
                }}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {tab === 'following' && visible.length === 0 ? (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: gutter, right: gutter, top: '45%' }}
        >
          <Text style={{ color: SUBTLE, fontSize: 13, textAlign: 'center', lineHeight: 21 }}>
            {user
              ? 'Nothing from the accounts you follow yet.'
              : 'Sign in and follow people to fill this feed.'}
          </Text>
        </View>
      ) : null}

      <CommentsSheet
        projectId={commentsFor}
        visible={!!commentsFor}
        onClose={() => setCommentsFor(null)}
        onCountChange={(projectId, delta) =>
          setCommentCounts((prev) =>
            new Map(prev).set(projectId, Math.max(0, (prev.get(projectId) || 0) + delta))
          )
        }
      />
    </View>
  );
}

function ScrollCard({
  project,
  author,
  height,
  active,
  liked,
  saved,
  likeCount,
  commentCount,
  insetBottom,
  onLike,
  onSave,
  onComments,
  onAuthor,
  onOpen,
}: any) {
  const media = resolveMedia(project.mediaUrl, project.type);
  const poster = project.scrollImageUrl || project.imageUrl;

  // Double-tap-to-like on the media itself - the classic feed gesture,
  // parallel to the web build's scrolls.html. Only ever likes, never
  // unlikes, same as every feed that does this; the deliberate tap on the
  // heart rail (below) still does both.
  const lastTapAt = useRef(0);
  const burst = useRef(new Animated.Value(0)).current;
  const { enabled: motionEnabled } = useMotion();

  const playBurst = () => {
    if (!motionEnabled) return;
    burst.setValue(0);
    Animated.sequence([
      Animated.spring(burst, { toValue: 1, useNativeDriver: true, speed: 8, bounciness: 10 }),
      Animated.timing(burst, { toValue: 0, duration: 220, delay: 250, useNativeDriver: true }),
    ]).start();
  };

  const handleDoubleTap = () => {
    const now = Date.now();
    const isDoubleTap = now - lastTapAt.current < 300;
    lastTapAt.current = now;
    if (!isDoubleTap) return;
    playBurst();
    if (!liked) onLike();
  };

  return (
    <View style={{ height, width: '100%', backgroundColor: NIGHT }}>
      <Pressable onPress={handleDoubleTap} style={StyleSheet.absoluteFill}>
        <ScrollMedia media={media} poster={poster} active={active} height={height} />
      </Pressable>

      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: burst,
          transform: [{ scale: burst.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.15] }) }],
        }}
      >
        <Icon name="heart" size={96} color={INK} fill="#c67139" strokeWidth={1.4} />
      </Animated.View>

      {/* Legibility scrim: the text rail sits over arbitrary user media, so it
          needs its own contrast rather than hoping the image is dark. */}
      <LinearGradient
        colors={['rgba(36,31,24,0.55)', 'transparent', 'rgba(36,31,24,0.88)']}
        locations={[0, 0.35, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: gutter,
          // Clears the floating tab bar the artboard sits this rail above.
          paddingBottom: 100 + insetBottom,
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: 14,
        }}
      >
        <View style={{ flex: 1, gap: 10 }}>
          <Pressable
            onPress={onAuthor}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}
          >
            <Avatar
              url={author?.avatarUrl}
              name={author?.displayName || project.authorName}
              size={34}
              ring={author?.equippedBorder}
            />
            <Text style={{ color: INK, fontWeight: '700', fontSize: 13 }}>
              {author?.displayName || project.authorName}
            </Text>
          </Pressable>

          <Pressable onPress={onOpen}>
            <Text
              style={{ color: INK, fontSize: 18, fontWeight: '700', lineHeight: 24 }}
              numberOfLines={2}
            >
              {project.title}
            </Text>
            {project.summary ? (
              <Text style={{ color: SUBTLE, fontSize: 13, marginTop: 4 }} numberOfLines={2}>
                {project.summary}
              </Text>
            ) : null}
          </Pressable>

          {media?.kind === 'provider' ? (
            <Pressable
              onPress={() => Linking.openURL(media.url)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 7,
                alignSelf: 'flex-start',
                paddingVertical: 8,
                paddingHorizontal: 14,
                borderRadius: radius.pill,
                backgroundColor: GLASS,
              }}
            >
              <Icon name="external" size={13} color={INK} />
              <Text style={{ color: INK, fontSize: 11, fontWeight: '700' }}>{media.label}</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={{ alignItems: 'center', gap: 16 }}>
          <Rail
            icon="heart"
            filled={liked}
            value={formatCount(likeCount)}
            onPress={onLike}
          />
          <Rail icon="comment" value={formatCount(commentCount)} onPress={onComments} />
          <Rail icon="bookmark" filled={saved} value="" onPress={onSave} />
        </View>
      </View>
    </View>
  );
}

function Rail({ icon, value, onPress, filled }: any) {
  const { enabled } = useMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const mounted = useRef(false);

  useEffect(() => {
    // Skipped on mount - only an actual like/save toggle should pop, not
    // the initial render of an already-liked card while scrolling past it.
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (!enabled) return;
    scale.setValue(1);
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.35, useNativeDriver: true, speed: 40, bounciness: 10 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }),
    ]).start();
  }, [filled, enabled, scale]);

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({ alignItems: 'center', gap: 4, opacity: pressed ? 0.6 : 1 })}
    >
      <Animated.View
        style={{
          width: 48,
          height: 48,
          borderRadius: radius.pill,
          backgroundColor: GLASS,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ scale }],
        }}
      >
        <Icon
          name={icon}
          size={23}
          color={INK}
          fill={filled ? '#c67139' : 'none'}
          strokeWidth={filled ? 1.6 : 2.4}
        />
      </Animated.View>
      {value ? <Text style={{ color: INK, fontSize: 11, fontWeight: '700' }}>{value}</Text> : null}
    </Pressable>
  );
}

function ScrollMedia({ media, poster, active, height }: any) {
  // One player instance per mounted card. windowSize={3} above is what keeps
  // that from meaning "one per entry in the feed".
  const isVideo = media?.kind === 'video';
  const player = useVideoPlayer(isVideo ? media.url : null, (p) => {
    p.loop = true;
    p.muted = false;
  });

  useEffect(() => {
    if (!isVideo || !player) return;
    if (active) player.play();
    else player.pause();
  }, [active, isVideo, player]);

  if (isVideo) {
    return (
      <VideoView
        player={player}
        style={{ width: '100%', height }}
        contentFit="contain"
        nativeControls={false}
      />
    );
  }

  const imageUri = media?.kind === 'image' ? media.url : poster;

  if (imageUri) {
    return (
      <Image
        source={{ uri: imageUri }}
        style={{ width: '100%', height }}
        contentFit="cover"
        transition={200}
      />
    );
  }

  // Audio and provider entries have no picture of their own - the poster is
  // whatever the author set, and failing that a plain field so the text rail
  // still has something to sit on.
  // Nothing playable: Bloom's own warm wash rather than a flat dark panel.
  return (
    <LinearGradient
      colors={['#c67139', '#5c4327', NIGHT]}
      locations={[0, 0.45, 1]}
      start={{ x: 0.85, y: 0 }}
      end={{ x: 0.15, y: 1 }}
      style={{ width: '100%', height }}
    />
  );
}
