import React from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, IconName } from '../components/icons';
import { Text } from '../components/Text';
import { usePressScale } from '../lib/motion';
import { useTheme } from '../theme/ThemeProvider';
import { radius } from '../theme/tokens';

// The bottom bar, drawn the way the website's is on a phone: an icon with its
// name under it, the one you are on in terracotta, and compose as a terracotta
// pill in the middle of the row.
//
// Labels are the point. Before this the bar was four unlabelled glyphs, and
// "which of these is the dashboard" is not a question a bar should ask - both
// the site and the apps this is modelled on (Reddit, Instagram) write the names
// out. Compose sits in the row rather than floating over the feed, where it
// used to sit on top of whichever post's Save icon was at that height.
//
// It is still not a tab: it pushes the editor onto the stack above these tabs,
// so adding an entry is a screen you finish and come back from rather than a
// place you switch to and have to leave.

const ICONS: Record<string, IconName> = {
  Home: 'home',
  Scrolls: 'scrolls',
  Dashboard: 'chart',
  Profile: 'user',
};

export function BloomTabBar({ state, navigation }: any) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { scale, onPressIn, onPressOut } = usePressScale(0.9);

  // Scrolls is full-bleed dark in both themes, so the bar goes dark with it
  // rather than drawing a cream strip under a black video.
  const onScrolls = state.routes[state.index]?.name === 'Scrolls';
  const bg = onScrolls ? colors.scrollsBg : colors.bg;
  const idle = onScrolls ? 'rgba(253,247,234,0.6)' : colors.textFaint;
  const active = onScrolls ? '#fdf7ea' : colors.primary;
  const line = onScrolls ? 'rgba(253,247,234,0.16)' : colors.border;

  const go = (route: any, isFocused: boolean) => {
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
  };

  const renderTab = (route: any, index: number) => {
    const isFocused = state.index === index;
    const color = isFocused ? active : idle;
    return (
      <Pressable
        key={route.key}
        onPress={() => go(route, isFocused)}
        accessibilityRole="button"
        accessibilityState={{ selected: isFocused }}
        accessibilityLabel={route.name}
        style={({ pressed }) => ({
          flex: 1,
          height: 58,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 3,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Icon
          name={ICONS[route.name] || 'home'}
          size={22}
          color={color}
          strokeWidth={isFocused ? 2.7 : 2.1}
        />
        <Text style={{ fontSize: 10.5, fontWeight: isFocused ? '700' : '500', color }} numberOfLines={1}>
          {route.name}
        </Text>
      </Pressable>
    );
  };

  const tabs = state.routes.map((route: any, index: number) => ({ route, index }));

  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 58 + insets.bottom,
        paddingBottom: insets.bottom,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: bg,
        borderTopWidth: StyleSheet.hairlineWidth * 2,
        borderTopColor: line,
        zIndex: 12,
      }}
    >
      {tabs.slice(0, 2).map(({ route, index }: any) => renderTab(route, index))}

      <Pressable
        // The stack, not the tabs: adding is a screen you come back from, not a
        // place in the bar. getParent() is the stack navigator this tab
        // navigator sits in - the same one the dashboard pushes the editor
        // from, so both routes land on exactly the same screen.
        onPress={() => navigation.getParent()?.navigate('Editor')}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        accessibilityRole="button"
        accessibilityLabel="Add an entry"
        style={{ flex: 1, height: 58, alignItems: 'center', justifyContent: 'center' }}
      >
        <Animated.View
          style={{
            transform: [{ scale }],
            width: 54,
            height: 36,
            borderRadius: radius.pill,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="plus" size={22} color={colors.onAccent} />
        </Animated.View>
      </Pressable>

      {tabs.slice(2).map(({ route, index }: any) => renderTab(route, index))}
    </View>
  );
}
