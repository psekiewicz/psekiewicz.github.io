import { Feather } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { captureRef } from 'react-native-view-shot';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Profile } from '../data/profiles';
import type { UserStats } from '../lib/achievements';
import type { LevelInfo } from '../lib/levels';
import { formatCount } from '../lib/utils';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, typography } from '../theme/tokens';
import { ON_ACCENT } from './bloom';
import { CosmeticBackground } from './CosmeticBackground';
import { Avatar, Button, DisplayName, ErrorNote } from './ui';

type Props = {
  visible: boolean;
  onClose: () => void;
  profile: Profile | null;
  level: LevelInfo;
  stats: UserStats;
  topAchievement: { label: string } | null;
};

// The site's "Share stats card" (js/stats-card.js), rebuilt from the app's own
// views instead of a canvas: the card is laid out like any screen, shown as a
// preview, then captured to a PNG and handed to Android's share sheet. The
// same numbers as the site's card - published, followers, likes, viewers -
// and the equipped cosmetics come along for free, since it's the same
// components the profile draws them with.
export function StatsCardSheet({ visible, onClose, profile, level, stats, topAchievement }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const cardRef = useRef<View>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const share = async () => {
    setBusy(true);
    setError('');
    try {
      if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
      const uri = await captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile' });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share stats card' });
    } catch (e: any) {
      setError(e.message || 'Could not generate the image.');
    } finally {
      setBusy(false);
    }
  };

  const band = { height: 120 };
  const statItems = [
    { value: stats.projectsPublished, label: 'PUBLISHED' },
    { value: stats.followerCount, label: 'FOLLOWERS' },
    { value: stats.totalLikes, label: 'LIKES' },
    { value: stats.uniqueViewers, label: 'VIEWERS' },
  ];

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.6)',
          justifyContent: 'center',
          padding: space.lg,
          paddingBottom: space.lg + insets.bottom,
        }}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        {/* The captured card. collapsable={false} keeps Android from flattening
            this View away, which would leave captureRef nothing to capture. */}
        <View
          ref={cardRef}
          collapsable={false}
          style={{ backgroundColor: colors.bg, borderRadius: radius.lg, overflow: 'hidden' }}
        >
          {profile?.equippedBg && profile.equippedBg !== 'none' ? (
            <CosmeticBackground itemId={profile.equippedBg} style={band} />
          ) : (
            <LinearGradient
              colors={['#d98a4f', colors.primary, '#8f4a1e']}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={band}
            />
          )}
          <View style={{ position: 'absolute', top: space.lg, left: space.lg, flexDirection: 'row', gap: 6 }}>
            <Text style={[typography.eyebrow, { color: 'rgba(253,247,234,0.9)' }]}>SHOWCASE</Text>
          </View>

          <View style={{ alignItems: 'center', marginTop: -52, paddingHorizontal: space.lg, paddingBottom: space.xl }}>
            <View style={{ borderWidth: 5, borderColor: colors.bg, borderRadius: radius.pill }}>
              <Avatar url={profile?.avatarUrl} name={profile?.displayName} size={94} ring={profile?.equippedBorder} />
            </View>
            <DisplayName
              name={profile?.displayName || 'Unknown'}
              effect={profile?.equippedNameEffect}
              style={[typography.h2, { marginTop: space.md, textAlign: 'center' }]}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm }}>
              <View style={{ backgroundColor: colors.text, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: colors.bg }}>
                  LV {level.level}
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: colors.textMuted }}>
                {formatCount(level.xp)} XP · {formatCount(level.xpToNextLevel)} to Lv {level.level + 1}
              </Text>
            </View>
            <View
              style={{
                alignSelf: 'stretch',
                height: 10,
                borderRadius: radius.pill,
                backgroundColor: colors.border,
                overflow: 'hidden',
                marginTop: space.md,
                marginHorizontal: space.lg,
              }}
            >
              <LinearGradient
                colors={[colors.primary, colors.accent]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ height: '100%', width: `${Math.round(Math.max(0, Math.min(1, level.progress)) * 100)}%` }}
              />
            </View>

            <View
              style={{
                alignSelf: 'stretch',
                flexDirection: 'row',
                marginTop: space.xl,
                paddingTop: space.lg,
                borderTopWidth: StyleSheet.hairlineWidth * 2,
                borderTopColor: colors.border,
              }}
            >
              {statItems.map((item, i) => (
                <View
                  key={item.label}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    borderLeftWidth: i > 0 ? StyleSheet.hairlineWidth * 2 : 0,
                    borderLeftColor: colors.border,
                  }}
                >
                  <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text }}>{formatCount(item.value)}</Text>
                  <Text style={[typography.label, { color: colors.textFaint, marginTop: 2, fontSize: 9 }]}>
                    {item.label}
                  </Text>
                </View>
              ))}
            </View>

            {topAchievement ? (
              <View
                style={{
                  alignSelf: 'stretch',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: space.md,
                  marginTop: space.lg,
                  paddingTop: space.lg,
                  borderTopWidth: StyleSheet.hairlineWidth * 2,
                  borderTopColor: colors.border,
                }}
              >
                <Feather name="check-circle" size={22} color={colors.primary} />
                <View>
                  <Text style={[typography.label, { color: colors.textFaint, fontSize: 9 }]}>TOP ACHIEVEMENT</Text>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{topAchievement.label}</Text>
                </View>
              </View>
            ) : null}

            <Text style={{ marginTop: space.xl, fontSize: 11, color: colors.textFaint }}>
              Find things worth your time.
            </Text>
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textFaint }}>psekiewicz.github.io</Text>
          </View>
        </View>

        <View style={{ marginTop: space.lg, gap: space.sm }}>
          <ErrorNote message={error} />
          <Button label="Share" icon="share-2" onPress={share} loading={busy} />
          {/* Not a secondary Button: that one is outlined with dark text for a
              light page, and all but vanished on this dimmed backdrop. */}
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            style={({ pressed }) => ({ alignItems: 'center', padding: space.md, opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={{ color: ON_ACCENT, fontSize: 14, fontWeight: '700' }}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
