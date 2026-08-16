# Showcase for Android

An Android wrapper around the site in the repository root. The APK is a thin
native shell — a single full-screen `WebView` pointed at
<https://psekiewicz.github.io> — so the app and the website are never out of
sync: deploying to GitHub Pages ships the update to everyone who has the app
installed, with no rebuild and no store review.

The site is already a PWA, so the service worker in `sw.js` still does the
caching inside the app; the shell exists to give it a launcher icon, its own
task in the recents list, real back-button behaviour, fullscreen video, and the
two browser APIs Android's WebView doesn't have (see *The bridge* below).

## Building

Everything needed is in this folder; there is no Android Studio requirement.

```sh
cd android
echo "sdk.dir=/path/to/your/android-sdk" > local.properties   # or set ANDROID_HOME
./gradlew assembleRelease
```

The APK lands in `app/build/outputs/apk/release/app-release.apk`.
`./gradlew assembleDebug` builds a separately-installable debug variant
(application id `…showcase.debug`) that can sit alongside the release one.

Requirements: JDK 17+, Android SDK with platform 35 and build-tools 35.0.0.

## Signing

Release signing is optional and reads from either `keystore.properties` in this
folder (git-ignored) or the environment:

```properties
storeFile=/absolute/path/to/showcase.jks
storePassword=…
keyAlias=showcase
keyPassword=…
```

```sh
keytool -genkeypair -v -keystore showcase.jks -alias showcase \
  -keyalg RSA -keysize 2048 -validity 10000
```

With no keystore configured, `assembleRelease` falls back to the local debug
key and says so in the build log. That APK installs fine by sideloading — but
keep the keystore once you make one, because Android will refuse to upgrade an
installed app with a build signed by a different key.

## The bridge

`app/src/main/assets/bridge.js` is injected at document start, and only on
`https://psekiewicz.github.io` — the origin allow-list is enforced by
`WebViewCompat`, so an embedded YouTube or Spotify player cannot reach the app.
It patches exactly two gaps between Chrome and Android's WebView:

- **`navigator.share` / `navigator.canShare`** — WebView ships neither, so
  sharing a stats card would silently fall through to a download. The shim
  hands the PNG to the Android share sheet instead.
- **`<a download>` pointing at a `blob:` URL** — WebView ignores these. The
  shim reads the blob and writes it to Downloads (Android 10+), or offers the
  share sheet on older versions, which have no permission-free Downloads
  folder.

It also reports the page's current background colour to the app, which is what
keeps the status and navigation bars matching the site's light/dark theme —
including after someone taps the in-page theme toggle.

## App links

The manifest claims `https://psekiewicz.github.io` links with
`android:autoVerify="true"`, but Android only honours that once the site serves
a matching `/.well-known/assetlinks.json`. Until then the app just shows up in
the "open with" chooser, and on Android 12+ the user has to enable *Open
supported links* in the app's settings. To finish the job, publish this at the
site root with the SHA-256 of whichever key signs the release build
(`keytool -list -v -keystore showcase.jks -alias showcase`):

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "io.github.psekiewicz.showcase",
    "sha256_cert_fingerprints": ["AA:BB:…"]
  }
}]
```

## CI

`.github/workflows/android.yml` builds the APK on every push that touches this
folder and uploads it as a workflow artifact. Pushing a `v*` tag also attaches
the APK to a GitHub release. Add `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`,
`KEY_ALIAS` and `KEY_PASSWORD` as repository secrets to have CI sign with a
real key; without them it produces a debug-signed build.
