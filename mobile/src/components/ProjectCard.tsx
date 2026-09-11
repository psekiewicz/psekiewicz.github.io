import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Animated, Pressable, Text, View } from 'react-native';

import type { Project } from '../data/projects';
import { useEntrance, usePressScale } from '../lib/motion';
import { useTheme } from '../theme/ThemeProvider';
import { radius, typography } from '../theme/tokens';
import { CountPill, TonePill } from './bloom';
import { Icon } from './icons';
import { Avatar, LevelChip } from './ui';

type Props = {
  project: Partial<Project> & { id: string; title: string };
  author?: { displayName: string; avatarUrl: string; equippedBorder?: string };
  level?: number;
  likeCount?: number;
  commentCount?: number;
  onPress: () => void;
  onAuthorPress?: () => void;
  // Position within the list it's rendered in, so entrance animations can
  // stagger one card after the next instead of every card popping in at
  // once. Omit it outside a list (e.g. a single featured card).
  index?: number;
};

// The gradients the artboard stands in for artwork with, kept per entry type so
// an entry with no image still lands somewhere in the palette rather than on a
// flat grey.
const PLACEHOLDERS: Record<string, string[]> = {
  music: ['#d8c9a4', '#b9a887', '#8f8468'],
  video: ['#c9d0b3', '#6f7a55'],
  image: ['#e2d0ae', '#c67139'],
  app: ['#e4e7d5', '#a6b287'],
  other: ['#b9a887', '#4a4034'],
};

export function placeholderFor(type?: string) {
  return PLACEHOLDERS[type || 'other'] || PLACEHOLDERS.other;
}

export function ProjectCard({
  project,
  author,
  level,
  likeCount,
  commentCount,
  onPress,
  onAuthorPress,
  index = 0,
}: Props) {
  const { colors } = useTheme();
  const { scale, onPressIn, onPressOut } = usePressScale(0.97);
  const entrance = useEntrance(index);

  const type = project.type || 'other';
  const isPlayable = type === 'music' || type === 'video';

  return (
    <Animated.View style={{ opacity: entrance.opacity, transform: [...entrance.transform, { scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={({ pressed }) => ({
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          overflow: 'hidden',
          opacity: pressed ? 0.9 : 1,
        })}
      >
        <View style={{ height: 172 }}>
          {project.imageUrl ? (
            <Image
              source={{ uri: project.imageUrl }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              transition={150}
            />
          ) : (
            <LinearGradient
              colors={placeholderFor(type) as any}
              start={{ x: 0.15, y: 0 }}
              end={{ x: 0.85, y: 1 }}
              style={{ width: '100%', height: '100%' }}
            />
          )}

          <View style={{ position: 'absolute', top: 14, left: 14 }}>
            <TonePill label={type.toUpperCase()} tone="dark" />
          </View>

          {!project.published ? (
            <View style={{ position: 'absolute', top: 14, right: 14 }}>
              <TonePill label="DRAFT" tone="primary" />
            </View>
          ) : null}

          {isPlayable ? (
            <View
              style={{
                position: 'absolute',
                right: 14,
                bottom: 14,
                width: 46,
                height: 46,
                borderRadius: radius.pill,
                backgroundColor: colors.bg,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="play" size={20} color={colors.primaryDeep} />
            </View>
          ) : null}
        </View>

        <View style={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 18, gap: 9 }}>
          <Text style={[typography.cardTitle, { color: colors.text }]} numberOfLines={2}>
            {project.title}
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
            <Pressable
              onPress={onAuthorPress}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 9, flexShrink: 1 }}
            >
              <Avatar
                url={author?.avatarUrl}
                name={author?.displayName || project.authorName}
                size={24}
                ring={author?.equippedBorder}
              />
              <Text
                style={{ fontSize: 12, fontWeight: '700', color: colors.text, flexShrink: 1 }}
                numberOfLines={1}
              >
                {author?.displayName || project.authorName}
              </Text>
              {level ? <LevelChip level={level} small /> : null}
            </Pressable>

            <View style={{ flex: 1 }} />

            {typeof likeCount === 'number' ? (
              <CountPill icon="heart" count={likeCount} tone="primary" />
            ) : null}
            {typeof commentCount === 'number' ? (
              <CountPill icon="comment" count={commentCount} tone="accent" />
            ) : null}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}
