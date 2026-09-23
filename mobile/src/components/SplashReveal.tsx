import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { useMotion } from '../theme/MotionProvider';
import { brand } from '../theme/tokens';
import { CHEVRON_BACK, CHEVRON_FRONT, Chevron } from './BrandMark';
import { FONT_FAMILY } from './Text';

const MARK = 116;

// Bloom's splash: a terracotta field, a ring breathing out behind the mark, the
// two chevrons flying in from opposite sides a beat apart, and the wordmark
// settling out of wide tracking. Lowercase, as the artboard sets it.
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
  const wordAnim = useRef(new Animated.Value(enabled ? 0 : 1)).current;
  const ring = useRef(new Animated.Value(0)).current;
  // letterSpacing can't be driven natively, so the wordmark's tracking runs on
  // its own value rather than being mixed into wordAnim.
  const track = useRef(new Animated.Value(enabled ? 0 : 1)).current;

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
      Animated.timing(wordAnim, { toValue: 1, duration: 540, delay: 400, useNativeDriver: true }),
      Animated.timing(track, { toValue: 1, duration: 540, delay: 400, useNativeDriver: false }),
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
  }, [frontAnim, backAnim, wordAnim, track, ring, enabled]);

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
            backgroundColor: 'rgba(253,247,234,0.18)',
            opacity: ring.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.9, 0.35, 0] }),
            transform: [
              { scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.2, 2.6] }) },
            ],
          }}
        />
        <Animated.View style={[StyleSheet.absoluteFill, flyIn(frontAnim, -34)]}>
          <Chevron size={MARK} points={CHEVRON_FRONT} color={brand.splashFront} />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, flyIn(backAnim, 34)]}>
          <Chevron size={MARK} points={CHEVRON_BACK} color={brand.splashBack} />
        </Animated.View>
      </View>

      {/* Two drivers, so two nodes. The fade and the slide run natively; the
          tracking cannot, and putting both on one node made the native driver
          inspect a letterSpacing it has no way to animate and log an error on
          every launch. Split, each driver owns a node it can drive all of. */}
      <Animated.View
        style={{
          marginTop: 24,
          opacity: wordAnim,
          transform: [
            { translateY: wordAnim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
          ],
        }}
      >
        <Animated.Text
          style={{
            fontFamily: FONT_FAMILY,
            fontSize: 19,
            fontWeight: '700',
            color: brand.splashFront,
            letterSpacing: track.interpolate({ inputRange: [0, 1], outputRange: [9.5, 0.4] }),
          }}
        >
          showcase
        </Animated.Text>
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
