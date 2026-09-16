import React from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, IconName } from '../components/icons';
import { usePressScale } from '../lib/motion';
import { useTheme } from '../theme/ThemeProvider';
import { radius } from '../theme/tokens';

// Navigation the way a social app arranges it: a flat bar across the bottom
// with a hairline over it, four icons in it, and a round compose button
// floating above its right-hand end.
//
// It used to be a floating cream pill with a 74px terracotta button punched
// through the middle. That button is the one control you press least and it was
// the largest thing on the screen, it covered the middle tab's neighbours, and
// the pill's margins ate 104px of every list. The compose button is still not a
// tab - it pushes the editor onto the stack above these tabs, so adding an
// entry is a screen you finish and come back from rather than a place you
// switch to and have to leave.

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

  const barHeight = 54 + insets.bottom;

  const go = (route: any, isFocused: boolean) => {
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
  };

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 12 }}
    >
      {/* Compose, floating clear of the bar. */}
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
        style={{
          position: 'absolute',
          right: 18,
          bottom: barHeight + 18,
          width: 56,
          height: 56,
          borderRadius: radius.pill,
          backgroundColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#8f4a1e',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.34,
          shadowRadius: 16,
          elevation: 10,
        }}
      >
        <Animated.View style={{ transform: [{ scale }] }}>
          <Icon name="plus" size={26} color={colors.onAccent} />
        </Animated.View>
      </Pressable>

      <View
        style={{
          height: barHeight,
          paddingBottom: insets.bottom,
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.bg,
          borderTopWidth: StyleSheet.hairlineWidth * 2,
          borderTopColor: colors.border,
        }}
      >
        {state.routes.map((route: any, index: number) => {
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
                // The current tab is the heavier one, which is how a bar with no
                // pill behind the icon says where you are.
                strokeWidth={isFocused ? 2.9 : 2.1}
              />
              {isFocused ? (
                <View
                  style={{
                    marginTop: 4,
                    width: 5,
                    height: 5,
                    borderRadius: radius.pill,
                    backgroundColor: colors.primary,
                  }}
                />
              ) : (
                <View style={{ marginTop: 4, height: 5 }} />
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
