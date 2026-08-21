import type { TextStyle } from 'react-native';

// Native equivalents of the shop cosmetics that css/style.css draws with
// gradients, pseudo-elements and keyframe animations.
//
// A background becomes a LinearGradient colour ramp, a border becomes a ring
// colour + width, a nickname effect becomes a TextStyle. The palettes are
// taken from the stylesheet so a cosmetic reads as the same thing it does on
// the web. What does NOT carry over is motion - the animated ones (Lava Lamp,
// Orbit, Spectrum Spin, Glitch, Sparkle) render as a static frame of the same
// palette rather than a loop, because a per-frame animation behind every
// avatar in a scrolling list is the kind of thing that costs a feed its frame
// rate. Everything is still recognisably the item that was bought.

export type Gradient = { colors: string[]; start?: { x: number; y: number }; end?: { x: number; y: number } };

const DIAGONAL = { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } };

export const BG_GRADIENTS: Record<string, Gradient> = {
  'bg-sunset': { colors: ['#ff7e5f', '#feb47b'], ...DIAGONAL },
  'bg-ocean': { colors: ['#2193b0', '#6dd5ed'], ...DIAGONAL },
  'bg-midnight': { colors: ['#0f2027', '#203a43', '#2c5364'], ...DIAGONAL },
  'bg-aurora': { colors: ['#00c9ff', '#92fe9d', '#7f00ff'], ...DIAGONAL },
  'bg-confetti': { colors: ['#f857a6', '#ff5858', '#ffc700'], ...DIAGONAL },
  'bg-blocks': { colors: ['#434343', '#000000'], ...DIAGONAL },
  'bg-paper': { colors: ['#f5f0e6', '#e8e0d0'], ...DIAGONAL },
  'bg-grid': { colors: ['#1b3a5c', '#2c5f8a'], ...DIAGONAL },
  'bg-sunrise': { colors: ['#f6d365', '#fda085'], ...DIAGONAL },
  'bg-forest': { colors: ['#134e5e', '#71b280'], ...DIAGONAL },
  'bg-terminal': { colors: ['#0b1a0b', '#123312'], ...DIAGONAL },
  'bg-halftone': { colors: ['#e0e0e0', '#9e9e9e'], ...DIAGONAL },
  'bg-topo': { colors: ['#3e5151', '#decba4'], ...DIAGONAL },
  'bg-vhs': { colors: ['#1a0033', '#6a00f4', '#00d4ff'], ...DIAGONAL },
  'bg-starfield': { colors: ['#000428', '#004e92'], ...DIAGONAL },
  'bg-vaporwave': { colors: ['#ff71ce', '#01cdfe', '#05ffa1'], ...DIAGONAL },
  'bg-static': { colors: ['#3c3c3c', '#787878', '#1e1e1e'], ...DIAGONAL },
  'bg-lava': { colors: ['#ff4e00', '#ec9f05', '#c1121f'], ...DIAGONAL },
  'bg-paws': { colors: ['#f9c5a7', '#e8956f'], ...DIAGONAL },
  'bg-beach': { colors: ['#f7e8b0', '#4fc3f7', '#0277bd'], ...DIAGONAL },
  'bg-snow': { colors: ['#e6f2ff', '#b3d9ff', '#8ab6d6'], ...DIAGONAL },
};

export type BorderStyle = { color: string; width: number; gradient?: string[] };

export const BORDER_STYLES: Record<string, BorderStyle> = {
  'border-bronze': { color: '#cd7f32', width: 2 },
  'border-silver': { color: '#c0c0c0', width: 2 },
  'border-gold': { color: '#ffd700', width: 2 },
  'border-neon': { color: '#39ff14', width: 2 },
  'border-rainbow': { color: '#ff0080', width: 3, gradient: ['#ff0080', '#ffcc00', '#00ff88', '#00ccff'] },
  'border-flame': { color: '#3ba7ff', width: 3 },
  'border-ink': { color: '#191713', width: 1 },
  'border-dashed': { color: '#8b867a', width: 2 },
  'border-double': { color: '#5d594e', width: 3 },
  'border-emerald': { color: '#2ecc71', width: 2 },
  'border-violet': { color: '#8e44ad', width: 2 },
  'border-ember': { color: '#e25822', width: 3 },
  'border-orbit': { color: '#00b4d8', width: 2 },
  'border-conic': { color: '#ff006e', width: 3, gradient: ['#ff006e', '#fb5607', '#ffbe0b', '#3a86ff'] },
  'border-glitch': { color: '#ff00ff', width: 2 },
  'border-halo': { color: '#fff3b0', width: 3 },
  'border-collar': { color: '#c1121f', width: 3 },
  'border-sun': { color: '#ffb703', width: 3 },
  'border-frost': { color: '#a8dadc', width: 2 },
};

export const NAME_STYLES: Record<string, TextStyle> = {
  // React Native can't paint a gradient into glyphs without an extra masking
  // layer, so the gradient effects take their dominant stop as a solid.
  'name-gradient': { color: '#8e2de2' },
  'name-shadow': { textShadowColor: '#c03a17', textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 0 },
  'name-glow': { color: '#00e5ff', textShadowColor: '#00e5ff', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8 },
  'name-rainbow': { color: '#ff006e' },
  'name-sparkle': { color: '#ffd166', textShadowColor: '#fff', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 6 },
  // The web build ships an Oxygene 1 TTF for this one. The app doesn't bundle
  // it, so the effect falls back to a wide-tracked treatment of the same face.
  'name-oxygene': { letterSpacing: 3, fontWeight: '300' },
  'name-caps': { textTransform: 'uppercase', letterSpacing: 1.5, fontSize: 13 },
  'name-underline': { textDecorationLine: 'underline' },
  'name-marker': { backgroundColor: '#fff59d', color: '#191713' },
  'name-emboss': { textShadowColor: 'rgba(255,255,255,0.7)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 1 },
  'name-outline': { color: 'transparent', textShadowColor: '#191713', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 1.5 },
  'name-terminal': { color: '#39ff14', fontFamily: 'monospace' },
  'name-ice': { color: '#a8dadc', textShadowColor: '#e0fbfc', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  'name-fire': { color: '#ff6b35', textShadowColor: '#ffbe0b', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 6 },
  'name-gold': { color: '#d4af37', textShadowColor: '#8a6d1f', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1 },
  'name-glitch': { color: '#ff00ff', textShadowColor: '#00ffff', textShadowOffset: { width: -2, height: 0 }, textShadowRadius: 0 },
  'name-woof': { color: '#b5651d' },
  'name-tropic': { color: '#00b894' },
};

export function bgGradient(itemId: string): Gradient | null {
  if (!itemId || itemId === 'none') return null;
  return BG_GRADIENTS[itemId] || null;
}

export function borderStyle(itemId: string): BorderStyle | null {
  if (!itemId || itemId === 'none') return null;
  return BORDER_STYLES[itemId] || null;
}

export function nameStyle(itemId: string): TextStyle | null {
  if (!itemId || itemId === 'none') return null;
  return NAME_STYLES[itemId] || null;
}

// A small swatch for the shop grid: whatever the item looks like, reduced to
// one or two colours.
export function previewColors(itemId: string): string[] {
  const bg = BG_GRADIENTS[itemId];
  if (bg) return bg.colors;
  const border = BORDER_STYLES[itemId];
  if (border) return border.gradient || [border.color, border.color];
  const name = NAME_STYLES[itemId];
  if (name?.color && name.color !== 'transparent') return [name.color as string, name.color as string];
  return ['#8b867a', '#5d594e'];
}
