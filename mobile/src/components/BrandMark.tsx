import React from 'react';
import { View } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';

import { brand } from '../theme/tokens';

// The brand mark - the double chevron, drawn from the same two polygons the
// site's navbar SVG and the Bloom artboard's splash both use, in a 26-unit box:
//
//   front: 3,3 8.5,3 16.5,13 8.5,23 3,23 11,13
//   back:  11.5,3 17,3 25,13 17,23 11.5,23 19.5,13
//
// Both chevrons live in that shared coordinate space rather than being cropped
// to themselves, so stacking two single-polygon copies reproduces the mark
// exactly - which is what the splash does to animate the halves apart.

export const CHEVRON_FRONT = '3,3 8.5,3 16.5,13 8.5,23 3,23 11,13';
export const CHEVRON_BACK = '11.5,3 17,3 25,13 17,23 11.5,23 19.5,13';

/** One half of the mark, drawn at its place in the full 26-unit box. */
export function Chevron({ size, points, color }: { size: number; points: string; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 26 26">
      <Polygon points={points} fill={color} />
    </Svg>
  );
}

/**
 * The mark at rest. `size` is the edge of its 26-unit box, so 26 matches the
 * web navbar one-to-one.
 */
export function BrandMark({
  size = 26,
  front = brand.orange,
  back = brand.blue,
  style,
}: {
  size?: number;
  front?: string;
  back?: string;
  style?: any;
}) {
  return (
    <View style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox="0 0 26 26">
        <Polygon points={CHEVRON_FRONT} fill={front} />
        <Polygon points={CHEVRON_BACK} fill={back} />
      </Svg>
    </View>
  );
}
