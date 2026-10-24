import { useEvent } from 'expo';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, FlatList, Pressable, StyleSheet, View, ViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, IconName } from '../components/icons';
import { ProviderEmbed } from '../components/ProviderEmbed';
import { Text } from '../components/Text';
import { Avatar, EmptyState, Loading } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { getUnreadCount } from '../data/notifications';
import { getProfilesByIds, Profile } from '../data/profiles';
import { DEMOS_PAGE_SIZE, getDemoProjects, getProjectById, Project } from '../data/projects';
import { logProjectView } from '../data/views';
import { openLink } from '../lib/links';
import { firstImage } from '../lib/markdown';
import { resolveMedia, uploadedPosterFor } from '../lib/media';
import { safeUrl } from '../lib/utils';
import { useTheme } from '../theme/ThemeProvider';
import { gutter, radius, space } from '../theme/tokens';

// Demos: every published entry with a live URL, one full screen each - the
// clip (or picture) first, "Try it" under it. XOXD is only demos, so this is
// the first tab, and its top bar carries what the old Home tab did - the
// notifications bell and the leaderboard - plus News. The native side of the site's home
// page.
// Nothing from the demo itself runs in the app: "Try it" opens it in the
// browser.
//
// Paging is the list's own (pagingEnabled), and only the card on screen and
// its two neighbours are ever mounted (windowSize={3}). That is what keeps a
// long feed cheap: at most three video players exist at once, and the next
// card's player is already loading its clip while you watch this one, so it
// starts the moment you swipe to it. A card shows its poster until its clip
// has a frame of its own. The next page loads with two screens still to go.

const INK = '#ffffff';
const SUBTLE = 'rgba(255,255,255,0.75)';
const NIGHT = '#191713';
const GLASS = 'rgba(255,255,255,0.16)';

export function DemosScreen({ navigation, route }: any) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  // The bell's dot. Refetched whenever the tab comes back into focus, so
  // reading everything on the notifications screen clears it here.
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    const refresh = () => {
      if (!user) return setUnread(0);
      getUnreadCount().then(setUnread).catch(() => setUnread(0));
    };
    refresh();
    return navigation.addListener('focus', refresh);
  }, [navigation, user]);

  const [feed, setFeed] = useState<Project[]>([]);
  const [authors, setAuthors] = useState<Map<string, Profile>>(new Map());
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [cardHeight, setCardHeight] = useState(Dimensions.get('window').height);
  const listRef = useRef<FlatList<Project>>(null);

  // Read by the loader while it runs, so kept in refs rather than state.
  const cursorRef = useRef<string | null>(null);
  const exhaustedRef = useRef(false);
  const busyRef = useRef(false);
  // "Open in Demos" from an entry lands on that entry's own card, the way
  // demos.html#<id> does on the site.
  const pinRef = useRef<string | null>(route?.params?.projectId ?? null);

  const loadPage = useCallback(async (reset: boolean) => {
    if (busyRef.current) return;
    if (!reset && exhaustedRef.current) return;
    busyRef.current = true;
    try {
      if (reset) {
        cursorRef.current = null;
        exhaustedRef.current = false;
      }
      const pinned = reset ? pinRef.current : null;
      let rows = await getDemoProjects({ before: cursorRef.current ?? undefined });
      if (rows.length < DEMOS_PAGE_SIZE) exhaustedRef.current = true;
      if (rows.length) cursorRef.current = rows[rows.length - 1].createdAt;
      if (pinned) {
        const row = rows.find((p) => p.id === pinned) || (await getProjectById(pinned).catch(() => null));
        if (row && row.published && row.liveUrl) rows = [row, ...rows.filter((p) => p.id !== pinned)];
        pinRef.current = null;
      }
      const profiles = await getProfilesByIds(rows.map((p) => p.uid)).catch(() => new Map<string, Profile>());
      setAuthors((prev) => (reset ? profiles : new Map([...prev, ...profiles])));
      setFeed((prev) => {
        if (reset) return rows;
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...rows.filter((p) => !seen.has(p.id))];
      });
      if (reset) {
        setActiveIndex(0);
        listRef.current?.scrollToOffset({ offset: 0, animated: false });
      }
    } catch {
      if (reset) setFeed([]);
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPage(true);
  }, [loadPage]);

  // Arriving from an entry while this tab is already mounted.
  useEffect(() => {
    const id = route?.params?.projectId;
    if (!id) return;
    pinRef.current = id;
    navigation.setParams({ projectId: undefined });
    loadPage(true);
  }, [route?.params?.projectId, navigation, loadPage]);

  // A view counts after 3 seconds on a card - the same threshold as the site.
  const dwellTimer = useRef<any>(null);
  useEffect(() => () => clearTimeout(dwellTimer.current), []);
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0];
    if (!first) return;
    setActiveIndex(first.index ?? 0);
    const project = first.item as Project;
    clearTimeout(dwellTimer.current);
    dwellTimer.current = setTimeout(() => {
      logProjectView(project.id).catch(() => {});
    }, 3000);
  }).current;

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
          title="No demos yet"
          body="Entries with a live link show up here, one screen each, with their clip first."
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: NIGHT }} onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}>
      <FlatList
        ref={listRef}
        data={feed}
        keyExtractor={(item) => item.id}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={cardHeight}
        snapToAlignment="start"
        decelerationRate="fast"
        onEndReached={() => loadPage(false)}
        onEndReachedThreshold={2}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        getItemLayout={(_, index) => ({ length: cardHeight, offset: cardHeight * index, index })}
        windowSize={3}
        maxToRenderPerBatch={2}
        initialNumToRender={2}
        removeClippedSubviews
        renderItem={({ item, index }) => (
          <DemoCard
            project={item}
            author={authors.get(item.uid)}
            height={cardHeight}
            active={index === activeIndex}
            insetBottom={insets.bottom}
            onAuthor={() => navigation.navigate('UserProfile', { userId: item.uid })}
            onOpen={() => navigation.navigate('ProjectDetail', { projectId: item.id })}
          />
        )}
      />
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: insets.top + space.md,
          left: gutter,
          right: gutter,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <Text style={{ color: INK, fontSize: 15, fontWeight: '700', flex: 1 }}>Demos</Text>
        <GlassButton
          icon="bell"
          label="Notifications"
          dot={unread > 0}
          onPress={() => navigation.navigate(user ? 'Notifications' : 'Login')}
        />
      </View>
    </View>
  );
}

// A round see-through button over the dark feed, for the top bar.
function GlassButton({ icon, label, dot, onPress }: { icon: IconName; label: string; dot?: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={dot ? `${label}, unread` : label}
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        marginLeft: space.sm,
        backgroundColor: GLASS,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={icon} size={18} color={INK} />
      {dot ? (
        <View
          style={{ position: 'absolute', top: 7, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }}
        />
      ) : null}
    </Pressable>
  );
}

function DemoCard({ project, author, height, active, insetBottom, onAuthor, onOpen }: any) {
  const media = resolveMedia(project.mediaUrl, project.type);
  const framePoster = media?.kind === 'video' ? uploadedPosterFor(media.url) : '';
  const poster =
    framePoster ||
    (media?.kind === 'image' ? media.url : '') ||
    project.scrollImageUrl ||
    project.imageUrl ||
    firstImage(project.description) ||
    '';
  const live = safeUrl(project.liveUrl);
  const repo = safeUrl(project.repoUrl);

  return (
    <View style={{ height, width: '100%', backgroundColor: NIGHT }}>
      <DemoMedia media={media} poster={poster} framed={Boolean(framePoster)} active={active} height={height} />

      <LinearGradient
        colors={['rgba(25,23,19,0.55)', 'transparent', 'rgba(25,23,19,0.9)']}
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
          // Clears the floating tab bar.
          paddingBottom: 100 + insetBottom,
          gap: 10,
        }}
      >
        <Pressable onPress={onAuthor} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
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
          <Text style={{ color: INK, fontSize: 18, fontWeight: '700', lineHeight: 24 }} numberOfLines={2}>
            {project.title}
          </Text>
          {project.summary ? (
            <Text style={{ color: SUBTLE, fontSize: 13, marginTop: 4 }} numberOfLines={2}>
              {project.summary}
            </Text>
          ) : null}
        </Pressable>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {live ? <Pill label="Try it" icon="external" primary onPress={() => openLink(live)} /> : null}
          {repo ? <Pill label="Source" onPress={() => openLink(repo)} /> : null}
          <Pill label="Details" onPress={onOpen} />
        </View>
      </View>
    </View>
  );
}

function Pill({ label, icon, primary, onPress }: any) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: radius.pill,
        backgroundColor: primary ? colors.primary : GLASS,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      {icon ? <Icon name={icon} size={14} color={INK} /> : null}
      <Text style={{ color: INK, fontSize: 13, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

function DemoMedia({ media, poster, framed, active, height }: any) {
  if (media?.kind === 'video') {
    return <DemoClip url={media.url} poster={poster} framed={framed} active={active} height={height} />;
  }
  // A provider's player is a whole page; only the card on screen gets one,
  // the others show the poster.
  if (active && media?.kind === 'provider' && media.embedUrl && !media.compact) {
    return (
      <ProviderEmbed
        embedUrl={media.embedUrl}
        allowedHosts={media.embedHosts || []}
        height={height}
        autoplayParams={media.embedAutoplay}
        onNavigateOut={(url: string) => openLink(url)}
      />
    );
  }
  if (poster) {
    return <Image source={{ uri: poster }} style={{ width: '100%', height }} contentFit="cover" transition={200} />;
  }
  return (
    <LinearGradient
      colors={['#1f7a99', '#12384a', NIGHT]}
      locations={[0, 0.45, 1]}
      start={{ x: 0.85, y: 0 }}
      end={{ x: 0.15, y: 1 }}
      style={{ width: '100%', height }}
    />
  );
}

// Mounted for the card on screen and its neighbours only (windowSize above),
// so the neighbour's player is loading while you watch - that is the preload.
function DemoClip({ url, poster, framed, active, height }: any) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (isPlaying) setStarted(true);
  }, [isPlaying]);

  useEffect(() => {
    if (active) player.play();
    else player.pause();
  }, [active, player]);

  return (
    <View style={{ width: '100%', height }}>
      <VideoView player={player} style={{ width: '100%', height }} contentFit="contain" nativeControls={false} />
      {poster && !started ? (
        <Image
          source={{ uri: poster }}
          style={[StyleSheet.absoluteFill, { width: '100%', height }]}
          contentFit={framed ? 'contain' : 'cover'}
        />
      ) : null}
    </View>
  );
}
