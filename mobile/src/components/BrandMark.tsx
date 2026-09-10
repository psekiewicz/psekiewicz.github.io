import React from 'react';
import { Image, View } from 'react-native';

// The site's brand mark - the double chevron carried by every page's navbar.
//
// Geometry is lifted straight from that SVG (viewBox 0 0 26 26):
//
//   <polygon points="3,3 8.5,3 16.5,13 8.5,23 3,23 11,13"    fill="orange"/>
//   <polygon points="11.5,3 17,3 25,13 17,23 11.5,23 19.5,13" fill="blue"/>
//
// The two polygons are the same shape offset 8.5 units right, so the pair is
// 22 x 20 units of drawing inside that 26-unit box.
//
// It ships as two pre-coloured PNGs rather than being drawn from Views. The
// shape has a mitred tip and flat horizontal cuts at the arm ends, which the
// rotated-border trick a View would have to use can't reproduce - it bevels
// the ends and comes out visibly lighter. Pre-coloured rather than one asset
// tinted twice because the brand colours are fixed in both themes anyway (see
// `brand` in theme/tokens), so there is nothing for a runtime tint to decide.
//
// To regenerate: fill the polygon above over a 13.5 x 20 box at whatever
// scale, once per colour in theme/tokens' `brand`.

/** Chevron width and the second chevron's offset, as fractions of mark height. */
const CHEVRON_W = 13.5 / 20;
const STEP = 8.5 / 20;

/** Mark width / mark height, for callers that need to reserve space. */
export const MARK_ASPECT = 22 / 20;

export const chevrons = {
  orange: require('../../assets/chevron-orange.png'),
  blue: require('../../assets/chevron-blue.png'),
};

/** Absolute placement of one chevron within a mark of the given height. */
export function chevronLayout(size: number, left: number) {
  return {
    position: 'absolute' as const,
    top: 0,
    left,
    width: size * CHEVRON_W,
    height: size,
  };
}

/** Offset of the second (blue) chevron within a mark of the given height. */
export function chevronStep(size: number) {
  return size * STEP;
}

/**
 * The mark at rest. `size` is its rendered height - 20 matches the web
 * navbar, where the mark is 20px of drawing inside a 26px box.
 */
export function BrandMark({ size = 20, style }: { size?: number; style?: any }) {
  return (
    <View style={[{ width: size * MARK_ASPECT, height: size }, style]}>
      <Image source={chevrons.orange} style={chevronLayout(size, 0)} />
      <Image source={chevrons.blue} style={chevronLayout(size, chevronStep(size))} />
    </View>
  );
}
