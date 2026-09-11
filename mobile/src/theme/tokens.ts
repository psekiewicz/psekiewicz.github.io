// The "Organic" design system, as drawn in the Bloom direction (artboard 1b of
// the Showcase App canvas). Warm cream ground, terracotta accent with a sage
// second accent, corners that run from 14px up to 34px and then to full pills.
//
// This deliberately no longer tracks css/style.css. The app used to transcribe
// the site's tokens so the two read as one product; Bloom is its own direction
// and the site has not moved to it, so the two are expected to differ until it
// does.
//
// Values are lifted from the artboard and from the design system's own
// styles.css (`_ds/organic-*/styles.css`) that it links.

export const lightColors = {
  // The page ground is the lighter cream; cards sit a shade *deeper* than it
  // rather than lighter, which is what gives Bloom its stacked-paper look.
  bg: '#fdf7ea',
  surface: '#f5ead8',
  surfaceAlt: '#ebddc5',
  border: '#efe0c6',
  borderStrong: '#e2d0ae',

  text: '#201e1d',
  textMuted: '#5f5852',
  textFaint: '#8b8177',

  // Terracotta. `primary` is the fill, `primaryDeep` the text/icon colour on
  // top of a `primarySoft` tint - the ramp step past the base, as the design
  // system's guidance asks for.
  primary: '#c67139',
  primaryHover: '#b2622d',
  primaryDeep: '#8f4a1e',
  primarySoft: '#f3e0cf',

  // Sage, the second accent, with the same three roles.
  accent: '#7a8a5e',
  accentDeep: '#4e5a38',
  accentSoft: '#e4e7d5',

  sand: '#e2d0ae',

  // Cream, for type and icons sitting on an accent fill.
  onAccent: '#fdf7ea',

  // Scrolls is full-bleed dark in both themes - a feed of media reads better
  // on black, and the artboard draws it that way.
  scrollsBg: '#241f18',

  // Not in the artboard, which never draws an error or a success state. Left
  // on the previous values rather than invented, but pulled towards the warm
  // ground so they don't read as a different app.
  danger: '#b3261e',
  dangerSoft: '#f7ded9',
  success: '#4e5a38',
  successSoft: '#e4e7d5',

  mutedSoft: '#efe0c6',
  navbarBg: 'rgba(253, 247, 234, 0.94)',
  scrim: 'rgba(32, 30, 29, 0.58)',
};

// Bloom is drawn light-only. The app already ships a dark mode and a setting
// for it, so rather than drop either, this is the same palette walked down the
// design system's own neutral ramp (`--color-neutral-800/900`) - the accents
// keep their hue and step one lighter, as its guidance says to do on a dark
// ground.
export const darkColors: typeof lightColors = {
  bg: '#201e1d',
  surface: '#2e2b25',
  surfaceAlt: '#474238',
  border: '#3b3730',
  borderStrong: '#56503f',

  text: '#f9f4ed',
  textMuted: '#c0b6a5',
  textFaint: '#a19786',

  primary: '#d67f48',
  primaryHover: '#f6a06b',
  primaryDeep: '#ffc6a5',
  primarySoft: '#3d2a1c',

  accent: '#8fa073',
  accentDeep: '#ccdbb2',
  accentSoft: '#2f3626',

  sand: '#645c50',

  onAccent: '#fdf7ea',

  scrollsBg: '#241f18',

  danger: '#e5675c',
  dangerSoft: '#3a211e',
  success: '#8fa073',
  successSoft: '#2f3626',

  mutedSoft: '#35312a',
  navbarBg: 'rgba(32, 30, 29, 0.94)',
  scrim: 'rgba(32, 30, 29, 0.58)',
};

// The brand mark's own colours, fixed across both themes. On Bloom's splash
// the mark sits on a terracotta field, so the two chevrons are cream and a
// pale sage rather than the site's orange and blue.
export const brand = {
  orange: '#f97316',
  blue: '#0ea5e9',
  splashFront: '#fdf7ea',
  splashBack: '#e4e7d5',
};

// Bloom rounds hard: 14 on thumbnails, 22 on rows and tiles, 26 on feed cards,
// 34 where a header sheds its corners into the page, and 999 for every pill.
export const radius = { sm: 14, md: 22, lg: 26, xl: 34, pill: 999 };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

// Every screen in the artboard insets its content by 22.
export const gutter = 22;

// The artboard keeps JetBrains Mono as the type voice (the design system's own
// Caprasimo/Figtree pairing is not used here), so this stays on the platform
// monospace face for the same reason as before: no font to bundle, no
// first-frame cost.
export const font = {
  mono: 'monospace',
};

export const typography = {
  // "Discover", "Your work" - the big screen titles on an accent header.
  h1: { fontSize: 30, fontWeight: '700' as const, letterSpacing: -1.2 },
  // "Mara Kell" - a display name over the page ground.
  h2: { fontSize: 25, fontWeight: '700' as const, letterSpacing: -0.9 },
  // Sheet headings.
  h3: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.7 },
  // A feed card's title.
  cardTitle: { fontSize: 18, fontWeight: '700' as const, letterSpacing: -0.35, lineHeight: 23 },
  // A row's title.
  rowTitle: { fontSize: 14, fontWeight: '700' as const, lineHeight: 19 },
  body: { fontSize: 13, lineHeight: 21 },
  small: { fontSize: 12, lineHeight: 18 },
  tiny: { fontSize: 11, fontWeight: '700' as const },
  // The small-caps micro-labels doing the work headings used to.
  eyebrow: {
    fontSize: 10,
    fontWeight: '700' as const,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
  },
  // The tighter tracking the artboard uses inside tinted pills and stat blocks.
  label: {
    fontSize: 10,
    fontWeight: '700' as const,
    letterSpacing: 1.6,
    textTransform: 'uppercase' as const,
  },
};

export type Colors = typeof lightColors;
