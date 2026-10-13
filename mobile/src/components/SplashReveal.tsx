import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { useMotion } from '../theme/MotionProvider';
import { brand } from '../theme/tokens';
import { BrandMark } from './BrandMark';

const MARK = 132;

// The splash: the logo on white, exactly as the native splash shows it, then a
// quick flip through a handful of backdrops behind it, the way a phone's boot
// animation cycles pictures. It ends on the last picture and hands straight to
// the app, with no white frame in between. The logo spells the name, so
// there is no separate wordmark. Opacity only, so all of it is on the native
// driver; each picture simply appears above the last (no fades between them).
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

// The pictures, in the order they flip past. Credits: assets/splash/CREDITS.md.
const PICTURES = [
  require('../../assets/splash/gaming.jpg'),
  require('../../assets/splash/valley.jpg'),
  require('../../assets/splash/river.jpg'),
  require('../../assets/splash/peaks.jpg'),
  require('../../assets/splash/clouds.jpg'),
  require('../../assets/splash/lake.jpg'),
];
const HOLD = 220; // the plain logo on white, so the handover from native is still
const FLIP = 130; // each picture

// Fixed rather than keyed to the theme, like the rest of the splash: the logo
// is ink on white at rest and white over the pictures, which a dark scrim keeps
// legible whatever they hold behind it.
const SCRIM = 'rgba(0,0,0,0.3)';
const INK = brand.splashFront;

export function SplashReveal({ onDone }: { onDone?: () => void }) {
  const { enabled } = useMotion();

  const shown = useRef(PICTURES.map(() => new Animated.Value(0))).current;
  // 0 at rest (ink logo on white), 1 while the pictures are up.
  const over = useRef(new Animated.Value(0)).current;

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

    // Reduced motion gets the still logo and a single beat to read it, not a
    // hold it has no reason to sit through.
    if (!enabled) {
      const beat = setTimeout(finish, 420);
      return () => {
        clearTimeout(beat);
        clearTimeout(guard);
      };
    }

    const cut = (v: Animated.Value, delay: number) =>
      Animated.timing(v, { toValue: 1, duration: 1, delay, useNativeDriver: true });

    const flip = Animated.sequence([
      Animated.delay(HOLD),
      Animated.parallel([
        cut(over, 0),
        ...shown.map((v, i) => cut(v, i * FLIP)),
      ]),
      Animated.delay(FLIP),
    ]);
    flip.start(finish);
    return () => {
      clearTimeout(guard);
      flip.stop();
    };
  }, [shown, over, enabled]);

  const white = over.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const ink = over.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <View style={[styles.container, { backgroundColor: brand.splashBg }]}>
      {enabled && (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: over }]}>
          {PICTURES.map((src, i) => (
            <Animated.Image
              key={i}
              source={src}
              resizeMode="cover"
              fadeDuration={0}
              style={[StyleSheet.absoluteFill, { opacity: shown[i] }]}
            />
          ))}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: SCRIM }]} />
        </Animated.View>
      )}
      <View style={{ width: MARK, height: MARK }}>
        <Animated.View style={{ position: 'absolute', opacity: ink }}>
          <BrandMark size={MARK} color={INK} />
        </Animated.View>
        <Animated.View style={{ position: 'absolute', opacity: white }}>
          <BrandMark size={MARK} color="#ffffff" />
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
