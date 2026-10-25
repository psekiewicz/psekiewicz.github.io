// The intro a fresh install opens on (see IntroScreen.tsx), and the flag that
// keeps it to once per install.
export { IntroRoute, IntroScreen } from './IntroScreen';
export type { IntroExit } from './IntroScreen';
export { hasSeenIntro, markIntroSeen } from './storage';
