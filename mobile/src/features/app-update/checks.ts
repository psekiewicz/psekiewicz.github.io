import * as Application from 'expo-application';
import * as Updates from 'expo-updates';

// The two ways a copy of the app gets newer, and how to tell whether there is
// something to get:
//
// - Over the air: JavaScript and assets published with `eas update` (see
//   .github/workflows/eas-update.yml) to the build's channel. expo-updates
//   already checks on launch and swaps the new bundle in on the next start;
//   this only lets someone ask now and restart straight into it.
// - A new APK: the native app itself, built by .github/workflows/android.yml
//   and published as a GitHub release tagged android-v<version>-<run number>.
//   The run number is also the build's versionCode, so a release whose run
//   number is higher than this build's is newer. Installing it is the phone's
//   job: the APK is opened in the browser, never downloaded by the app.
//
// The APK half is what a Google Play build can't have (an app from Play may
// only be updated by Play) - which is why this whole folder can go; see
// README.md here.

const REPO = 'psekiewicz/psekiewicz.github.io';
const APK_NAME = 'showcase.apk';

export type InstalledVersion = {
  version: string;
  build: number | null;
  channel: string | null;
  // The over-the-air update running now; null while it's the bundle the APK
  // shipped with.
  updateId: string | null;
  updatedAt: Date | null;
};

export function installedVersion(): InstalledVersion {
  const build = Number.parseInt(Application.nativeBuildVersion || '', 10);
  return {
    version: Application.nativeApplicationVersion || '?',
    build: Number.isFinite(build) ? build : null,
    channel: Updates.channel,
    updateId: Updates.isEmbeddedLaunch ? null : Updates.updateId,
    updatedAt: Updates.isEmbeddedLaunch ? null : Updates.createdAt,
  };
}

/** Over-the-air updates only exist in a release build (not in Expo Go or dev). */
export const otaAvailable = Updates.isEnabled;

export async function checkOta(): Promise<boolean> {
  if (!Updates.isEnabled) return false;
  const result = await Updates.checkForUpdateAsync();
  return result.isAvailable;
}

/** Downloads the waiting update and restarts into it. Doesn't return when it works. */
export async function applyOta() {
  await Updates.fetchUpdateAsync();
  await Updates.reloadAsync();
}

export type ApkRelease = {
  version: string;
  build: number;
  name: string;
  publishedAt: string;
  downloadUrl: string;
};

const TAG = /^android-v(.+)-(\d+)$/;

/** The newest published APK, or null if there is none to be read. */
export async function latestApk(): Promise<ApkRelease | null> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  const release = await res.json();
  const match = TAG.exec(release.tag_name || '');
  const asset = (release.assets || []).find((a: any) => a.name === APK_NAME);
  if (!match || !asset) return null;
  return {
    version: match[1],
    build: Number(match[2]),
    name: release.name || release.tag_name,
    publishedAt: release.published_at,
    downloadUrl: asset.browser_download_url,
  };
}

/** True when `release` is a newer build than the one installed. */
export function isNewerApk(release: ApkRelease | null, installed: InstalledVersion) {
  return Boolean(release && installed.build !== null && release.build > installed.build);
}

/** Both checks at once, for the Settings row's "update available" mark. Never throws. */
export async function anythingNew() {
  const [ota, apk] = await Promise.all([checkOta().catch(() => false), latestApk().catch(() => null)]);
  return ota || isNewerApk(apk, installedVersion());
}
