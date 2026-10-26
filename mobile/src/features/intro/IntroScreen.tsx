import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, IconName } from '../../components/icons';
import { Text } from '../../components/Text';
import { useAuth } from '../../context/AuthContext';
import { Anim, ease } from './anim';
import { C, DemosScene, DotGrid, NewsScene, RanksScene, TilesScene, WelcomeScene, YouScene } from './scenes';
import { markIntroSeen } from './storage';

// The intro a new install opens on: the XOXD tiles, then Demos, News, Ranks
// and You, tied together by the app's own bottom bar, whose highlight moves
// to the tab each scene is about - and a welcome with the way in. It waits
// for the person: Next moves on, Skip jumps to the welcome, and "Watch the
// intro again" replays it.
//
// `onFinish` gets where the person chose to go: 'register', 'login', or
// 'browse' (continue without signing in).

export type IntroExit = 'register' | 'login' | 'browse';

const SCENES = 5;
const WELCOME = SCENES;

// The bar's five slots; scenes 1-4 light Demos, News, Ranks and You.
const TABS: { name: string; icon: IconName }[] = [
  { name: 'Demos', icon: 'demos' },
  { name: 'News', icon: 'globe' },
  { name: '', icon: 'plus' },
  { name: 'Ranks', icon: 'trophy' },
  { name: 'You', icon: 'user' },
];
const TAB_OF_SCENE: Record<number, number> = { 1: 0, 2: 1, 3: 3, 4: 4 };

export function IntroScreen({ onFinish }: { onFinish: (exit: IntroExit) => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [scene, setScene] = useState(0);
  // Bumped on replay, so the first scene mounts afresh even when it's showing.
  const [round, setRound] = useState(0);

  const go = useCallback((n: number) => setScene(n), []);

  // The bar's highlight slides from tab to tab.
  const stage = Math.min(width, 440);
  const slot = stage / 5;
  const pillX = useRef(new Animated.Value(0)).current;
  const tab = TAB_OF_SCENE[scene];
  useEffect(() => {
    if (tab === undefined) return;
    Animated.spring(pillX, { toValue: tab * slot, useNativeDriver: true, speed: 14, bounciness: 6 }).start();
  }, [tab, slot]);

  const dark = scene === 0 || scene === WELCOME;
  const showBar = scene >= 1 && scene <= 4;
  const top = insets.top + 12;
  const sceneKey = `${round}-${scene}`;

  const replay = () => {
    setRound((r) => r + 1);
    go(0);
  };

  return (
    <View style={{ flex: 1, backgroundColor: dark ? C.ink : C.white }}>
      <DotGrid dark={dark} key={dark ? 'dark' : 'light'} />

      <View style={{ flex: 1, width: stage, alignSelf: 'center' }}>
        {scene === 0 ? (
          <View key={sceneKey} style={{ flex: 1 }}>
            <TilesScene />
          </View>
        ) : null}

        {scene >= 1 && scene <= 4 ? (
          <View key={sceneKey} style={{ flex: 1, paddingTop: top + 52, paddingHorizontal: 24, paddingBottom: 84 + insets.bottom + 68 }}>
            {scene === 1 ? <DemosScene /> : scene === 2 ? <NewsScene /> : scene === 3 ? <RanksScene /> : <YouScene />}
          </View>
        ) : null}

        {scene === WELCOME ? (
          <View key={sceneKey} style={{ flex: 1, paddingHorizontal: 24, paddingTop: top + 110, paddingBottom: insets.bottom + 20, justifyContent: 'space-between' }}>
            <WelcomeScene />
            <Anim from={{ opacity: 0, translateY: 16 }} delay={850} style={{ gap: 4 }}>
              <Pressable
                onPress={() => onFinish('register')}
                accessibilityRole="button"
                style={({ pressed }) => [styles.primary, { opacity: pressed ? 0.85 : 1 }]}
              >
                <Text style={{ fontSize: 15, fontWeight: '800', color: C.ink }}>Get started</Text>
                <View style={{ transform: [{ rotate: '180deg' }] }}>
                  <Icon name="back" size={18} color={C.ink} strokeWidth={2.6} />
                </View>
              </Pressable>
              <Pressable onPress={() => onFinish('login')} accessibilityRole="button" style={styles.textButton}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: C.white }}>I already have an account</Text>
              </Pressable>
              <Pressable onPress={() => onFinish('browse')} accessibilityRole="button" style={styles.textButton}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: C.white }}>Continue without signing in</Text>
              </Pressable>
              <Pressable onPress={replay} accessibilityRole="button" style={styles.textButton}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: C.faint }}>Watch the intro again</Text>
              </Pressable>
            </Anim>
          </View>
        ) : null}

        {/* Progress along the top, and Skip. */}
        {scene < WELCOME ? (
          <View style={{ position: 'absolute', left: 20, right: 10, top, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1, flexDirection: 'row', gap: 5 }}>
              {Array.from({ length: SCENES }, (_, i) => (
                <View key={i} style={{ flex: 1, height: 3, borderRadius: 2, overflow: 'hidden', backgroundColor: dark ? 'rgba(255,255,255,0.18)' : 'rgba(25,23,19,0.12)' }}>
                  {i < scene ? <View style={{ flex: 1, backgroundColor: dark ? C.white : C.ink }} /> : null}
                  {i === scene ? (
                    <Anim key={sceneKey} from={{ scaleX: 0 }} duration={400} style={{ flex: 1, backgroundColor: dark ? C.white : C.ink, transformOrigin: 'left' }} />
                  ) : null}
                </View>
              ))}
            </View>
            <Pressable onPress={() => go(WELCOME)} accessibilityRole="button" hitSlop={8} style={{ height: 44, justifyContent: 'center', paddingHorizontal: 8 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.5, color: dark ? '#b9b5ad' : C.muted }}>SKIP</Text>
            </Pressable>
          </View>
        ) : null}

        {/* The app's own bottom bar, lighting the tab each scene is about. */}
        {showBar ? (
          <Anim from={{ translateY: 120 }} delay={0} duration={600} style={[styles.bar, { height: 64 + insets.bottom, paddingBottom: insets.bottom }]}>
            <Animated.View style={[styles.pill, { left: (slot - 56) / 2, transform: [{ translateX: pillX }] }]} />
            {TABS.map((t, i) => {
              const on = i === tab;
              return (
                <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                  {t.icon === 'plus' ? (
                    <View style={{ width: 54, height: 36, borderRadius: 999, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="plus" size={22} color={C.white} strokeWidth={2.6} />
                    </View>
                  ) : (
                    <>
                      <Icon name={t.icon} size={22} color={on ? C.deep : C.faint} strokeWidth={on ? 2.7 : 2.1} />
                      <Text style={{ fontSize: 10.5, fontWeight: on ? '800' : '500', color: on ? C.deep : C.faint }}>{t.name}</Text>
                    </>
                  )}
                </View>
              );
            })}
          </Anim>
        ) : null}

        {/* Next: above the bar in the tab scenes, bottom-right on the tiles. */}
        {scene < WELCOME ? (
          <Pressable
            onPress={() => go(scene + 1)}
            accessibilityRole="button"
            accessibilityLabel="Next"
            style={({ pressed }) => [
              styles.next,
              { bottom: showBar ? 64 + insets.bottom + 14 : insets.bottom + 28, backgroundColor: dark ? C.white : C.ink, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <View style={{ transform: [{ rotate: '180deg' }] }}>
              <Icon name="back" size={20} color={dark ? C.ink : C.white} strokeWidth={2.6} />
            </View>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  primary: {
    height: 56,
    borderRadius: 999,
    backgroundColor: C.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  textButton: { height: 46, alignItems: 'center', justifyContent: 'center' },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderTopWidth: 1.5,
    borderTopColor: C.line,
  },
  pill: { position: 'absolute', top: 8, width: 56, height: 44, borderRadius: 14, backgroundColor: C.soft },
  next: {
    position: 'absolute',
    right: 18,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

/**
 * The intro as a screen: on a fresh install it sits above the tabs
 * (`firstRun`), and Settings -> Watch the intro opens it again. Sign in and
 * Create account open on top of it, so Back returns here; continuing without
 * signing in, or signing in, leaves it for the app.
 */
export function IntroRoute({ navigation, route }: any) {
  const { user } = useAuth();
  const firstRun = Boolean(route.params?.firstRun);

  // Once per install: leaving it any way at all counts as seen.
  useEffect(() => {
    return () => {
      if (firstRun) markIntroSeen();
    };
  }, [firstRun]);

  // Signed in from the screen opened over it: the tour has done its job.
  const signedIn = useRef(Boolean(user));
  useEffect(() => {
    if (user && !signedIn.current) navigation.goBack();
    signedIn.current = Boolean(user);
  }, [user, navigation]);

  return (
    <IntroScreen
      onFinish={(exit) => {
        if (exit === 'register') navigation.navigate('Register');
        else if (exit === 'login') navigation.navigate('Login');
        else navigation.goBack();
      }}
    />
  );
}
