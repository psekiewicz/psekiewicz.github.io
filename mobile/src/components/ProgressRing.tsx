import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { Text } from './Text';
import Svg, { Circle } from 'react-native-svg';

import { useMotion } from '../theme/MotionProvider';
import { typography } from '../theme/tokens';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// The dashboard header's donut. Drawn on the artboard's own geometry: a 100
// viewBox, r=45 at stroke-width 9, rotated a quarter turn so the sweep starts
// at twelve o'clock. 2*pi*45 is 283, which is where its dash array comes from.
const R = 45;
const CIRC = 2 * Math.PI * R;

export function ProgressRing({
  size = 104,
  progress,
  value,
  label,
  color = '#fdf7ea',
  trackColor = 'rgba(253,247,234,0.28)',
}: {
  size?: number;
  /** 0..1 */
  progress: number;
  value: string | number;
  label: string;
  color?: string;
  trackColor?: string;
}) {
  const { enabled } = useMotion();
  const clamped = Math.max(0, Math.min(1, progress || 0));
  const sweep = useRef(new Animated.Value(enabled ? 0 : clamped)).current;

  useEffect(() => {
    if (!enabled) {
      sweep.setValue(clamped);
      return;
    }
    Animated.timing(sweep, {
      toValue: clamped,
      duration: 1100,
      delay: 160,
      // strokeDashoffset is an SVG prop, not a transform, so it can't be
      // handed to the native driver.
      useNativeDriver: false,
    }).start();
  }, [clamped, enabled, sweep]);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 100 100" style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx="50" cy="50" r={R} fill="none" stroke={trackColor} strokeWidth="9" />
        <AnimatedCircle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={sweep.interpolate({
            inputRange: [0, 1],
            outputRange: [CIRC, 0],
          })}
        />
      </Svg>
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 24, fontWeight: '700', letterSpacing: -0.7, color }}>{value}</Text>
        <Text style={[typography.label, { fontSize: 9, letterSpacing: 1.4, color: trackColor === 'rgba(253,247,234,0.28)' ? 'rgba(253,247,234,0.8)' : color }]}>
          {label}
        </Text>
      </View>
    </View>
  );
}
