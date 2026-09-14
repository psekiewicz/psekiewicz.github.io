import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme/ThemeProvider';
import { gutter, radius, typography } from '../theme/tokens';
import { Icon, IconName } from './icons';

// The chrome Bloom repeats on every screen: an accent header that sheds its
// bottom corners into the page, translucent round buttons sitting on it, and
// tinted pills. Home and Dashboard are the same header in two different accents.

/** Cream, for anything drawn on top of an accent fill. */
export const ON_ACCENT = '#fdf7ea';

export function AccentHeader({
  tone = 'primary',
  eyebrow,
  title,
  actions,
  children,
}: {
  tone?: 'primary' | 'accent';
  eyebrow?: string;
  title?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        backgroundColor: tone === 'accent' ? colors.accent : colors.primary,
        borderBottomLeftRadius: radius.xl,
        borderBottomRightRadius: radius.xl,
        // The artboard starts the eyebrow at 46px on a device whose status bar
        // is ~47 tall, i.e. immediately under it. Android's is shorter, so the
        // inset is padded rather than hard-coded to keep the same optical gap.
        paddingTop: insets.top + 14,
        paddingHorizontal: gutter,
        paddingBottom: gutter,
        gap: 16,
      }}
    >
      {(eyebrow || title || actions) && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            {!!eyebrow && (
              <Text style={[typography.eyebrow, { color: 'rgba(253,247,234,0.8)' }]}>{eyebrow}</Text>
            )}
            {!!title && (
              <Text style={[typography.h1, { color: ON_ACCENT, marginTop: 3 }]}>{title}</Text>
            )}
          </View>
          {actions}
        </View>
      )}
      {children}
    </View>
  );
}

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

/** The cream search pill inset into the Home header. */
export function SearchPill({
  value,
  onChangeText,
  placeholder = 'Titles, tags, people',
}: {
  value?: string;
  onChangeText?: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: 'rgba(253,247,234,0.94)',
        borderRadius: radius.pill,
        paddingHorizontal: 18,
        paddingVertical: 12,
      }}
    >
      {/* The pill is cream in both themes, so its icon can't follow the theme
          either: dark mode's primaryDeep is a pale peach made for dark ground. */}
      <Icon name="search" size={16} color="#8f4a1e" />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8b8177"
        style={{ flex: 1, fontSize: 13, color: '#201e1d', padding: 0 }}
      />
    </View>
  );
}

/** The filter chips under the header - active is an accent tint, idle outlined. */
export function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      style={{
        paddingHorizontal: 15,
        paddingVertical: 9,
        borderRadius: radius.pill,
        backgroundColor: active ? colors.primarySoft : colors.bg,
        borderWidth: active ? 0 : 1.5,
        borderColor: colors.border,
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: '700', color: active ? colors.primaryDeep : colors.textMuted }}>
        {label}
      </Text>
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

export const bloomStyles = StyleSheet.create({
  // Every scroll view clears the floating tab bar by this much.
  scrollPad: { paddingHorizontal: gutter, paddingTop: 18, paddingBottom: 116, gap: 16 },
});
