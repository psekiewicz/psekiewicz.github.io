import React from 'react';
import Svg, { Circle, Ellipse, Line, Path, Polygon, Polyline, Rect } from 'react-native-svg';

import { SHAPES } from './iconShapes';

// The app's iconography: the same Lucide shapes the site draws (tools/gen-icons.mjs
// writes both from one pinned version), at a stroke weight of 2.75 for the
// rounder, heavier look the design system asks for. The shapes live in
// iconShapes.ts as plain data and are drawn here, so there is no icon package to
// carry and the two platforms cannot drift apart.

export type IconName =
  | 'refresh'
  | 'bell'
  | 'search'
  | 'play'
  | 'heart'
  | 'comment'
  | 'external'
  | 'bookmark'
  | 'sun'
  | 'settings'
  | 'home'
  | 'demos'
  | 'plus'
  | 'back'
  | 'chevron-down'
  | 'chart'
  | 'user'
  | 'star'
  | 'trophy'
  | 'share'
  | 'pencil'
  | 'lock'
  | 'music'
  | 'image'
  | 'globe';

type Props = {
  name: IconName;
  size?: number;
  color?: string;
  /** Fill colour for the solid variants (a liked heart, a saved bookmark). */
  fill?: string;
  strokeWidth?: number;
};

const ELEMENTS: Record<string, React.ComponentType<any>> = {
  path: Path,
  circle: Circle,
  rect: Rect,
  line: Line,
  polyline: Polyline,
  polygon: Polygon,
  ellipse: Ellipse,
};

export function Icon({ name, size = 21, color = '#191713', fill = 'none', strokeWidth = 2.75 }: Props) {
  const s = {
    // Solid by design - the play badge on a feed card's thumbnail.
    fill: name === 'play' ? color : fill,
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {(SHAPES[name] || []).map(([element, attributes], i) => {
        const Shape = ELEMENTS[element];
        return <Shape key={i} {...s} {...attributes} />;
      })}
    </Svg>
  );
}
