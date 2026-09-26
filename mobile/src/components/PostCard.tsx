import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Project } from '../data/projects';
import { coverFor } from '../lib/media';
import { stripMarkdown } from '../lib/markdown';
import { formatCount, timeAgo, typeMeta } from '../lib/utils';
import { useTheme } from '../theme/ThemeProvider';
import { radius } from '../theme/tokens';
import { Icon, IconName } from './icons';
import { placeholderFor } from './ProjectCard';
import { Text } from './Text';
import { Avatar, DisplayName, LevelChip } from './ui';

// An entry drawn the way a timeline draws a post: the avatar down the left, one
// column of content beside it, and a row of flat actions spread underneath.
// Posts are full-bleed and separated by a hairline rather than boxed in their
// own cards - the density every feed app settled on, because a card's border
// and margins cost about one post per screen and say nothing.

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

export function PostAction({
  icon,
  label,
  active,
  activeColor,
  onPress,
  accessibilityLabel,
}: {
  icon: IconName;
  label?: string;
  active?: boolean;
  activeColor?: string;
  /** Left off for a count that is only there to be read, as on a post's page. */
  onPress?: () => void;
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  const tint = activeColor || colors.primary;
  const color = active ? tint : colors.textFaint;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: !!active }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 4,
        paddingRight: 6,
        opacity: pressed ? 0.55 : 1,
      })}
    >
      <Icon name={icon} size={18} color={color} fill={active ? color : 'none'} strokeWidth={2.2} />
      {label !== undefined && label !== '0' ? (
        <Text style={{ fontSize: 12.5, fontWeight: '600', color }}>{label}</Text>
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
}: Props) {
  const { colors } = useTheme();

  const type = project.type || 'other';
  const meta = typeMeta(type);
  const cover = coverFor(project);
  const text = project.summary || stripMarkdown(project.description).slice(0, 220);
  const name = author?.displayName || project.authorName;
  // A text post stays text: no picture means no placeholder block, which at
  // this density would be a screenful of gradient saying nothing. What kind of
  // entry it is moves up beside the time instead.
  const showMedia = !!cover || PLAYABLE.has(type);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${project.title}, by ${name}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        gap: 11,
        paddingHorizontal: 14,
        paddingTop: 12,
        paddingBottom: 8,
        borderBottomWidth: StyleSheet.hairlineWidth * 2,
        borderBottomColor: colors.border,
        backgroundColor: pressed ? colors.surface : colors.bg,
      })}
    >
      <Pressable onPress={onAuthorPress} hitSlop={6} accessibilityRole="link" accessibilityLabel={name}>
        <Avatar url={author?.avatarUrl} name={name} size={42} ring={author?.equippedBorder} />
      </Pressable>

      <View style={{ flex: 1, minWidth: 0 }}>
        {/* Who, and when - one line, the way a timeline writes it. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <DisplayName
            name={name}
            effect={author?.equippedNameEffect}
            style={{ fontSize: 14, flexShrink: 1 }}
          />
          {level ? <LevelChip level={level} small /> : null}
          <Text style={{ fontSize: 12.5, color: colors.textFaint }} numberOfLines={1}>
            · {timeAgo(project.createdAt)}
            {showMedia ? '' : ` · ${meta.label}`}
          </Text>
        </View>

        <Text style={{ fontSize: 15, fontWeight: '700', lineHeight: 20, color: colors.text, marginTop: 3 }} numberOfLines={3}>
          {project.title}
        </Text>
        {text ? (
          <Text style={{ fontSize: 13.5, lineHeight: 19, color: colors.textMuted, marginTop: 2 }} numberOfLines={3}>
            {text}
          </Text>
        ) : null}
        {project.tags.length ? (
          <Text style={{ fontSize: 12.5, color: colors.primaryDeep, marginTop: 3 }} numberOfLines={1}>
            {project.tags.slice(0, 4).map((tag) => `#${tag}`).join(' ')}
          </Text>
        ) : null}

        {/* The picture fills the column beside the avatar, as an attachment. */}
        {showMedia ? (
          <View
            style={{
              marginTop: 9,
              aspectRatio: 16 / 9,
              borderRadius: radius.sm,
              overflow: 'hidden',
              borderWidth: StyleSheet.hairlineWidth * 2,
              borderColor: colors.border,
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
                top: 8,
                left: 8,
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: radius.pill,
                backgroundColor: 'rgba(32,30,29,0.62)',
              }}
            >
              <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: '#fdf7ea' }}>
                {meta.label.toUpperCase()}
              </Text>
            </View>
            {PLAYABLE.has(type) ? (
              <View
                style={{
                  position: 'absolute',
                  right: 10,
                  bottom: 10,
                  width: 38,
                  height: 38,
                  borderRadius: radius.pill,
                  backgroundColor: 'rgba(32,30,29,0.72)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="play" size={17} color="#fdf7ea" fill="#fdf7ea" />
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Actions, spread across the column. */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 8,
            paddingRight: 8,
          }}
        >
          <PostAction
            icon="comment"
            label={formatCount(commentCount)}
            onPress={onPress}
            accessibilityLabel={`${commentCount} comments`}
          />
          <PostAction
            icon="heart"
            label={formatCount(likeCount)}
            active={liked}
            activeColor="#e0245e"
            onPress={onLike}
            accessibilityLabel={liked ? 'Unlike' : 'Like'}
          />
          <PostAction icon="share" onPress={onShare} accessibilityLabel="Share" />
          <PostAction
            icon="bookmark"
            active={saved}
            activeColor={colors.accentDeep}
            onPress={onSave}
            accessibilityLabel={saved ? 'Saved' : 'Save'}
          />
        </View>
      </View>
    </Pressable>
  );
}
