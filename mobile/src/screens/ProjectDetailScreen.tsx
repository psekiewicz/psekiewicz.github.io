import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProviderEmbed } from '../components/ProviderEmbed';
import { CommentsSection } from '../components/CommentsSection';
import { Icon } from '../components/icons';
import { ReportSheet } from '../components/ReportSheet';
import { Avatar, Button, DisplayName, ErrorNote, LevelChip, Loading, TypeBadge } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { getCommentCounts } from '../data/comments';
import { followUser, isFollowing, unfollowUser } from '../data/follows';
import { getLikeCounts, getLikedSet, likeProject, unlikeProject } from '../data/likes';
import { getProfile, Profile } from '../data/profiles';
import { getProjectById, Project } from '../data/projects';
import { isSaved, saveProject, unsaveProject } from '../data/saves';
import { logProjectView } from '../data/views';
import { levelFromXp } from '../lib/levels';
import { getReputation } from '../data/reputation';
import { resolveMedia } from '../lib/media';
import { formatCount, timeAgo } from '../lib/utils';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, typography } from '../theme/tokens';

export function ProjectDetailScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  // `id` when opened from a site link (project.html?id=...), `projectId` in-app.
  const projectId = route.params.projectId ?? route.params.id;
  const { colors } = useTheme();
  const { user } = useAuth();

  const [project, setProject] = useState<Project | null>(null);
  const [author, setAuthor] = useState<Profile | null>(null);
  const [level, setLevel] = useState<number | null>(null);
  const [likeCount, setLikeCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [liked, setLiked] = useState(false);
  const [savedState, setSavedState] = useState(false);
  const [following, setFollowing] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const row = await getProjectById(projectId);
      if (!row) {
        setError('This entry no longer exists, or it was unpublished.');
        return;
      }
      setProject(row);

      const [profileRow, reputation, likes, comments, likedSet, saved, follows] = await Promise.all([
        getProfile(row.uid).catch(() => null),
        getReputation(row.uid).catch(() => null),
        getLikeCounts([row.id]).catch(() => new Map()),
        getCommentCounts([row.id]).catch(() => new Map()),
        getLikedSet(user?.id ?? null, [row.id]).catch(() => new Set<string>()),
        isSaved(user?.id ?? null, row.id).catch(() => false),
        user ? isFollowing(user.id, row.uid).catch(() => false) : Promise.resolve(false),
      ]);

      setAuthor(profileRow);
      setLevel(reputation ? levelFromXp(reputation.xp).level : null);
      setLikeCount(likes.get(row.id) || 0);
      setCommentCount(comments.get(row.id) || 0);
      setLiked(likedSet.has(row.id));
      setSavedState(saved);
      setFollowing(follows);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [projectId, user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  // A view counts once the entry has actually been opened. The RPC decides
  // whether it counts (not your own, not twice in 6 hours), so the number on
  // screen only moves when the number everyone else sees does.
  useEffect(() => {
    if (!project) return;
    const timer = setTimeout(() => {
      logProjectView(project.id)
        .then((counted) => {
          if (counted) setProject((p) => (p ? { ...p, viewsCount: p.viewsCount + 1 } : p));
        })
        .catch(() => {});
    }, 3000);
    return () => clearTimeout(timer);
  }, [project?.id]);

  const toggleLike = async () => {
    if (!user) return navigation.navigate('Login');
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => c + (next ? 1 : -1));
    try {
      if (next) await likeProject(user.id, projectId);
      else await unlikeProject(user.id, projectId);
    } catch {
      setLiked(!next);
      setLikeCount((c) => c + (next ? -1 : 1));
    }
  };

  const toggleSave = async () => {
    if (!user) return navigation.navigate('Login');
    const next = !savedState;
    setSavedState(next);
    try {
      if (next) await saveProject(user.id, projectId);
      else await unsaveProject(user.id, projectId);
    } catch {
      setSavedState(!next);
    }
  };

  const toggleFollow = async () => {
    if (!user || !project) return navigation.navigate('Login');
    const next = !following;
    setFollowing(next);
    try {
      if (next) await followUser(user.id, project.uid);
      else await unfollowUser(user.id, project.uid);
    } catch {
      setFollowing(!next);
    }
  };

  const share = () => {
    if (!project) return;
    Share.share({
      message: `${project.title} - https://psekiewicz.github.io/project.html?id=${project.id}`,
    });
  };

  if (loading) return <Loading />;
  if (error) {
    return (
      <View style={{ padding: space.lg }}>
        <ErrorNote message={error} />
      </View>
    );
  }
  if (!project) return null;

  const media = resolveMedia(project.mediaUrl, project.type);
  const isOwner = user?.id === project.uid;

  // One post, the way the website draws it: who posted it on top, then the
  // words, the media and the actions, with the conversation directly
  // underneath rather than in a sheet.
  const card = {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: colors.border,
    borderRadius: radius.lg,
  };

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={{
          width: '100%',
          maxWidth: 680,
          alignSelf: 'center',
          padding: 10,
          gap: space.lg,
          paddingBottom: space.xxl + insets.bottom,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[card, { overflow: 'hidden' }]}>
          {/* Who and when */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14, paddingBottom: 10 }}>
            <Pressable
              onPress={() => navigation.navigate('UserProfile', { userId: project.uid })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 11, flex: 1, minWidth: 0 }}
            >
              <Avatar
                url={author?.avatarUrl}
                name={author?.displayName || project.authorName}
                size={42}
                ring={author?.equippedBorder}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <DisplayName
                    name={author?.displayName || project.authorName}
                    effect={author?.equippedNameEffect}
                    style={{ fontSize: 14, flexShrink: 1 }}
                  />
                  {level ? <LevelChip level={level} small /> : null}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 }}>
                  <Text style={{ fontSize: 12, color: colors.textFaint }}>{timeAgo(project.createdAt)}</Text>
                  <Feather name="eye" size={11} color={colors.textFaint} />
                  <Text style={{ fontSize: 12, color: colors.textFaint }}>{formatCount(project.viewsCount)}</Text>
                </View>
              </View>
            </Pressable>
            {isOwner ? (
              <Button
                small
                label="Edit"
                icon="edit-2"
                variant="secondary"
                onPress={() => navigation.navigate('Editor', { projectId: project.id })}
              />
            ) : user ? (
              <Button
                small
                label={following ? 'Following' : 'Follow'}
                variant={following ? 'secondary' : 'primary'}
                onPress={toggleFollow}
              />
            ) : null}
          </View>

          {/* What */}
          <View style={{ paddingHorizontal: 14, paddingBottom: 12, gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TypeBadge type={project.type} />
              {!project.published ? (
                <Text style={[typography.eyebrow, { color: colors.primary }]}>Draft</Text>
              ) : null}
            </View>
            <Text style={{ fontSize: 20, fontWeight: '800', lineHeight: 26, color: colors.text }}>{project.title}</Text>
            {project.summary ? (
              <Text style={{ fontSize: 14, lineHeight: 22, color: colors.textMuted }}>{project.summary}</Text>
            ) : null}
            {project.description ? (
              <Text style={{ fontSize: 14, lineHeight: 22, color: colors.text }}>{project.description}</Text>
            ) : null}
            {project.tags.length > 0 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
                {project.tags.map((tag) => (
                  <Pressable
                    key={tag}
                    onPress={() => navigation.navigate('Explore', { tag })}
                    accessibilityRole="link"
                    style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt }}
                  >
                    <Text style={{ fontSize: 11, color: colors.textMuted }}>#{tag}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>

          {/* Media */}
          {project.imageUrl && (!media || media.kind === 'link') ? (
            <View style={{ marginHorizontal: 10, borderRadius: radius.md, overflow: 'hidden' }}>
              <Image
                source={{ uri: project.imageUrl }}
                style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: colors.mutedSoft }}
                contentFit="cover"
              />
            </View>
          ) : null}
          {media ? (
            <View style={{ marginHorizontal: 10 }}>
              <MediaBlock media={media} colors={colors} />
            </View>
          ) : null}

          {(project.liveUrl || project.repoUrl) ? (
            <View style={{ gap: space.sm, paddingHorizontal: 14, paddingTop: 12 }}>
              {project.liveUrl ? (
                <Button
                  label="Open live link"
                  icon="external-link"
                  variant="secondary"
                  onPress={() => Linking.openURL(project.liveUrl)}
                />
              ) : null}
              {project.repoUrl ? (
                <Button
                  label="Open repository"
                  icon="code"
                  variant="secondary"
                  onPress={() => Linking.openURL(project.repoUrl)}
                />
              ) : null}
            </View>
          ) : null}

          {/* Actions */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 2,
              marginTop: 10,
              paddingHorizontal: 6,
              paddingVertical: 6,
              borderTopWidth: StyleSheet.hairlineWidth * 2,
              borderTopColor: colors.border,
            }}
          >
            <PostAction
              icon="heart"
              label={formatCount(likeCount)}
              active={liked}
              activeColor="#e0245e"
              onPress={toggleLike}
              accessibilityLabel={liked ? 'Unlike' : 'Like'}
            />
            <PostAction icon="comment" label={formatCount(commentCount)} accessibilityLabel="Comments" />
            <PostAction icon="share" onPress={share} accessibilityLabel="Share" />
            <View style={{ flex: 1 }} />
            <PostAction
              icon="bookmark"
              active={savedState}
              activeColor={colors.accentDeep}
              onPress={toggleSave}
              accessibilityLabel={savedState ? 'Saved' : 'Save'}
            />
            {!isOwner ? (
              // Quiet on purpose, as on the site: a way to flag an entry, not a
              // call to action. RLS refuses a report on your own entry anyway.
              <Pressable
                onPress={() => (user ? setShowReport(true) : navigation.navigate('Login'))}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Report this entry"
                style={{ padding: 10 }}
              >
                <Feather name="flag" size={16} color={colors.textFaint} />
              </Pressable>
            ) : null}
          </View>
        </View>

        <CommentsSection
          projectId={projectId}
          ownerId={project.uid}
          onCountChange={(delta) => setCommentCount((c) => Math.max(0, c + delta))}
          onSignIn={() => navigation.navigate('Login')}
          onAuthorPress={(userId) => navigation.navigate('UserProfile', { userId })}
        />
      </ScrollView>

      <ReportSheet projectId={projectId} visible={showReport} onClose={() => setShowReport(false)} />
    </>
  );
}

function PostAction({ icon, label, onPress, active, activeColor, accessibilityLabel }: any) {
  const { colors } = useTheme();
  const color = active ? activeColor || colors.primary : colors.textMuted;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: !!active }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: radius.pill,
        backgroundColor: pressed ? colors.surfaceAlt : 'transparent',
      })}
    >
      <Icon name={icon} size={19} color={color} fill={active ? color : 'none'} />
      {label !== undefined ? <Text style={{ fontSize: 13, color, fontWeight: '700' }}>{label}</Text> : null}
    </Pressable>
  );
}

function MediaBlock({ media, colors }: any) {
  if (!media) return null;

  if (media.kind === 'video') return <DetailVideo url={media.url} />;

  if (media.kind === 'image') {
    return (
      <Image
        source={{ uri: media.url }}
        style={{
          width: '100%',
          aspectRatio: 16 / 9,
          borderRadius: radius.md,
          backgroundColor: colors.mutedSoft,
        }}
        contentFit="contain"
      />
    );
  }

  if (media.kind === 'audio') return <DetailVideo url={media.url} audio />;

  // Every provider plays here rather than launching its official app. The link
  // out is kept underneath - the embeds hide comments, the channel and anything
  // needing a signed-in account, so there are still reasons to leave.
  if (media.kind === 'provider' && media.embedUrl) {
    return (
      <View style={{ gap: space.md }}>
        <View style={{ borderRadius: radius.md, overflow: 'hidden' }}>
          <ProviderEmbed
            embedUrl={media.embedUrl}
            allowedHosts={media.embedHosts || []}
            // Spotify and SoundCloud render an audio strip, not a video
            // surface, and stretching it to 16:9 leaves a band of dead space.
            height={media.compact ? 166 : 210}
            onNavigateOut={(url) => Linking.openURL(url)}
          />
        </View>
        <Button
          label={media.label}
          icon="external-link"
          variant="secondary"
          onPress={() => Linking.openURL(media.url)}
        />
      </View>
    );
  }

  if (media.kind === 'provider' || media.kind === 'link') {
    return (
      <Button
        label={media.kind === 'provider' ? media.label : 'Open link'}
        icon="external-link"
        variant="secondary"
        onPress={() => Linking.openURL(media.url)}
      />
    );
  }

  return null;
}

// expo-video plays audio-only sources too - the same player with a short,
// controls-only frame rather than a video surface.
function DetailVideo({ url, audio }: { url: string; audio?: boolean }) {
  const { colors } = useTheme();
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
  });

  return (
    <VideoView
      player={player}
      style={{
        width: '100%',
        height: audio ? 64 : undefined,
        aspectRatio: audio ? undefined : 16 / 9,
        borderRadius: radius.md,
        backgroundColor: audio ? colors.mutedSoft : '#000',
      }}
      contentFit="contain"
      nativeControls
    />
  );
}
