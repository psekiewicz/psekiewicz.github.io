import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme/ThemeProvider';
import { radius } from '../theme/tokens';
import { Icon, IconName } from './icons';
import { Text } from './Text';

// The slim bar a social app puts over its feed: your avatar or a back arrow on
// the left, the name of the place in the middle, a couple of flat icon buttons
// on the right, and whatever the screen pins under it - tabs, a search field -
// inside the same border.
//
// It replaces AccentHeader on the feed screens. That header is a block of
// terracotta with 34px corners and a day-of-the-week eyebrow, which is a lot of
// furniture above a list you scroll: this one is 50px of page ground with a
// hairline under it, so the posts start at the top of the screen.

export function TopBar({
  leading,
  title,
  actions,
  children,
}: {
  leading?: React.ReactNode;
  title?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        backgroundColor: colors.bg,
        paddingTop: insets.top,
        // Whatever is pinned underneath - a tab row, a search field - draws its
        // own hairline, so the bar only draws one when it is the bottom edge.
        borderBottomWidth: children ? 0 : StyleSheet.hairlineWidth * 2,
        borderBottomColor: colors.border,
      }}
    >
      <View
        style={{
          height: 50,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 12,
        }}
      >
        {leading}
        <View style={{ flex: 1, minWidth: 0 }}>
          {typeof title === 'string' ? (
            <Text style={{ fontSize: 17, fontWeight: '800', letterSpacing: -0.4, color: colors.text }} numberOfLines={1}>
              {title}
            </Text>
          ) : (
            title
          )}
        </View>
        {actions ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>{actions}</View> : null}
      </View>
      {children}
    </View>
  );
}

/** A flat round icon button - no fill until you press it. */
export function TopBarButton({
  icon,
  onPress,
  label,
  badge,
  size = 38,
}: {
  icon: IconName;
  onPress?: () => void;
  label?: string;
  /** Draws the unread dot, as on a bell. */
  badge?: boolean;
  size?: number;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? colors.surfaceAlt : 'transparent',
      })}
    >
      <Icon name={icon} size={21} color={colors.text} strokeWidth={2.4} />
      {badge ? (
        <View
          style={{
            position: 'absolute',
            top: 7,
            right: 7,
            width: 10,
            height: 10,
            borderRadius: radius.pill,
            backgroundColor: colors.primary,
            borderWidth: 2,
            borderColor: colors.bg,
          }}
        />
      ) : null}
    </Pressable>
  );
}
