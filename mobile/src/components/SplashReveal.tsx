import React, { useEffect, useRef } from 'react';
import { Animated, ImageStyle, StyleSheet, View } from 'react-native';

import { useMotion } from '../theme/MotionProvider';
import { useTheme } from '../theme/ThemeProvider';
import { typography } from '../theme/tokens';
import { MARK_ASPECT, chevronLayout, chevronStep, chevrons } from './BrandMark';

const MARK_HEIGHT = 56;

// How far the two chevrons start apart, as a fraction of mark height. The
// navbar spreads them by 2px on hover at a 20px mark height, so the same 0.1
// keeps the gesture identical at this size.
const SPREAD = 0.1;

// The brand mark's own reveal, shown while AuthContext reads the persisted
// session off disk (RootNavigator's `loading` gate) - real startup work
// already being done, not an artificial delay added just to have something to
// animate. Same double chevron as the site's navbar, and it assembles the way
// the navbar mark moves on hover: the two chevrons drift together from either
// side rather than simply fading up.
export function SplashReveal() {
  const { colors } = useTheme();
  const { enabled } = useMotion();

  const orangeAnim = useRef(new Animated.Value(enabled ? 0 : 1)).current;
  const blueAnim = useRef(new Animated.Value(enabled ? 0 : 1)).current;
  const textAnim = useRef(new Animated.Value(enabled ? 0 : 1)).current;

  useEffect(() => {
    if (!enabled) return;
    Animated.sequence([
      Animated.spring(orangeAnim, { toValue: 1, useNativeDriver: true, speed: 10, bounciness: 12 }),
      Animated.spring(blueAnim, { toValue: 1, useNativeDriver: true, speed: 10, bounciness: 12 }),
      Animated.timing(textAnim, { toValue: 1, duration: 260, useNativeDriver: true }),
    ]).start();
  }, [orangeAnim, blueAnim, textAnim, enabled]);

  // Each chevron fades and scales up while sliding in from its own side, so
  // they close on the mark's centre instead of arriving already in place.
  // Annotated so the transform entries are contextually typed - an unannotated
  // array literal of two differently-shaped objects widens to a union carrying
  // `?: undefined` siblings, which RN's transform type rejects.
  const chevronStyle = (
    anim: Animated.Value,
    from: number,
  ): Animated.WithAnimatedObject<ImageStyle> => ({
    opacity: anim,
    transform: [
      { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
      { translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) },
    ],
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={{ width: MARK_HEIGHT * MARK_ASPECT, height: MARK_HEIGHT }}>
        <Animated.Image
          source={chevrons.orange}
          style={[chevronLayout(MARK_HEIGHT, 0), chevronStyle(orangeAnim, -MARK_HEIGHT * SPREAD)]}
        />
        <Animated.Image
          source={chevrons.blue}
          style={[
            chevronLayout(MARK_HEIGHT, chevronStep(MARK_HEIGHT)),
            chevronStyle(blueAnim, MARK_HEIGHT * SPREAD),
          ]}
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
});
