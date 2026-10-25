import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleProp, ViewStyle } from 'react-native';

import { useMotion } from '../../theme/MotionProvider';

// The two moves every scene of the intro is made of, on the native driver:
//
// - <Anim> plays an entrance from `from` to rest after `delay`, and optionally
//   a later move from rest to `to` after `thenDelay` (a card swiped away, a
//   row climbing, a tile folding up). It starts when it mounts, and each scene
//   mounts fresh, so a scene replays by being shown again.
// - <Loop> swings back and forth forever between rest and `to` - or, with
//   `repeat`, runs rest -> `to` and starts over (a ripple, an orbit).
//
// Values are numbers: translate in px, rotate in degrees. With reduced motion
// on, everything simply appears where its animation would have ended.

type Pose = {
  opacity?: number;
  translateX?: number;
  translateY?: number;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  rotate?: number;
};

const REST: Required<Pose> = { opacity: 1, translateX: 0, translateY: 0, scale: 1, scaleX: 1, scaleY: 1, rotate: 0 };

export const ease = {
  out: Easing.bezier(0.2, 0.9, 0.2, 1),
  inOut: Easing.bezier(0.65, 0, 0.25, 1),
  back: Easing.out(Easing.back(1.7)),
};

function styleFor(a: Animated.Value, b: Animated.Value, from: Pose, to: Pose): Animated.WithAnimatedObject<ViewStyle> {
  const prop = (key: keyof Pose) => {
    const start = from[key] ?? REST[key];
    const end = to[key] ?? REST[key];
    const inA = a.interpolate({ inputRange: [0, 1], outputRange: [start, REST[key]] });
    const inB = b.interpolate({ inputRange: [0, 1], outputRange: [0, end - REST[key]] });
    return Animated.add(inA, inB);
  };
  return {
    opacity: prop('opacity'),
    transform: [
      { translateX: prop('translateX') },
      { translateY: prop('translateY') },
      { scale: prop('scale') },
      { scaleX: prop('scaleX') },
      { scaleY: prop('scaleY') },
      { rotate: prop('rotate').interpolate({ inputRange: [-720, 720], outputRange: ['-720deg', '720deg'] }) },
    ] as any,
  };
}

export function Anim({
  from = {},
  delay = 0,
  duration = 600,
  easing = ease.out,
  to,
  thenDelay = 0,
  thenDuration = 450,
  thenEasing = ease.inOut,
  style,
  children,
  pointerEvents,
}: {
  from?: Pose;
  delay?: number;
  duration?: number;
  easing?: (t: number) => number;
  to?: Pose;
  thenDelay?: number;
  thenDuration?: number;
  thenEasing?: (t: number) => number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
}) {
  const { enabled } = useMotion();
  // Reduced motion: straight to where the animation would have ended.
  const a = useRef(new Animated.Value(enabled ? 0 : 1)).current;
  const b = useRef(new Animated.Value(enabled || !to ? 0 : 1)).current;

  useEffect(() => {
    if (!enabled) return;
    const steps = [Animated.timing(a, { toValue: 1, delay, duration, easing, useNativeDriver: true })];
    if (to) {
      const left = Math.max(0, thenDelay - delay - duration);
      steps.push(Animated.timing(b, { toValue: 1, delay: left, duration: thenDuration, easing: thenEasing, useNativeDriver: true }));
    }
    const run = Animated.sequence(steps);
    run.start();
    return () => run.stop();
  }, []);

  return (
    <Animated.View pointerEvents={pointerEvents} style={[style, styleFor(a, b, from, to || {})]}>
      {children}
    </Animated.View>
  );
}

export function Loop({
  to,
  duration = 800,
  delay = 0,
  repeat = false,
  linear = false,
  style,
  children,
}: {
  to: Pose;
  duration?: number;
  delay?: number;
  repeat?: boolean;
  linear?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  const { enabled } = useMotion();
  const v = useRef(new Animated.Value(0)).current;
  const still = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!enabled) return;
    const easing = linear ? Easing.linear : repeat ? Easing.out(Easing.quad) : Easing.inOut(Easing.ease);
    const swing = Animated.loop(
      repeat
        ? Animated.timing(v, { toValue: 1, duration, easing, useNativeDriver: true })
        : Animated.sequence([
            Animated.timing(v, { toValue: 1, duration, easing, useNativeDriver: true }),
            Animated.timing(v, { toValue: 0, duration, easing, useNativeDriver: true }),
          ])
    );
    const t = setTimeout(() => swing.start(), delay);
    return () => {
      clearTimeout(t);
      swing.stop();
    };
  }, []);

  return <Animated.View style={[style, styleFor(still, v, {}, to)]}>{children}</Animated.View>;
}
