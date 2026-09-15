import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import type { Project } from '../data/projects';
import { coverFor } from '../lib/media';
import { useEntrance, usePressScale } from '../lib/motion';
import { formatCount, timeAgo, typeMeta } from '../lib/utils';
import { useTheme } from '../theme/ThemeProvider';
import { radius } from '../theme/tokens';
import { Icon, IconName } from './icons';
import { placeholderFor } from './ProjectCard';
import { Text } from './Text';
import { Avatar, DisplayName, LevelChip } from './ui';

// An entry drawn as a post, the same shape as the website's feed
// (js/post-card.js): who posted it and when on top, then the words and tags,
// the picture, and the actions underneath - which work right here on the card.

type Props = {
  project: Project;
  author?: {
    displayName: string;
    avatarUrl: string;
    equippedBorder?: string;
    equippedNameEffect?: string;
  };
  level?: number;
  likeCount: number;
  commentCount: number;
  liked: boolean;
  saved: boolean;
  onPress: () => void;
  onAuthorPress: () => void;
  onLike: () => void;
  onSave: () => void;
  onShare: () => void;
  index?: number;
};

const PLAYABLE = new Set(['music', 'video']);

function Action({
  icon,
  label,
  active,
  activeColor,
  filled,
  onPress,
  accessibilityLabel,
}: {
  icon: IconName;
  label?: string;
  active?: boolean;
  activeColor?: string;
  filled?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  const color = active ? activeColor || colors.primary : colors.textMuted;
  return (
    <Pressable
      onPress={onPress}
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
      <Icon name={icon} size={19} color={color} fill={filled ? color : 'none'} />
      {label !== undefined ? (
        <Text style={{ fontSize: 13, fontWeight: '700', color }}>{label}</Text>
      ) : null}
    </Pressable>
  );
}

export function PostCard({
  project,
  author,
  level,
  likeCount,
  commentCount,
  liked,
  saved,
  onPress,
  onAuthorPress,
  onLike,
  onSave,
  onShare,
  index = 0,
}: Props) {
  const { colors } = useTheme();
  const entrance = useEntrance(index);
  const { scale, onPressIn, onPressOut } = usePressScale(0.985);

  const type = project.type || 'other';
  const meta = typeMeta(type);
  const cover = coverFor(project);
  const text = project.summary || project.description.slice(0, 220);
  const name = author?.displayName || project.authorName;

  return (
    <Animated.View
      style={{
        opacity: entrance.opacity,
        transform: entrance.transform,
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderColor: colors.border,
        overflow: 'hidden',
      }}
    >
      {/* Who and when */}
      <Pressable
        onPress={onAuthorPress}
        accessibilityRole="link"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10 }}
      >
        <Avatar url={author?.avatarUrl} name={name} size={40} ring={author?.equippedBorder} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <DisplayName name={name} effect={author?.equippedNameEffect} style={{ fontSize: 14, flexShrink: 1 }} />
            {level ? <LevelChip level={level} small /> : null}
          </View>
          <Text style={{ fontSize: 12, color: colors.textFaint, marginTop: 1 }}>
            {timeAgo(project.createdAt)} · {meta.label}
          </Text>
        </View>
      </Pressable>

      {/* What */}
      <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
        <Animated.View style={{ transform: [{ scale }] }}>
          <View style={{ paddingHorizontal: 14, paddingBottom: 12, gap: 4 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', lineHeight: 21, color: colors.text }} numberOfLines={3}>
              {project.title}
            </Text>
            {text ? (
              <Text style={{ fontSize: 13, lineHeight: 20, color: colors.textMuted }} numberOfLines={4}>
                {text}
              </Text>
            ) : null}
            {project.tags.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {project.tags.slice(0, 4).map((tag) => (
                  <View
                    key={tag}
                    style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt }}
                  >
                    <Text style={{ fontSize: 11, color: colors.textMuted }}>#{tag}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          {/* The picture, inset like the website's */}
          <View
            style={{
              marginHorizontal: 10,
              aspectRatio: 16 / 9,
              borderRadius: radius.md,
              overflow: 'hidden',
            }}
          >
            <LinearGradient
              colors={placeholderFor(type) as any}
              start={{ x: 0.15, y: 0 }}
              end={{ x: 0.85, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            {cover ? (
              <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
            ) : null}
            <View
              style={{
                position: 'absolute',
                top: 10,
                left: 10,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 9,
                paddingVertical: 4,
                borderRadius: radius.pill,
                backgroundColor: 'rgba(32,30,29,0.62)',
              }}
            >
              <Feather name={meta.icon} size={11} color="#fdf7ea" />
              <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, color: '#fdf7ea' }}>
                {meta.label.toUpperCase()}
              </Text>
            </View>
            {PLAYABLE.has(type) ? (
              <View
                style={{
                  position: 'absolute',
                  right: 12,
                  bottom: 12,
                  width: 44,
                  height: 44,
                  borderRadius: radius.pill,
                  backgroundColor: colors.bg,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="play" size={19} color={colors.primaryDeep} />
              </View>
            ) : null}
          </View>
        </Animated.View>
      </Pressable>

      {/* Actions */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 6, paddingTop: 6, paddingBottom: 8 }}>
        <Action
          icon="heart"
          label={formatCount(likeCount)}
          active={liked}
          activeColor="#e0245e"
          filled={liked}
          onPress={onLike}
          accessibilityLabel={liked ? 'Unlike' : 'Like'}
        />
        <Action icon="comment" label={formatCount(commentCount)} onPress={onPress} accessibilityLabel="Comments" />
        <Action icon="share" onPress={onShare} accessibilityLabel="Share" />
        <View style={{ flex: 1 }} />
        <Action
          icon="bookmark"
          active={saved}
          activeColor={colors.accentDeep}
          filled={saved}
          onPress={onSave}
          accessibilityLabel={saved ? 'Saved' : 'Save'}
        />
      </View>
    </Animated.View>
  );
}
