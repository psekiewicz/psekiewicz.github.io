import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Project } from '../data/projects';
import { coverFor } from '../lib/media';
import { formatCount, typeMeta } from '../lib/utils';
import { radius } from '../theme/tokens';
import { Icon } from './icons';
import { placeholderFor } from './ProjectCard';
import { Text } from './Text';
import { Avatar } from './ui';

// The compact form for grids - Explore and profiles - matching the website's
// tiles: the picture carries it, with the title and who made it over a dark
// fade at the bottom and the counts beside them.

type Props = {
  project: Project;
  author?: { displayName: string; avatarUrl: string };
  likeCount?: number;
  commentCount?: number;
  showAuthor?: boolean;
  onPress: () => void;
};

const PLAYABLE = new Set(['music', 'video']);
const CREAM = '#fdf7ea';

export function PostTile({ project, author, likeCount, commentCount, showAuthor = true, onPress }: Props) {
  const type = project.type || 'other';
  const meta = typeMeta(type);
  const cover = coverFor(project);
  const name = author?.displayName || project.authorName;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={project.title}
      style={({ pressed }) => ({
        flex: 1,
        aspectRatio: 4 / 5,
        borderRadius: radius.md,
        overflow: 'hidden',
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <LinearGradient
        colors={placeholderFor(type) as any}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {cover ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} /> : null}

      <View
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: radius.pill,
          backgroundColor: 'rgba(32,30,29,0.62)',
        }}
      >
        <Feather name={meta.icon} size={10} color={CREAM} />
        <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.8, color: CREAM }}>{meta.label.toUpperCase()}</Text>
      </View>

      {PLAYABLE.has(type) ? (
        <View
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 28,
            height: 28,
            borderRadius: radius.pill,
            backgroundColor: 'rgba(253,247,234,0.92)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="play" size={13} color="#8f4a1e" />
        </View>
      ) : null}

      <LinearGradient
        colors={['rgba(20,16,12,0)', 'rgba(20,16,12,0.82)']}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 36, paddingHorizontal: 10, paddingBottom: 9, gap: 6 }}
      >
        <Text style={{ color: CREAM, fontWeight: '800', fontSize: 13, lineHeight: 17 }} numberOfLines={2}>
          {project.title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {showAuthor ? (
            <>
              <Avatar url={author?.avatarUrl} name={name} size={18} />
              <Text style={{ color: CREAM, fontSize: 11, fontWeight: '600', flex: 1 }} numberOfLines={1}>
                {name}
              </Text>
            </>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {likeCount !== undefined ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Icon name="heart" size={11} color={CREAM} />
              <Text style={{ color: CREAM, fontSize: 10, fontWeight: '700' }}>{formatCount(likeCount)}</Text>
            </View>
          ) : null}
          {commentCount !== undefined ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Icon name="comment" size={11} color={CREAM} />
              <Text style={{ color: CREAM, fontSize: 10, fontWeight: '700' }}>{formatCount(commentCount)}</Text>
            </View>
          ) : null}
        </View>
      </LinearGradient>
    </Pressable>
  );
}
