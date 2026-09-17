import React from 'react';
import { Pressable, View } from 'react-native';
import { Text } from './Text';

import { useTheme } from '../theme/ThemeProvider';
import { radius, typography } from '../theme/tokens';
import { Icon, IconName } from './icons';

// What is left of Bloom's chrome now that the feed screens draw a plain
// components/TopBar instead: the round translucent button a profile's cover
// still carries, and the tinted pills and stat blocks the dashboard uses.
//
// The accent header itself is gone. It was a block of terracotta with 34px
// corners over every list, which is where the app's "rounded screen" came
// from, and nothing imports it now.

/** Cream, for anything drawn on top of an accent fill. */
export const ON_ACCENT = '#fdf7ea';

/** A 40px translucent circle holding one icon - the header's own buttons. */
export function HeaderButton({
  icon,
  onPress,
  label,
  size = 40,
}: {
  icon: IconName;
  onPress?: () => void;
  label?: string;
  size?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: radius.pill,
        backgroundColor: `rgba(253,247,234,${pressed ? 0.34 : 0.2})`,
        alignItems: 'center',
        justifyContent: 'center',
      })}
    >
      <Icon name={icon} size={size * 0.45} color={ON_ACCENT} />
    </Pressable>
  );
}

/** A small tinted status pill - LIVE / DRAFT / a media kind. */
export function TonePill({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'primary' | 'accent' | 'neutral' | 'dark';
}) {
  const { colors } = useTheme();
  const map = {
    primary: { bg: colors.primarySoft, fg: colors.primaryDeep },
    accent: { bg: colors.accentSoft, fg: colors.accentDeep },
    neutral: { bg: colors.mutedSoft, fg: colors.textFaint },
    dark: { bg: 'rgba(32,30,29,0.6)', fg: colors.surface },
  }[tone];

  return (
    <View
      style={{
        backgroundColor: map.bg,
        borderRadius: radius.pill,
        paddingHorizontal: 11,
        paddingVertical: 6,
      }}
    >
      <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1.4, color: map.fg }}>
        {label}
      </Text>
    </View>
  );
}

/** A count pill - the heart and comment chips on a feed card. */
export function CountPill({
  icon,
  count,
  tone = 'primary',
  filled,
  onPress,
}: {
  icon: IconName;
  count: number | string;
  tone?: 'primary' | 'accent';
  filled?: boolean;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const bg = tone === 'accent' ? colors.accentSoft : colors.primarySoft;
  const fg = tone === 'accent' ? colors.accentDeep : colors.primaryDeep;
  // An unlit heart is drawn in body grey, not the accent, and only takes the
  // accent once it is filled.
  const stroke = icon === 'heart' && !filled ? colors.textMuted : fg;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: bg,
        borderRadius: radius.pill,
        paddingHorizontal: 11,
        paddingVertical: 6,
      }}
    >
      <Icon name={icon} size={14} color={stroke} fill={filled ? fg : 'none'} />
      <Text style={{ fontSize: 11, fontWeight: '700', color: fg }}>{count}</Text>
    </Pressable>
  );
}

/** "PUBLISHED ---- 6": a label, a hairline that eats the slack, and a count. */
export function SectionRule({ label, trailing }: { label: string; trailing?: string | number }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Text style={[typography.label, { color: colors.accent }]}>{label}</Text>
      <View style={{ flex: 1, height: 1.5, borderRadius: radius.pill, backgroundColor: colors.border }} />
      {trailing !== undefined && (
        <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textFaint }}>{trailing}</Text>
      )}
    </View>
  );
}

/** A number over a small-caps label, as used in the stat strips. */
export function StatBlock({
  value,
  label,
  tone = 'accent',
  size = 19,
}: {
  value: string | number;
  label: string;
  tone?: 'accent' | 'onAccent';
  size?: number;
}) {
  const { colors } = useTheme();
  const onAccent = tone === 'onAccent';
  return (
    <View>
      <Text style={{ fontSize: size, fontWeight: '700', color: onAccent ? ON_ACCENT : colors.text }}>
        {value}
      </Text>
      <Text
        style={[
          typography.label,
          { color: onAccent ? 'rgba(253,247,234,0.8)' : colors.accent, marginTop: 2 },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}
