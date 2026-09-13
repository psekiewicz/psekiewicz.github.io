import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

// The artboard's iconography: Lucide, drawn at stroke-width 2.75 for the
// rounder, heavier look the design system asks for. The paths below are copied
// verbatim out of `Showcase App.dc.html` rather than pulled from an icon
// package, so what ships is exactly what was drawn - @expo/vector-icons' Feather
// set can't express the heavier stroke (its glyphs bake one in), and a second
// icon dependency would only approximate these.

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
  | 'scrolls'
  | 'plus'
  | 'back'
  | 'chevron-down'
  | 'chart'
  | 'user'
  | 'star'
  | 'trophy'
  | 'pencil'
  | 'lock'
  | 'music'
  | 'image';

type Props = {
  name: IconName;
  size?: number;
  color?: string;
  /** Fill colour for the solid variants (play, a liked heart). */
  fill?: string;
  strokeWidth?: number;
};

export function Icon({ name, size = 21, color = '#201e1d', fill = 'none', strokeWidth = 2.75 }: Props) {
  const s = {
    fill: 'none' as const,
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Lucide arrow-left, for the header's own back control. The stack's
          native header is off on the screens that draw a Bloom header, so the
          way back has to live in that header. */}
      {name === 'back' && (
        <>
          <Path {...s} d="M19 12H5" />
          <Path {...s} d="m12 19-7-7 7-7" />
        </>
      )}
      {/* Lucide chevron-down, rotated by the caller when a section is open. */}
      {name === 'chevron-down' && <Path {...s} d="m6 9 6 6 6-6" />}
      {name === 'refresh' && (
        <>
          <Path {...s} d="M21 12a9 9 0 1 1-3-6.7" />
          <Path {...s} d="M21 4v5h-5" />
        </>
      )}
      {name === 'bell' && (
        <>
          <Path {...s} d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" />
          <Path {...s} d="M10.5 20a1.8 1.8 0 0 0 3 0" />
        </>
      )}
      {name === 'search' && (
        <>
          <Circle {...s} cx="11" cy="11" r="7" />
          <Path {...s} d="M21 21l-4.3-4.3" />
        </>
      )}
      {/* Solid by design - the play badge on a feed card's thumbnail. */}
      {name === 'play' && <Path d="M7 4.5v15l13-7.5-13-7.5Z" fill={color} />}
      {name === 'heart' && (
        <Path
          {...s}
          fill={fill}
          d="M12 20.4 3.9 12.3a5 5 0 0 1 7.1-7.1l1 1 1-1a5 5 0 0 1 7.1 7.1z"
        />
      )}
      {name === 'comment' && (
        <Path
          {...s}
          d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"
        />
      )}
      {name === 'external' && (
        <>
          <Path {...s} d="M14 4h6v6" />
          <Path {...s} d="M20 4 10 14" />
          <Path {...s} d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" />
        </>
      )}
      {name === 'bookmark' && <Path {...s} fill={fill} d="M6 4h12v17l-6-4.2L6 21V4Z" />}
      {name === 'sun' && (
        <>
          <Circle {...s} cx="12" cy="12" r="4" />
          <Path
            {...s}
            d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"
          />
        </>
      )}
      {/* Lucide's "settings-2" - two sliders. The gear variant collapses into
          a blob at this stroke weight and size. */}
      {name === 'settings' && (
        <>
          <Path {...s} d="M20 7h-9" />
          <Path {...s} d="M14 17H5" />
          <Circle {...s} cx="17" cy="17" r="3" />
          <Circle {...s} cx="7" cy="7" r="3" />
        </>
      )}
      {name === 'home' && (
        <>
          <Path {...s} d="M4 11.5 12 4l8 7.5" />
          <Path {...s} d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9" />
        </>
      )}
      {name === 'scrolls' && (
        <>
          <Rect {...s} x="3" y="4" width="18" height="16" rx="2" />
          <Path {...s} d="M3 9h18M3 15h18M8 4v16M16 4v16" />
        </>
      )}
      {name === 'plus' && <Path {...s} d="M12 5v14M5 12h14" />}
      {name === 'chart' && (
        <>
          <Path {...s} d="M4 20V10" />
          <Path {...s} d="M12 20V4" />
          <Path {...s} d="M20 20v-7" />
        </>
      )}
      {name === 'user' && (
        <>
          <Circle {...s} cx="12" cy="8" r="3.5" />
          <Path {...s} d="M4.5 20c1.4-3.6 4.4-5.5 7.5-5.5s6.1 1.9 7.5 5.5" />
        </>
      )}
      {name === 'star' && (
        <Path
          {...s}
          fill={fill}
          d="M12 3.5l2.5 5.4 5.9.7-4.4 4.1 1.2 5.8L12 16.7l-5.2 2.8 1.2-5.8-4.4-4.1 5.9-.7L12 3.5Z"
        />
      )}
      {/* Lucide trophy - the Home header's way to the leaderboard. */}
      {name === 'trophy' && (
        <>
          <Path {...s} d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
          <Path {...s} d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
          <Path {...s} d="M4 22h16" />
          <Path {...s} d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
          <Path {...s} d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
          <Path {...s} d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
        </>
      )}
      {name === 'pencil' && (
        <>
          <Path {...s} d="M4 20l4-1 11-11-3-3L5 16l-1 4Z" />
          <Path {...s} d="M14 5l3 3" />
        </>
      )}
      {name === 'lock' && (
        <>
          <Rect {...s} x="4" y="10" width="16" height="10" rx="2" />
          <Path {...s} d="M8 10V7a4 4 0 0 1 8 0v3" />
        </>
      )}
      {name === 'music' && (
        <>
          <Path {...s} d="M9 18V5l11-2v13" />
          <Circle {...s} cx="6" cy="18" r="3" />
          <Circle {...s} cx="17" cy="16" r="3" />
        </>
      )}
      {name === 'image' && (
        <>
          <Rect {...s} x="3" y="4" width="18" height="16" rx="2" />
          <Circle {...s} cx="8.5" cy="9.5" r="1.8" />
          <Path {...s} d="M4 17l4.5-4.5 3 3L15 12l5 5" />
        </>
      )}
    </Svg>
  );
}
