import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { CommentsSheet } from '../components/CommentsSheet';
import {
  Avatar,
  Body,
  Button,
  Card,
  ErrorNote,
  Eyebrow,
  Heading,
  LevelChip,
  Loading,
  TypeBadge,
} from '../components/ui';
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
  const { projectId } = route.params;
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
  const [showComments, setShowComments] = useState(false);
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

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={{ paddingBottom: space.xxl }}
      >
        {project.imageUrl && media?.kind !== 'image' ? (
          <Image
            source={{ uri: project.imageUrl }}
            style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: colors.mutedSoft }}
            contentFit="cover"
          />
        ) : null}

        <View style={{ padding: space.lg, gap: space.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TypeBadge type={project.type} />
            <View style={{ flex: 1 }} />
            {!project.published ? (
              <Text style={[typography.eyebrow, { color: colors.primary }]}>Draft</Text>
            ) : null}
          </View>

          <Heading>{project.title}</Heading>

          {project.summary ? <Body muted>{project.summary}</Body> : null}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Text style={[typography.small, { color: colors.textFaint }]}>
              {timeAgo(project.createdAt)}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Feather name="eye" size={12} color={colors.textFaint} />
              <Text style={[typography.small, { color: colors.textFaint }]}>
                {formatCount(project.viewsCount)}
              </Text>
            </View>
          </View>

          <MediaBlock media={media} colors={colors} />

          {/* Author */}
          <Card style={{ marginTop: space.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <Pressable
                onPress={() => navigation.navigate('UserProfile', { userId: project.uid })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, flex: 1 }}
              >
                <Avatar
                  url={author?.avatarUrl}
                  name={author?.displayName || project.authorName}
                  size={40}
                  ring={author?.equippedBorder}
                />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>
                      {author?.displayName || project.authorName}
                    </Text>
                    {level ? <LevelChip level={level} small /> : null}
                  </View>
                  <Text style={[typography.small, { color: colors.textFaint }]}>View profile</Text>
                </View>
              </Pressable>

              {!isOwner ? (
                <Button
                  small
                  label={following ? 'Following' : 'Follow'}
                  variant={following ? 'secondary' : 'primary'}
                  onPress={toggleFollow}
                />
              ) : null}
            </View>
          </Card>

          {project.description ? (
            <>
              <Eyebrow style={{ marginTop: space.md }}>About</Eyebrow>
              <Body>{project.description}</Body>
            </>
          ) : null}

          {project.tags.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.sm }}>
              {project.tags.map((tag) => (
                <Text
                  key={tag}
                  style={{
                    fontSize: 11,
                    color: colors.textMuted,
                    borderColor: colors.border,
                    borderWidth: StyleSheet.hairlineWidth * 2,
                    borderRadius: radius.sm,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                  }}
                >
                  {tag}
                </Text>
              ))}
            </View>
          ) : null}

          {(project.liveUrl || project.repoUrl) ? (
            <View style={{ gap: space.sm, marginTop: space.md }}>
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

          {isOwner ? (
            <Button
              label="Edit this entry"
              icon="edit-2"
              variant="secondary"
              style={{ marginTop: space.md }}
              onPress={() => navigation.navigate('Editor', { projectId: project.id })}
            />
          ) : null}
        </View>
      </ScrollView>

      {/* Action bar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-around',
          paddingVertical: space.md,
          backgroundColor: colors.surface,
          borderTopWidth: StyleSheet.hairlineWidth * 2,
          borderTopColor: colors.border,
        }}
      >
        <BarAction
          icon="heart"
          label={formatCount(likeCount)}
          active={liked}
          activeColor="#ff3b5c"
          onPress={toggleLike}
        />
        <BarAction
          icon="message-circle"
          label={formatCount(commentCount)}
          onPress={() => setShowComments(true)}
        />
        <BarAction
          icon="bookmark"
          label="Save"
          active={savedState}
          activeColor={colors.accent}
          onPress={toggleSave}
        />
        <BarAction icon="share-2" label="Share" onPress={share} />
      </View>

      <CommentsSheet
        projectId={projectId}
        ownerId={project.uid}
        visible={showComments}
        onClose={() => setShowComments(false)}
        onCountChange={(_id, delta) => setCommentCount((c) => Math.max(0, c + delta))}
      />
    </>
  );
}

function BarAction({ icon, label, onPress, active, activeColor }: any) {
  const { colors } = useTheme();
  const color = active ? activeColor || colors.primary : colors.textMuted;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({ alignItems: 'center', gap: 3, opacity: pressed ? 0.6 : 1 })}
    >
      <Feather name={icon} size={20} color={color} />
      <Text style={{ fontSize: 10, color, fontWeight: '700' }}>{label}</Text>
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
