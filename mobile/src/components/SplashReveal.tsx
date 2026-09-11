import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { useMotion } from '../theme/MotionProvider';
import { brand } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { CHEVRON_BACK, CHEVRON_FRONT, Chevron } from './BrandMark';

const MARK = 116;

// Bloom's splash, shown while AuthContext reads the persisted session off disk
// (RootNavigator's `loading` gate) - real startup work already being done, not
// a delay added to have something to animate.
//
// A terracotta field, a ring breathing out behind the mark, the two chevrons
// flying in from opposite sides a beat apart, and the wordmark settling out of
// wide tracking. Lowercase, as the artboard sets it.
export function SplashReveal() {
  const { colors } = useTheme();
  const { enabled } = useMotion();

  const frontAnim = useRef(new Animated.Value(enabled ? 0 : 1)).current;
  const backAnim = useRef(new Animated.Value(enabled ? 0 : 1)).current;
  const wordAnim = useRef(new Animated.Value(enabled ? 0 : 1)).current;
  const ring = useRef(new Animated.Value(0)).current;
  // letterSpacing can't be driven natively, so the wordmark's tracking runs on
  // its own value rather than being mixed into wordAnim.
  const track = useRef(new Animated.Value(enabled ? 0 : 1)).current;

  useEffect(() => {
    if (!enabled) return;

    Animated.parallel([
      Animated.timing(frontAnim, { toValue: 1, duration: 580, useNativeDriver: true }),
      Animated.timing(backAnim, { toValue: 1, duration: 580, delay: 150, useNativeDriver: true }),
      Animated.timing(wordAnim, { toValue: 1, duration: 540, delay: 400, useNativeDriver: true }),
      Animated.timing(track, { toValue: 1, duration: 540, delay: 400, useNativeDriver: false }),
    ]).start();

    const pulse = Animated.loop(
      Animated.timing(ring, { toValue: 1, duration: 1600, delay: 200, useNativeDriver: true }),
    );
    pulse.start();
    return () => pulse.stop();
  }, [frontAnim, backAnim, wordAnim, track, ring, enabled]);

  const flyIn = (anim: Animated.Value, from: number) => ({
    opacity: anim,
    transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }],
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.primary }]}>
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

      <Animated.Text
        style={{
          marginTop: 24,
          fontSize: 19,
          fontWeight: '700',
          color: brand.splashFront,
          opacity: wordAnim,
          letterSpacing: track.interpolate({ inputRange: [0, 1], outputRange: [9.5, 0.4] }),
          transform: [
            { translateY: wordAnim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
          ],
        }}
      >
        showcase
      </Animated.Text>
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
