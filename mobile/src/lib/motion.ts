import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

import { useMotion } from '../theme/MotionProvider';

// Shared press feedback for every tappable in ui.tsx (Button, Card, Chip,
// IconButton) - a small spring-back scale layered on top of whatever
// opacity feedback each already had, so "everything is animated" comes
// from the design system rather than from touching every screen. Turning
// animations off in Settings (or the OS reduce-motion setting) makes this
// a no-op: the value never leaves 1, so there's nothing to layer on.
export function usePressScale(scaleTo = 0.95) {
  const { enabled } = useMotion();
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (value: number) => {
    if (!enabled) return;
    Animated.spring(scale, { toValue: value, useNativeDriver: true, speed: 30, bounciness: 6 }).start();
  };

  return {
    scale,
    onPressIn: () => animateTo(scaleTo),
    onPressOut: () => animateTo(1),
  };
}

const MAX_STAGGER_INDEX = 12;
const STAGGER_STEP_MS = 40;

// A staggered fade-and-rise for list items, capped so a long list's tail
// isn't stuck waiting through an ever-growing queue of delays. With
// animations off, opacity/translateY start at their resting values -
// nothing to reveal, so a slow client never leaves content hidden.
export function useEntrance(index = 0) {
  const { enabled } = useMotion();
  const opacity = useRef(new Animated.Value(enabled ? 0 : 1)).current;
  const translateY = useRef(new Animated.Value(enabled ? 16 : 0)).current;

  useEffect(() => {
    if (!enabled) return;
    const delay = Math.min(index, MAX_STAGGER_INDEX) * STAGGER_STEP_MS;
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 320, delay, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, delay, useNativeDriver: true, speed: 16, bounciness: 6 }),
    ]).start();
    // Runs once per mount, keyed by the index this item had when it first
    // appeared - re-running on every index change would replay the
    // animation whenever a list reorders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { opacity, transform: [{ translateY }] };
}
