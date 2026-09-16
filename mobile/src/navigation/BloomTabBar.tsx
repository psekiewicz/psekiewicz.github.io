import React from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, IconName } from '../components/icons';
import { usePressScale } from '../lib/motion';
import { useTheme } from '../theme/ThemeProvider';
import { radius } from '../theme/tokens';

// Navigation the way a social app arranges it: a flat bar across the bottom
// with a hairline over it, the current tab marked by a heavier icon and a dot,
// and compose sitting in the middle of the row.
//
// It used to be a floating cream pill with a 74px terracotta button punched
// through the middle, which covered the middle tab's neighbours and ate 104px
// of every list. Compose was tried as a button floating over the bottom right
// after that, and it sat on top of whichever post's Save icon happened to be
// there - so it is in the row itself, where nothing is underneath it.
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

  const go = (route: any, isFocused: boolean) => {
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
  };

  const renderTab = (route: any, index: number) => {
    const isFocused = state.index === index;
    return (
      <Pressable
        key={route.key}
        onPress={() => go(route, isFocused)}
        accessibilityRole="button"
        accessibilityState={{ selected: isFocused }}
        accessibilityLabel={route.name}
        style={({ pressed }) => ({
          flex: 1,
          height: 54,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Icon
          name={ICONS[route.name] || 'home'}
          size={24}
          color={isFocused ? colors.text : colors.textFaint}
          // The current tab is the heavier one, which is how a bar with no pill
          // behind the icon says where you are.
          strokeWidth={isFocused ? 2.9 : 2.1}
        />
        <View
          style={{
            marginTop: 4,
            width: 5,
            height: 5,
            borderRadius: radius.pill,
            backgroundColor: isFocused ? colors.primary : 'transparent',
          }}
        />
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
        height: 54 + insets.bottom,
        paddingBottom: insets.bottom,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.bg,
        borderTopWidth: StyleSheet.hairlineWidth * 2,
        borderTopColor: colors.border,
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
        style={{ flex: 1, height: 54, alignItems: 'center', justifyContent: 'center' }}
      >
        <Animated.View
          style={{
            transform: [{ scale }],
            width: 46,
            height: 32,
            borderRadius: 12,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="plus" size={21} color={colors.onAccent} />
        </Animated.View>
        <View style={{ marginTop: 4, height: 5 }} />
      </Pressable>

      {tabs.slice(2).map(({ route, index }: any) => renderTab(route, index))}
    </View>
  );
}
