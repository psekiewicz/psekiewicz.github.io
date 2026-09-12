import React from 'react';
import { Animated, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, IconName } from '../components/icons';
import { usePressScale } from '../lib/motion';
import { useTheme } from '../theme/ThemeProvider';
import { radius } from '../theme/tokens';

// Bloom's navigation: a floating cream pill holding four tabs, with a
// terracotta add button punched through its middle. The button is not a tab at
// all - it pushes the editor onto the stack above these tabs, so adding an
// entry is a screen you finish and come back from rather than a place you
// switch to and have to leave.
//
// The artboard puts a four-tile "What are you adding?" sheet between the button
// and the editor. That is gone: every tile opened the same editor, and the
// editor carries the type picker on its own form, so the sheet was an entire
// screen standing in the way of a field visible one tap later.

const ICONS: Record<string, IconName> = {
  Home: 'home',
  Scrolls: 'scrolls',
  Dashboard: 'chart',
  Profile: 'user',
};

export function BloomTabBar({ state, navigation }: any) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { scale, onPressIn, onPressOut } = usePressScale(0.92);

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
        style={{ flex: 1, alignItems: 'center' }}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isFocused ? colors.primarySoft : 'transparent',
          }}
        >
          <Icon
            name={ICONS[route.name] || 'home'}
            size={21}
            color={isFocused ? colors.primaryDeep : colors.textFaint}
          />
        </View>
      </Pressable>
    );
  };

  // Home, Scrolls, [add button], Dashboard, Profile.
  const tabs = state.routes.map((route: any, index: number) => ({ route, index }));
  const left = tabs.slice(0, 2);
  const right = tabs.slice(2);

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 104, zIndex: 12 }}
    >
      <View
        style={{
          position: 'absolute',
          left: 14,
          right: 14,
          bottom: Math.max(insets.bottom, 18),
          height: 70,
          borderRadius: radius.pill,
          backgroundColor: colors.surface,
          borderWidth: 1.5,
          borderColor: colors.border,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 6,
          shadowColor: '#8f4a1e',
          shadowOffset: { width: 0, height: 14 },
          shadowOpacity: 0.16,
          shadowRadius: 30,
          elevation: 12,
        }}
      >
        {left.map(({ route, index }: any) => renderTab(route, index))}

        <View style={{ width: 86, alignItems: 'center' }}>
          <Pressable
            // The stack, not the tabs: adding is a screen you come back from,
            // not a place in the bar. getParent() is the stack navigator this
            // tab navigator sits in - the same one the dashboard pushes the
            // editor from, so both routes land on exactly the same screen.
            onPress={() => navigation.getParent()?.navigate('Editor')}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            accessibilityRole="button"
            accessibilityLabel="Add an entry"
            style={{
              width: 74,
              height: 74,
              marginTop: -30,
              borderRadius: radius.pill,
              backgroundColor: colors.primary,
              borderWidth: 5,
              borderColor: colors.bg,
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#8f4a1e',
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.42,
              shadowRadius: 22,
              elevation: 14,
            }}
          >
            <Animated.View style={{ transform: [{ scale }] }}>
              <Icon name="plus" size={30} color={colors.onAccent} />
            </Animated.View>
          </Pressable>
        </View>

        {right.map(({ route, index }: any) => renderTab(route, index))}
      </View>
    </View>
  );
}
