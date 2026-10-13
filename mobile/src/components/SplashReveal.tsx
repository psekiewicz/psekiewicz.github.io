import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { useMotion } from '../theme/MotionProvider';
import { brand } from '../theme/tokens';
import { LOGO_BOTTOM, LOGO_TOP, LogoRow } from './BrandMark';

const MARK = 132;

// The splash: a white field, a ring breathing out behind the logo and its
// two rows (X O over X D) flying in from opposite sides a beat apart. The logo
// spells the name, so there is no separate wordmark.
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

export function SplashReveal({ onDone }: { onDone?: () => void }) {
  const { enabled } = useMotion();

  const frontAnim = useRef(new Animated.Value(enabled ? 0 : 1)).current;
  const backAnim = useRef(new Animated.Value(enabled ? 0 : 1)).current;
  const ring = useRef(new Animated.Value(0)).current;

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

    // Reduced motion gets the still frame and a single beat to read it, not a
    // hold it has no reason to sit through.
    if (!enabled) {
      const beat = setTimeout(finish, 420);
      return () => {
        clearTimeout(beat);
        clearTimeout(guard);
      };
    }

    const reveal = Animated.parallel([
      Animated.timing(frontAnim, { toValue: 1, duration: 580, useNativeDriver: true }),
      Animated.timing(backAnim, { toValue: 1, duration: 580, delay: 150, useNativeDriver: true }),
    ]);
    reveal.start(finish);

    const pulse = Animated.loop(
      Animated.timing(ring, { toValue: 1, duration: 1600, delay: 200, useNativeDriver: true }),
    );
    pulse.start();
    return () => {
      clearTimeout(guard);
      reveal.stop();
      pulse.stop();
    };
  }, [frontAnim, backAnim, ring, enabled]);

  const flyIn = (anim: Animated.Value, from: number) => ({
    opacity: anim,
    transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }],
  });

  return (
    <View style={[styles.container, { backgroundColor: brand.splashBg }]}>
      <View style={{ width: MARK, height: MARK, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: -14,
            right: -14,
            top: -14,
            bottom: -14,
            borderRadius: 999,
            backgroundColor: 'rgba(25,23,19,0.08)',
            opacity: ring.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.9, 0.35, 0] }),
            transform: [
              { scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.2, 2.6] }) },
            ],
          }}
        />
        <Animated.View style={[StyleSheet.absoluteFill, flyIn(frontAnim, -34)]}>
          <LogoRow size={MARK} d={LOGO_TOP} color={brand.splashFront} />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, flyIn(backAnim, 34)]}>
          <LogoRow size={MARK} d={LOGO_BOTTOM} color={brand.splashFront} />
        </Animated.View>
      </View>

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
