import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Project } from '../data/projects';
import { useEntrance, usePressScale } from '../lib/motion';
import { formatCount, timeAgo } from '../lib/utils';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, typography } from '../theme/tokens';
import { Avatar, LevelChip, TypeBadge } from './ui';

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

  return (
    <Animated.View style={{ opacity: entrance.opacity, transform: [...entrance.transform, { scale }] }}>
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={({ pressed }) => ({
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderRadius: radius.md,
        overflow: 'hidden',
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {project.imageUrl ? (
        <Image
          source={{ uri: project.imageUrl }}
          style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: colors.mutedSoft }}
          contentFit="cover"
          transition={150}
        />
      ) : null}

      <View style={{ padding: space.lg, gap: space.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <TypeBadge type={project.type || 'other'} />
          {!project.published ? (
            <Text style={[typography.eyebrow, { color: colors.primary }]}>Draft</Text>
          ) : null}
        </View>

        <Text style={[typography.h3, { color: colors.text }]} numberOfLines={2}>
          {project.title}
        </Text>

        {project.summary ? (
          <Text style={[typography.body, { color: colors.textMuted }]} numberOfLines={2}>
            {project.summary}
          </Text>
        ) : null}

        {project.tags && project.tags.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
            {project.tags.slice(0, 4).map((tag) => (
              <Text
                key={tag}
                style={{
                  fontSize: 10,
                  color: colors.textFaint,
                  borderColor: colors.border,
                  borderWidth: StyleSheet.hairlineWidth * 2,
                  borderRadius: radius.sm,
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                }}
              >
                {tag}
              </Text>
            ))}
          </View>
        ) : null}

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.sm,
            marginTop: space.xs,
            paddingTop: space.sm,
            borderTopWidth: StyleSheet.hairlineWidth * 2,
            borderTopColor: colors.border,
          }}
        >
          <Pressable
            onPress={onAuthorPress}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}
          >
            <Avatar
              url={author?.avatarUrl}
              name={author?.displayName || project.authorName}
              size={22}
              ring={author?.equippedBorder}
            />
            <Text style={[typography.small, { color: colors.textMuted, flexShrink: 1 }]} numberOfLines={1}>
              {author?.displayName || project.authorName}
            </Text>
            {level ? <LevelChip level={level} small /> : null}
          </Pressable>

          <View style={{ flex: 1 }} />

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            {typeof likeCount === 'number' ? (
              <Metric icon="heart" value={likeCount} />
            ) : null}
            {typeof commentCount === 'number' ? (
              <Metric icon="message-circle" value={commentCount} />
            ) : null}
            <Metric icon="eye" value={project.viewsCount || 0} />
          </View>
        </View>

        <Text style={[typography.small, { color: colors.textFaint, fontSize: 10 }]}>
          {project.createdAt ? timeAgo(project.createdAt) : ''}
        </Text>
      </View>
    </Pressable>
    </Animated.View>
  );
}

function Metric({ icon, value }: { icon: any; value: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      <Feather name={icon} size={12} color={colors.textFaint} />
      <Text style={{ fontSize: 11, color: colors.textFaint }}>{formatCount(value)}</Text>
    </View>
  );
}
