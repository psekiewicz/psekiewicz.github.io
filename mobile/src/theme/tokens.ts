// The app's palette: white and ink, like the splash, with a single blue.
// Corners run from 14px up to 34px and then to full pills.
//
// This deliberately does not track css/style.css; the app is its own direction
// and the site has not moved to it.

export const lightColors = {
  // White ground, ink type, one blue. The splash is ink on white and the app
  // now carries on in the same terms: surfaces are warm greys stepped off the
  // ink (#191713), and blue is the only colour that is not neutral.
  bg: '#ffffff',
  surface: '#f6f5f3',
  surfaceAlt: '#ecebe8',
  border: '#e9e8e4',
  borderStrong: '#d6d4cf',

  text: '#191713',
  textMuted: '#5c5952',
  textFaint: '#8a867e',

  // The blue. `primary` is the fill, `primaryDeep` the text/icon colour on top
  // of a `primarySoft` tint. Change these four and the whole app follows.
  primary: '#1f7a99',
  primaryHover: '#196681',
  primaryDeep: '#12506a',
  primarySoft: '#e3f0f5',

  // The second accent is ink itself, with the same three roles.
  accent: '#191713',
  accentDeep: '#191713',
  accentSoft: '#efeeec',

  sand: '#d6d4cf',

  // White, for type and icons sitting on an accent fill.
  onAccent: '#ffffff',

  // Demos is full-bleed dark in both themes - a feed of media reads better
  // on black.
  feedBg: '#191713',

  danger: '#b3261e',
  dangerSoft: '#fbe6e4',
  success: '#2f7d4f',
  successSoft: '#e1f1e7',

  mutedSoft: '#efeeec',
  navbarBg: 'rgba(255, 255, 255, 0.94)',
  scrim: 'rgba(25, 23, 19, 0.58)',
};

// The same palette turned over: ink ground, white type, the blue a step
// lighter so it holds against the ink and still carries white type.
export const darkColors: typeof lightColors = {
  bg: '#191713',
  surface: '#242220',
  surfaceAlt: '#33302c',
  border: '#2f2c28',
  borderStrong: '#48443e',

  text: '#f6f5f3',
  textMuted: '#b9b5ad',
  textFaint: '#8f8b83',

  primary: '#2a86a8',
  primaryHover: '#3a9bbd',
  primaryDeep: '#a9d9ea',
  primarySoft: '#17323c',

  accent: '#f6f5f3',
  accentDeep: '#f6f5f3',
  accentSoft: '#2b2926',

  sand: '#48443e',

  onAccent: '#ffffff',

  feedBg: '#191713',

  danger: '#e5675c',
  dangerSoft: '#3a211e',
  success: '#6fbf8b',
  successSoft: '#1d3326',

  mutedSoft: '#2b2926',
  navbarBg: 'rgba(25, 23, 19, 0.94)',
  scrim: 'rgba(25, 23, 19, 0.58)',
};

// The splash's own colours, fixed across both themes: the ink logo on white.
//
// `splashBg` is written out rather than read from the theme: the field has to
// be the same colour as the native splash underneath, which app.json states
// once and cannot vary by theme, so taking it from the theme made the handover
// jump a shade in dark mode.
export const brand = {
  splashBg: '#ffffff',
  splashFront: '#191713',
};

// Bloom rounds hard: 14 on thumbnails, 22 on rows and tiles, 26 on feed cards,
// 34 where a header sheds its corners into the page, and 999 for every pill.
export const radius = { sm: 14, md: 22, lg: 26, xl: 34, pill: 999 };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

// Every screen in the artboard insets its content by 22.
export const gutter = 22;

// JetBrains Mono, embedded by the expo-font plugin (app.json) and applied to
// every Text and TextInput through components/Text - the same face as the site.
export const font = {
  family: 'JetBrains Mono',
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
