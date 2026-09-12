import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Path,
  Pattern,
  RadialGradient,
  Rect,
  Stop,
  LinearGradient as SvgGradient,
} from 'react-native-svg';

import { bgGradient } from '../lib/cosmetics';

// The shop backgrounds, drawn properly.
//
// css/style.css builds most of these from a tiled background-image: a grid, a
// halftone screen, paw prints, confetti, stars. The app used to flatten every
// one of them into a two- or three-stop linear gradient, which meant Grid had
// no grid and Paws had no paws - they read as generic colour washes. They are
// now drawn as real repeating tiles at the sizes and colours the stylesheet
// uses, so a cosmetic looks like the thing that was bought.
//
// Two things about how that is done are load-bearing.
//
// Nothing is sized in percentages. An `<Svg width="100%">` holding a
// `<Rect width="100%">` is the obvious way to fill a box and the one most
// likely to come out empty: the percentages have to resolve against a parent
// whose size react-native-svg may not know at the time it lays the SVG out, and
// a pattern fill over a zero-width rect is just the base colour - which looks
// exactly like the flat version this replaced. So the box is measured with
// onLayout and every number below is a real pixel.
//
// And the tiling is scaled for previews. These tiles are big - Confetti's is
// 160px, Snow's 90 - because that is what they are on a 400px-wide profile
// header. Drawn into the shop's 26px swatch, a 160px tile shows one corner of
// itself, which for most of them is empty space. `preview` scales the tile down
// until a couple of repeats fit, so the swatch shows the pattern rather than a
// magnified blank patch of it. Full-size surfaces never scale, so they stay
// identical to the web.
//
// What still does not carry over is motion. Starfield twinkles, Static shivers,
// Lava drifts and Snow falls on the web; here they are a still frame of the
// same art, because a looping animation behind every avatar in a scrolling list
// is what costs a feed its frame rate.

type Tile = {
  base: string;
  /** Tile size in px, matching the stylesheet's background-size. 0 = no tiling. */
  w: number;
  h: number;
  /** Motif drawn once per tile. */
  motif: React.ReactNode;
  /**
   * Drawn beneath the tiling, matching the stylesheet's layer order. It gets
   * its own SVG with a `0 0 100 100` viewBox stretched over the box, so these
   * shapes are written in percent-of-the-surface and need no measurement.
   */
  wash?: React.ReactNode;
};

const dot = (cx: number, cy: number, r: number, fill: string, key: string) => (
  <Circle key={key} cx={cx} cy={cy} r={r} fill={fill} />
);

// Tile sizes and colours are lifted from css/style.css's .shop-bg-* rules.
const TILES: Record<string, Tile> = {
  'bg-grid': {
    base: '#16283d',
    w: 22,
    h: 22,
    motif: (
      <>
        <Rect x="0" y="0" width="22" height="1" fill="rgba(120,190,255,0.22)" />
        <Rect x="0" y="0" width="1" height="22" fill="rgba(120,190,255,0.22)" />
      </>
    ),
  },
  'bg-halftone': {
    base: '#c03a17',
    w: 14,
    h: 14,
    motif: dot(7, 7, 3.1, 'rgba(0,0,0,0.42)', 'h'),
  },
  'bg-paws': {
    base: '#e8d5b7',
    w: 62,
    h: 62,
    motif: (
      <>
        <Ellipse cx="22" cy="30" rx="7" ry="9" fill="#a97142" />
        <Ellipse cx="13" cy="20" rx="3.5" ry="4.5" fill="#a97142" />
        <Ellipse cx="20" cy="16" rx="3.5" ry="4.5" fill="#a97142" />
        <Ellipse cx="27" cy="16" rx="3.5" ry="4.5" fill="#a97142" />
        <Ellipse cx="33" cy="21" rx="3.5" ry="4.5" fill="#a97142" />
      </>
    ),
  },
  'bg-confetti': {
    base: '#4338ca',
    w: 160,
    h: 160,
    motif: (
      <>
        {dot(24, 40, 4, '#fbbf24', 'c1')}
        {dot(120, 24, 4, '#f472b6', 'c2')}
        {dot(72, 112, 4, '#34d399', 'c3')}
        {dot(136, 104, 4, '#60a5fa', 'c4')}
        {dot(40, 136, 4, '#f87171', 'c5')}
      </>
    ),
  },
  'bg-starfield': {
    base: '#070912',
    w: 88,
    h: 76,
    motif: (
      <>
        {dot(10.6, 16.7, 1.6, '#ffffff', 's1')}
        {dot(59.8, 10.6, 1.4, '#cbd5ff', 's2')}
        {dot(33.4, 51.7, 1.8, '#ffffff', 's3')}
        {dot(73.9, 44.1, 1.2, '#ffe9c4', 's4')}
        {dot(21.1, 65.4, 1.5, '#ffffff', 's5')}
        {dot(81.0, 66.9, 1.3, '#dbeafe', 's6')}
      </>
    ),
  },
  'bg-snow': {
    base: '#1e293b',
    w: 90,
    h: 90,
    motif: (
      <>
        {dot(10.8, 16.2, 2, '#ffffff', 'n1')}
        {dot(55.8, 10.8, 1.6, '#e0f2fe', 'n2')}
        {dot(30.6, 55.8, 2.2, '#ffffff', 'n3')}
        {dot(73.8, 43.2, 1.4, '#ffffff', 'n4')}
        {dot(43.2, 77.4, 1.8, '#e0f2fe', 'n5')}
      </>
    ),
  },
  'bg-static': {
    base: '#101010',
    w: 35, // lowest common multiple of the stylesheet's 5px and 7px screens
    h: 35,
    motif: (
      <>
        {Array.from({ length: 7 }, (_, i) =>
          Array.from({ length: 7 }, (_, j) =>
            dot(i * 5 + 2.5, j * 5 + 2.5, 1, 'rgba(255,255,255,0.45)', `a${i}-${j}`)
          )
        )}
        {Array.from({ length: 5 }, (_, i) =>
          Array.from({ length: 5 }, (_, j) =>
            dot(i * 7 + 3.5, j * 7 + 3.5, 1, 'rgba(255,255,255,0.28)', `b${i}-${j}`)
          )
        )}
      </>
    ),
  },
  'bg-paper': {
    base: '#efe9dd',
    w: 16,
    h: 16,
    // The 45deg repeating hairline, as one diagonal stripe per tile.
    motif: <Path d="M-8 8 L8 -8 M0 16 L16 0 M8 24 L24 8" stroke="rgba(120,105,80,0.09)" strokeWidth="1" />,
  },
  'bg-terminal': {
    base: '#08120b',
    w: 4,
    h: 4,
    motif: <Rect x="0" y="0" width="4" height="1" fill="rgba(74,222,128,0.22)" />,
    wash: (
      <>
        <Defs>
          {/* Gradient geometry is in objectBoundingBox units, so these
              percentages are of the shape, not of any viewport. */}
          <RadialGradient id="termGlow" cx="50%" cy="120%" r="90%">
            <Stop offset="0" stopColor="#4ade80" stopOpacity="0.35" />
            <Stop offset="0.7" stopColor="#4ade80" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill="url(#termGlow)" />
      </>
    ),
  },
  'bg-vaporwave': {
    base: '#1a0b2e',
    w: 26,
    h: 18,
    motif: (
      <>
        <Rect x="0" y="0" width="26" height="1" fill="rgba(255,106,213,0.55)" />
        <Rect x="0" y="0" width="1" height="18" fill="rgba(255,106,213,0.4)" />
      </>
    ),
    wash: (
      <>
        <Defs>
          <SvgGradient id="vapSun" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#ff2e88" />
            <Stop offset="0.34" stopColor="#ff9a3c" />
            <Stop offset="0.62" stopColor="#1a0b2e" />
            {/* The stylesheet's ramp ends at 62% and the base colour carries
                the rest. Stated explicitly rather than relying on the last
                stop extending, which is where the horizon went missing. */}
            <Stop offset="1" stopColor="#1a0b2e" />
          </SvgGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill="url(#vapSun)" />
      </>
    ),
  },
  'bg-topo': {
    base: '#1c1a16',
    w: 0, // contour rings across the whole surface, not tiled
    h: 0,
    motif: null,
    wash: (
      <>
        {Array.from({ length: 14 }, (_, i) => (
          <Circle
            key={`t${i}`}
            cx="30"
            cy="40"
            r={i * 6 + 1}
            fill="none"
            stroke="rgba(240,160,60,0.35)"
            strokeWidth="0.6"
          />
        ))}
      </>
    ),
  },
  'bg-lava': {
    base: '#240b02',
    w: 0,
    h: 0,
    motif: null,
    wash: (
      <>
        <Defs>
          <RadialGradient id="lavaA" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#ff7a18" stopOpacity="1" />
            <Stop offset="1" stopColor="#ff7a18" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="lavaB" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#e11d48" stopOpacity="1" />
            <Stop offset="1" stopColor="#e11d48" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="lavaC" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#f59e0b" stopOpacity="1" />
            <Stop offset="1" stopColor="#f59e0b" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Ellipse cx="28" cy="30" rx="30" ry="35" fill="url(#lavaA)" />
        <Ellipse cx="72" cy="66" rx="27.5" ry="32.5" fill="url(#lavaB)" />
        <Ellipse cx="52" cy="88" rx="22.5" ry="27.5" fill="url(#lavaC)" />
      </>
    ),
  },
};

/** Roughly how many times a tile should repeat across a preview's short edge. */
const PREVIEW_REPEATS = 2.2;
/** Below this the motifs themselves stop being visible, so shrink no further. */
const MIN_PREVIEW_SCALE = 0.34;

function previewScale(tile: Tile, w: number, h: number) {
  if (!tile.w || !tile.h) return 1;
  const fit = Math.min(w, h) / (Math.max(tile.w, tile.h) * PREVIEW_REPEATS);
  return Math.max(MIN_PREVIEW_SCALE, Math.min(1, fit));
}

export function hasPattern(itemId: string) {
  return !!TILES[itemId];
}

/**
 * An equipped background. Patterned ones are drawn as real tiles; the rest
 * stay the gradient (or image) lib/cosmetics already resolves.
 */
export function CosmeticBackground({
  itemId,
  style,
  preview,
  children,
}: {
  itemId: string;
  style?: ViewStyle;
  /** Scale the tiling down to suit a swatch. See the note at the top. */
  preview?: boolean;
  children?: React.ReactNode;
}) {
  const [box, setBox] = React.useState({ w: 0, h: 0 });
  const tile = TILES[itemId];

  if (tile) {
    const id = `p-${itemId}`;
    const k = preview ? previewScale(tile, box.w, box.h) : 1;

    return (
      <View
        style={[{ overflow: 'hidden', backgroundColor: tile.base }, style]}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          // Only on a real change: onLayout fires on every re-layout and this
          // sets state.
          setBox((prev) =>
            Math.abs(prev.w - width) < 0.5 && Math.abs(prev.h - height) < 0.5
              ? prev
              : { w: width, h: height }
          );
        }}
      >
        {/* The wash, in its own stretched 0-100 box so its shapes can be
            written as percentages of the surface without measuring it. */}
        {tile.wash ? (
          <Svg
            style={StyleSheet.absoluteFill}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {tile.wash}
          </Svg>
        ) : null}

        {/* The tiling, in real pixels, once the box has been measured. */}
        {tile.w > 0 && box.w > 0 && box.h > 0 ? (
          <Svg style={StyleSheet.absoluteFill} width={box.w} height={box.h}>
            <Defs>
              <Pattern
                id={id}
                patternUnits="userSpaceOnUse"
                x="0"
                y="0"
                width={tile.w * k}
                height={tile.h * k}
              >
                <G scale={k}>{tile.motif}</G>
              </Pattern>
            </Defs>
            <Rect x="0" y="0" width={box.w} height={box.h} fill={`url(#${id})`} />
          </Svg>
        ) : null}

        {children}
      </View>
    );
  }

  const g = bgGradient(itemId);

  if (g?.image) {
    return (
      <View style={[{ overflow: 'hidden', backgroundColor: g.colors[0] }, style]}>
        <Image
          source={{ uri: g.image }}
          style={{ position: 'absolute', width: '100%', height: '100%' }}
          contentFit="cover"
        />
        {children}
      </View>
    );
  }

  return (
    <LinearGradient
      colors={(g ? g.colors : ['#e9e5dc', '#f2efe9']) as any}
      start={g?.start || { x: 0, y: 0 }}
      end={g?.end || { x: 1, y: 1 }}
      style={style}
    >
      {children}
    </LinearGradient>
  );
}
