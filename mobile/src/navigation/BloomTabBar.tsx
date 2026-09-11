import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddSheet } from '../components/AddSheet';
import { Icon, IconName } from '../components/icons';
import { useMotion } from '../theme/MotionProvider';
import { useTheme } from '../theme/ThemeProvider';
import { radius } from '../theme/tokens';

// Bloom's navigation: a floating cream pill holding four tabs, with a
// terracotta add button punched through its middle. The button is not a tab -
// it opens the add sheet, which is what then routes into the editor - so the
// `Add` route keeps its slot in the navigator but never renders an icon.

const ICONS: Record<string, IconName> = {
  Home: 'home',
  Scrolls: 'scrolls',
  Dashboard: 'chart',
  Profile: 'user',
};

export function BloomTabBar({ state, navigation }: any) {
  const { colors } = useTheme();
  const { enabled } = useMotion();
  const insets = useSafeAreaInsets();
  const [sheetOpen, setSheetOpen] = useState(false);

  const fabSpin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const to = sheetOpen ? 1 : 0;
    if (!enabled) {
      fabSpin.setValue(to);
      return;
    }
    Animated.timing(fabSpin, {
      toValue: to,
      duration: 480,
      useNativeDriver: true,
    }).start();
  }, [sheetOpen, enabled, fabSpin]);

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
  const tabs = state.routes
    .map((route: any, index: number) => ({ route, index }))
    .filter(({ route }: any) => route.name !== 'Add');
  const left = tabs.slice(0, 2);
  const right = tabs.slice(2);

  return (
    <>
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
              onPress={() => setSheetOpen((v) => !v)}
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
              <Animated.View
                style={{
                  transform: [
                    {
                      rotate: fabSpin.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0deg', '135deg'],
                      }),
                    },
                  ],
                }}
              >
                <Icon name="plus" size={30} color={colors.onAccent} />
              </Animated.View>
            </Pressable>
          </View>

          {right.map(({ route, index }: any) => renderTab(route, index))}
        </View>
      </View>

      <AddSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onPick={(projectType) => {
          setSheetOpen(false);
          navigation.navigate('Add', { projectType });
        }}
      />
    </>
  );
}
