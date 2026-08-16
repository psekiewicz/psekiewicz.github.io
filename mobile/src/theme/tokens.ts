// The design tokens from css/style.css, transcribed. Ink on warm paper with a
// single vermilion accent; hairline rules instead of drop shadows; tight
// corners instead of pills. Keeping the same values means the app and the site
// are recognisably the same product rather than two designs that drifted.

export const lightColors = {
  bg: '#f2efe9',
  surface: '#fbf9f5',
  border: '#ddd7cb',
  borderStrong: '#c3bcac',
  text: '#191713',
  textMuted: '#5d594e',
  textFaint: '#8b867a',

  primary: '#c03a17',
  primaryHover: '#9c2f12',
  primarySoft: '#f6e6dd',
  accent: '#16645c',

  danger: '#b3261e',
  dangerSoft: '#f8e3e0',
  success: '#1f6b3a',
  successSoft: '#e3f0e6',
  mutedSoft: '#e9e5dc',
  navbarBg: 'rgba(242, 239, 233, 0.92)',

  // Scrolls is full-bleed dark in both themes — a feed of media reads better
  // on black, and the web build does the same.
  scrim: 'rgba(0, 0, 0, 0.55)',
};

export const darkColors: typeof lightColors = {
  bg: '#14120f',
  surface: '#1c1a16',
  border: '#302c26',
  borderStrong: '#48423a',
  text: '#f0ece3',
  textMuted: '#a49e91',
  textFaint: '#78726a',

  primary: '#ef6b3c',
  primaryHover: '#ff8558',
  primarySoft: '#2e1d14',
  accent: '#4fbfae',

  danger: '#e5675c',
  dangerSoft: '#35201d',
  success: '#5aa86f',
  successSoft: '#1a2b1f',
  mutedSoft: '#262319',
  navbarBg: 'rgba(20, 18, 15, 0.92)',

  scrim: 'rgba(0, 0, 0, 0.55)',
};

export const radius = { sm: 3, md: 5, lg: 8 };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

// The site is set entirely in JetBrains Mono. Rather than bundle and register
// the variable font (and pay for it in APK size and first-frame cost), the app
// uses Android's own monospace face, which is the same typographic decision
// expressed with what the platform already has.
export const font = {
  mono: 'monospace',
};

export const typography = {
  h1: { fontSize: 26, fontWeight: '700' as const, letterSpacing: -0.5 },
  h2: { fontSize: 20, fontWeight: '700' as const, letterSpacing: -0.3 },
  h3: { fontSize: 16, fontWeight: '700' as const },
  body: { fontSize: 14, lineHeight: 21 },
  small: { fontSize: 12, lineHeight: 18 },
  // The small-caps micro-labels doing the work headings used to.
  eyebrow: {
    fontSize: 10,
    fontWeight: '700' as const,
    letterSpacing: 1.4,
    textTransform: 'uppercase' as const,
  },
};

export type Colors = typeof lightColors;
