import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { useMotion } from '../theme/MotionProvider';
import { brand } from '../theme/tokens';
import { LOGO_D, LOGO_O, LOGO_X1, LOGO_X2, LogoRow } from './BrandMark';

const MARK = 132;

// The splash: a white field and the logo assembling itself - its four letters
// (X O over X D) each slide in from their own corner, a beat apart, overshoot a
// little and settle into the finished logo, which then gives one small pulse.
// The logo spells the name, so there is no separate wordmark. Everything runs
// on transform and opacity, so all of it is on the native driver.
//
// It used to be shown for exactly as long as AuthContext took to read the
// persisted session off disk, on the reasoning that the reveal should play
// across real startup work rather than a delay invented to have something to
// animate. That read is only worth as much as the wait: AsyncStorage usually
// answers in well under a tenth of a second, so the reveal - which needs about
// 940ms to finish - was cut off at a different, arbitrary frame every launch,
// and often never appeared at all. That is the "sometimes it runs, sometimes it
// doesn't" people were seeing; nothing was intermittently broken, the thing was
// simply racing the disk.
//
// So it now reports when it has finished and RootNavigator waits for both. The
// added wait is bounded by `GUARD`, which also covers the case where the
// animation never reports at all - if the launch is backgrounded, Animated can
// drop the callback, and a splash nobody can get past is far worse than one cut
// short.
const GUARD = 2600;

// Where each letter starts, as a fraction of the mark, and when it leaves. The
// last letter lands at about 1s, the settling pulse ends near 1.2s.
const LETTERS = [
  { d: LOGO_X1, dx: -0.28, dy: -0.28, delay: 0 },
  { d: LOGO_O, dx: 0.28, dy: -0.28, delay: 110 },
  { d: LOGO_X2, dx: -0.28, dy: 0.28, delay: 220 },
  { d: LOGO_D, dx: 0.28, dy: 0.28, delay: 330 },
];
const LAND = 640;

export function SplashReveal({ onDone }: { onDone?: () => void }) {
  const { enabled } = useMotion();

  const anims = useRef(LETTERS.map(() => new Animated.Value(enabled ? 0 : 1))).current;
  const pulse = useRef(new Animated.Value(0)).current;

  // Held in a ref so a caller passing an inline arrow doesn't restart the
  // animation on every render of the screen above.
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    let called = false;
    const finish = () => {
      if (called) return;
      called = true;
      done.current?.();
    };
    const guard = setTimeout(finish, GUARD);

    // Reduced motion gets the finished logo and a single beat to read it, not a
    // hold it has no reason to sit through.
    if (!enabled) {
      const beat = setTimeout(finish, 420);
      return () => {
        clearTimeout(beat);
        clearTimeout(guard);
      };
    }

    const assemble = Animated.sequence([
      Animated.parallel(
        anims.map((a, i) =>
          Animated.timing(a, {
            toValue: 1,
            duration: LAND,
            delay: LETTERS[i].delay,
            easing: Easing.out(Easing.back(1.5)),
            useNativeDriver: true,
          }),
        ),
      ),
      Animated.timing(pulse, {
        toValue: 1,
        duration: 260,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    ]);
    assemble.start(finish);
    return () => {
      clearTimeout(guard);
      assemble.stop();
    };
  }, [anims, pulse, enabled]);

  const settle = pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.05, 1] });

  return (
    <View style={[styles.container, { backgroundColor: brand.splashBg }]}>
      <Animated.View style={{ width: MARK, height: MARK, transform: [{ scale: settle }] }}>
        {LETTERS.map((l, i) => (
          <Animated.View
            key={i}
            style={[
              StyleSheet.absoluteFill,
              {
                opacity: anims[i].interpolate({ inputRange: [0, 0.5], outputRange: [0, 1], extrapolate: 'clamp' }),
                transform: [
                  { translateX: anims[i].interpolate({ inputRange: [0, 1], outputRange: [l.dx * MARK, 0] }) },
                  { translateY: anims[i].interpolate({ inputRange: [0, 1], outputRange: [l.dy * MARK, 0] }) },
                  { scale: anims[i].interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
                ],
              },
            ]}
          >
            <LogoRow size={MARK} d={l.d} color={brand.splashFront} />
          </Animated.View>
        ))}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
