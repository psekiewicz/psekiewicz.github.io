import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { useMotion } from '../theme/MotionProvider';
import { useTheme } from '../theme/ThemeProvider';
import { typography } from '../theme/tokens';

const SQUARE = 40;
const OFFSET = 18;
const MARK_SIZE = SQUARE + OFFSET;

// The brand mark's own reveal, shown while AuthContext reads the
// persisted session off disk (RootNavigator's `loading` gate) - real
// startup work already being done, not an artificial delay added just to
// have something to animate. Same two-square mark as the navbar, in
// whichever theme's colours are active, so it's recognisably this app
// rather than a generic splash screen.
export function SplashReveal() {
  const { colors } = useTheme();
  const { enabled } = useMotion();

  const accentAnim = useRef(new Animated.Value(enabled ? 0 : 1)).current;
  const primaryAnim = useRef(new Animated.Value(enabled ? 0 : 1)).current;
  const textAnim = useRef(new Animated.Value(enabled ? 0 : 1)).current;

  useEffect(() => {
    if (!enabled) return;
    Animated.sequence([
      Animated.spring(accentAnim, { toValue: 1, useNativeDriver: true, speed: 10, bounciness: 12 }),
      Animated.spring(primaryAnim, { toValue: 1, useNativeDriver: true, speed: 10, bounciness: 12 }),
      Animated.timing(textAnim, { toValue: 1, duration: 260, useNativeDriver: true }),
    ]).start();
  }, [accentAnim, primaryAnim, textAnim, enabled]);

  const squareStyle = (anim: Animated.Value) => ({
    opacity: anim,
    transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }],
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={styles.mark}>
        <Animated.View
          style={[styles.square, { backgroundColor: colors.accent, top: 0, left: OFFSET }, squareStyle(accentAnim)]}
        />
        <Animated.View
          style={[styles.square, { backgroundColor: colors.primary, top: OFFSET, left: 0 }, squareStyle(primaryAnim)]}
        />
      </View>
      <Animated.Text
        style={[
          typography.h2,
          {
            color: colors.text,
            marginTop: 22,
            opacity: textAnim,
            transform: [{ translateY: textAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
          },
        ]}
      >
        Showcase
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
  mark: {
    width: MARK_SIZE,
    height: MARK_SIZE,
  },
  square: {
    position: 'absolute',
    width: SQUARE,
    height: SQUARE,
    borderRadius: 9,
  },
});
