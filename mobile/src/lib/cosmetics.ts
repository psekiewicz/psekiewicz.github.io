import type { TextStyle } from 'react-native';

import { RETIRED_ALIASES, SHOP_ITEMS } from './shopItems';

// Native side of the shop cosmetics. Backgrounds and avatar frames are the
// same pictures the web draws (assets/shop/, rendered by
// tools/gen-shop-art.py) - fetched from the site rather than bundled, the way
// avatar photos already are, so the app doesn't ship a second copy of the art.
// Animated ones are animated WebP, which expo-image plays.
//
// What can't come across is the nickname fill: the web paints a picture
// through the glyphs, and React Native has no way to do that without a
// masking layer the app doesn't carry. A nickname keeps a solid colour taken
// from its picture, plus a shadow where the web has one.
//
// An id that is no longer sold (RETIRED_ALIASES) is drawn as its replacement.

const ASSET_BASE = 'https://psekiewicz.github.io/assets/shop';

// The frame picture is 4/3 the size of the avatar, its hole 75% of it, so it
// overhangs by a sixth of the avatar's width on each side. Same numbers as
// css/style.css.
export const FRAME_SCALE = 4 / 3;

// border-flame is the one frame drawn before that geometry existed; it is a
// 640x584 picture around a 377x386 hole (see css/style.css).
const LEGACY_FRAME = 'border-flame';
const LEGACY_FRAME_BOX = { left: -0.3674, top: -0.3277, width: 1.6976, height: 1.513 };

export function resolveId(itemId: string | null | undefined): string | null {
  if (!itemId || itemId === 'none') return null;
  return RETIRED_ALIASES[itemId] || itemId;
}

function isKnown(id: string) {
  return SHOP_ITEMS.some((item) => item.id === id);
}

export function bgImage(itemId: string | null | undefined): string | null {
  const id = resolveId(itemId);
  return id && id.startsWith('bg-') && isKnown(id) ? `${ASSET_BASE}/bg/${id}.webp` : null;
}

export type Frame = {
  image: string;
  /** Where the picture sits, as fractions of the avatar's size. */
  box: { left: number; top: number; width: number; height: number };
};

export function frameFor(itemId: string | null | undefined): Frame | null {
  const id = resolveId(itemId);
  if (!id || !id.startsWith('border-') || !isKnown(id)) return null;
  if (id === LEGACY_FRAME) return { image: `${ASSET_BASE}/border-flame.png`, box: LEGACY_FRAME_BOX };
  const overhang = (FRAME_SCALE - 1) / 2;
  return {
    image: `${ASSET_BASE}/border/${id}.webp`,
    box: { left: -overhang, top: -overhang, width: FRAME_SCALE, height: FRAME_SCALE },
  };
}

export function nameImage(itemId: string | null | undefined): string | null {
  const id = resolveId(itemId);
  return id && id.startsWith('name-') && isKnown(id) ? `${ASSET_BASE}/name/${id}.webp` : null;
}

export const NAME_STYLES: Record<string, TextStyle> = {
  'name-caps': { textTransform: 'uppercase', letterSpacing: 1.5, fontSize: 13 },
  'name-gradient': { color: '#b0763f' },
  'name-woof': { color: '#b5651d' },
  'name-tropic': { color: '#00b894', textShadowColor: 'rgba(0,40,60,0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1 },
  'name-terminal': { color: '#39ff88', fontFamily: 'monospace' },
  'name-ice': { color: '#7fd0f5', textShadowColor: 'rgba(10,60,100,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  'name-gold': { color: '#d4af37', textShadowColor: '#8a6d1f', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1 },
  'name-glitch': { color: '#ff2bd6', textShadowColor: '#00f0ff', textShadowOffset: { width: -2, height: 0 }, textShadowRadius: 0 },
};

export function nameStyle(itemId: string | null | undefined): TextStyle | null {
  const id = resolveId(itemId);
  return id ? NAME_STYLES[id] || null : null;
}
