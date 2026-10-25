# XOXD - Android app

A real React Native app, not a WebView. Every screen is built from native
Android views (`View`, `FlatList`, `TextInput`, ExoPlayer via `expo-video`),
and nothing in here loads the website. The one WebView is
`components/ProviderEmbed.tsx`, which plays a YouTube, Vimeo, Spotify or
SoundCloud entry the only way those services allow: their own embed (see
"What differs from the website" below).

It talks to the **same Supabase project** the site does, so accounts, entries,
likes, comments, follows, points and levels are shared: publish something in
the app and it's on the site a second later, and vice versa. The Row Level
Security policies in [`../schema.sql`](../schema.sql) are what enforce access -
they apply identically to a request from an APK and a request from a browser.

## Getting the .apk / .aab

For just installing it, there is a download page at
[psekiewicz.github.io/download](https://psekiewicz.github.io/download/), whose
button points at the newest release:

    https://github.com/psekiewicz/psekiewicz.github.io/releases/latest/download/showcase.apk

That link never changes. The workflow below publishes a release on every green
build of `main`, so it always serves the current APK without anyone editing a
page or committing a binary - a 75 MB file per version, in git, is history that
cannot be pruned later.

The build runs in GitHub Actions, so you don't need Node, a JDK or the Android
SDK on your machine.

1. Push this folder to `main` (or open the repo's **Actions** tab and run
   **Build Android app** manually via *Run workflow*).
2. When the run finishes, download the artifacts at the bottom of the run page:
   - **`showcase-apk`** - sideload this onto a phone to try it.
   - **`showcase-aab`** - the format Google Play requires for an upload.

### Signing

An app's signing key is its identity. Android installs an update over an
existing app only when both carry the same signature, and Play ties a listing
to one key for good - so the key has to outlive any single build.

The release key for this app exists and every published APK is signed with it.
Its certificate fingerprint is:

```
SHA-256  8E:67:A9:EE:3F:5C:E4:4A:6E:72:7B:36:53:C2:B7:03:EF:80:79:58:67:8B:3B:26:4A:15:99:8A:70:8E:B3:66
```

Anything claiming to be this app should match that. To check a file you have
downloaded:

```bash
apksigner verify --print-certs showcase.apk
```

The keystore is deliberately **not** in this repository - it is a private key,
and this repository is public and is also the website, so committing it would
publish it. It is held outside git; see the four repository secrets below.

**The workflow only uses that key once these four secrets exist**
(*Settings → Secrets and variables → Actions*). Until they do, each run falls
back to generating a throwaway key, and its APK will not install over one
signed with the real key:

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 showcase-release.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | the store password |
| `ANDROID_KEY_ALIAS` | `showcase` |
| `ANDROID_KEY_PASSWORD` | the key password (same value - PKCS12 requires it) |

Losing the `.jks` means never updating this app under the same listing, or
over the top of any copy already installed. Back it up somewhere that is not
only this machine.

To generate a replacement from scratch - which starts a new identity, with the
same consequences as losing the old one:

```bash
keytool -genkeypair -v -keystore showcase-release.jks -storetype PKCS12 \
  -alias showcase -keyalg RSA -keysize 2048 -validity 10000
```

How it's wired: `android/` is generated on every run and never committed, so
there's no `build.gradle` to edit by hand. [`plugins/withReleaseSigning.js`](plugins/withReleaseSigning.js)
is an Expo config plugin that runs during `prebuild` and gives the generated
project a `release` signing config reading four Gradle properties; CI appends
those properties (and the keystore itself) after prebuild. No key material is
in the repo. If the properties are absent - a plain local release build - it
stays on the debug key exactly as the stock template does, and CI's
`apksigner` check is what guarantees a *published* artifact never does.

## Running it locally (optional)

Needs Node 20+. `npm ci`, then `npx expo start` and scan the QR with Expo Go
for a quick look, or `npx expo run:android` for a real debug build (that one
also needs JDK 17 and Android Studio's SDK).

CI installs from `package-lock.json` with `npm ci`, so dependency changes are
made here and committed rather than resolved during a build. When bumping the
Expo SDK, run `npx expo install --fix` locally to let Expo reconcile React
Native and every `expo-*` package to versions its SDK actually expects, then
commit the resulting `package.json` **and** `package-lock.json` together.

## Over-the-air updates

`.github/workflows/eas-update.yml` publishes the JavaScript part of every push
to `main` through EAS Update, and installed apps pick it up on their next
start. An update only reaches a build with the same runtime version, and
`app.json` sets that from a **fingerprint** of everything native: dependencies
with native code, config plugins, app.json's native settings. A change that
needs a new APK changes the fingerprint on its own, so an update can never
reach a build that lacks the native code it expects - which used to depend on
remembering to bump `expo.version`.

[`fingerprint.config.js`](fingerprint.config.js) leaves the version fields out
of it: `android.yml` stamps `versionCode` with the run number just before it
builds, which the update job never sees, and with it included no update would
ever have matched an APK. Checked by building the fingerprint both ways - on a
clean checkout, as `eas update` does, and after CI's prebuild and Gradle edits,
as the build does - and comparing.

Builds made before the switch report runtime version 1.2.0 and receive nothing
new: install the next APK from the download page once, and updates flow again.

## Staying in the app

Nothing tapped inside the app sends someone out of it. Every link goes
through `src/lib/links.ts`: a website link (an entry, article, newsletter,
profile, the leaderboard, the shop) opens the matching screen
(`src/lib/siteRoutes.ts`), any other web link opens in an in-app browser tab
(`expo-web-browser`), and only `mailto:` and other apps' schemes reach the
system. `tests/app-links.test.js` fails if code anywhere else opens a URL.

The sign-up and password-reset emails sent from the app come back to it at
`showcase://auth` (`src/lib/authLinks.ts`): confirming signs the person in,
and a reset opens the Reset password screen. Supabase only redirects there if
`showcase://**` is on the project's Redirect URLs list (Authentication → URL
Configuration); otherwise the link falls back to the website.

Website links tapped in *other* apps still open the browser - claiming them
with Android App Links was turned off on request.

## Version names

`expo.version` in `app.json` is the name people see: in Settings, on the App
updates screen, and in each GitHub release's title ("XOXD 1.3.0 (build 112)").
It no longer affects which updates reach which build (that's the fingerprint,
above), and that's why it stopped moving after 1.2.0 - so bump it by hand
with the change that earns it:

```sh
node tools/bump-version.mjs minor   # new features      1.3.0 -> 1.4.0
node tools/bump-version.mjs patch   # fixes only         1.3.0 -> 1.3.1
node tools/bump-version.mjs major   # a different app    1.3.0 -> 2.0.0
```

The build number is separate: `android.yml` sets `versionCode` to the run
number, so every APK is newer than the last even when the name stays put.

| Version | What came with it |
| --- | --- |
| 1.7.0 | The intro: a fresh install opens on a short animated tour - Demos, News, Ranks, You - ending on Get started; Settings can replay it |
| 1.8.0 | Your own newsletter: start one for points (free once you're popular), pick its editors; Completionist for every achievement; the intro waits for Next |
| 1.8.1 | Bold italic shows: italic made bold (or bold made italic) renders as both, and Italic on bold text no longer strips it |
| 1.6.1 | The Demos tab's icon is a play button in a circle (the website's too) |
| 1.6.0 | Features that connect: your shop border and name effect wherever you appear, one Activity list on profiles, and news articles and demos linking both ways |
| 1.5.0 | One app instead of segments: News is a tab (Demos / News / + / Ranks / You), Your work, Saved, Shop and Settings are one list on You, the duplicate leaderboard and news buttons are gone, and lists and badges share one look |
| 1.4.0 | Everything stays in the app: website links open app screens, other links an in-app browser tab, and sign-up and password-reset emails come back into the app |
| 1.3.0 | Demos only; News with newsletters and read marks; the App updates screen |
| 1.2.0 | Changelog, Try it / Source, Shipper and Maintainer, fingerprint OTA |
| 1.1.1 | Reports from the app, then background notifications, JetBrains Mono, rotation and the XOXD name |

## Layout

```
src/
  data/        one module per table - direct ports of the site's js/*-data.js
  lib/         shared logic: levels, achievements, shop catalog,
               cosmetics, media resolution, motion.ts (shared animations),
               notify.ts (the background notification check)
  screens/     one per screen
  components/  ui.tsx (the design system), Text (JetBrains Mono for every Text
               and TextInput), TopBar (the slim bar over every feed screen),
               PostCard / PostTile (timeline posts and grid tiles),
               FeedTabs, CommentsSection, UpdatesSection (a project's
               changelog), SplashReveal (the startup animation)
  theme/       the site's CSS custom properties, transcribed, plus
               MotionProvider (Settings' animations on/off/system toggle)
  context/     AuthContext - session, profile, and the cold-start gate
plugins/       Expo config plugins - build-time edits to the generated
               android/ project, which is regenerated and never committed
```

## Notifications

A like, comment or follow - or new work from someone you follow - shows up as a phone notification (Settings →
Notifications → Enable), even when the app is closed - but it can arrive late,
and that is deliberate.

Instant push on Android only travels through Firebase Cloud Messaging, which
this project doesn't use. So the phone asks instead of being told:
[`src/lib/notify.ts`](src/lib/notify.ts) registers an `expo-background-task`
that Android runs roughly every 15 minutes (its minimum - idle and battery saver
stretch it further). Each run reads the signed-in account's unread rows from
`public.notifications`, the same table the site's bell uses, and shows the ones
it hasn't shown before as local notifications; tapping one opens the entry or
the person through the app's normal deep links. The same check also runs
whenever you return to the app.

Nothing is needed on the server and no account anywhere. An earlier Expo push
setup (`send_push()` and `push_tokens`) has been removed; `schema.sql` drops
both so a database built from it matches the live one.

## Animations

Everything interactive - buttons, cards, chips, list rows, the tab bar, the
startup screen - is animated via `lib/motion.ts` and `MotionProvider`, which
also reads the OS's reduce-motion accessibility setting by default. Settings
→ Animations overrides that per-device (On/Off/System), and the animated shop
cosmetics (backgrounds, frames, nickname fills) follow it too: with animations
off they hold their first frame.

The `data/` modules are deliberately near-identical to their web counterparts,
down to the comments, so a change to one has an obvious counterpart in the
other. The only structural difference is the Supabase client import and
AsyncStorage in place of `localStorage`.

## What the app does that the site can't

**It receives Android's Share.** XOXD appears in the share sheet of
anything that shares plain text - a browser, YouTube, Spotify - and opens the
editor with the link already in place and any accompanying text as a starting
title. Entries here are links, so this removes the entire find-copy-return-paste
errand that made the app feel like a worse copy of the website.

React Native's `Linking` only reads an intent's data URI and knows nothing of
`ACTION_SEND`, so [`plugins/withShareIntent.js`](plugins/withShareIntent.js)
rewrites the share into a `showcase://share?...` VIEW intent before React Native
sees it. From there it is an ordinary deep link, routed by the `linking` config
in `src/navigation/RootNavigator.tsx`.

A share sheet only helps where the source app offers one, so the editor also has
a **Paste from clipboard** button for links you have merely copied.

## What differs from the website, and why

Two things could not carry over as-is. Both are visible decisions rather
than omissions:

**Third-party players run in their own embed.** A direct `.mp4`/`.mp3`/`.jpg`
URL plays in a real Android player. YouTube, Vimeo, Spotify and SoundCloud
expose no playable stream - the only in-app way to play them is their iframe
embed, so `components/ProviderEmbed.tsx` hosts that iframe in a WebView, on a
page given the site's origin so the providers treat it as the site. The host
allowlist from `js/media.js` is kept in `lib/media.ts`: the id is extracted and
the embed URL rebuilt, so a user-supplied link never becomes the iframe's
address.

**Shop cosmetics are the web's pictures.** Backgrounds and avatar frames are
the same WebP files the site draws (`assets/shop/`, fetched from the site, not
bundled), animated ones included - `expo-image` plays them, and holds them on
the first frame when animations are off (Settings, or the system's reduce
motion). Nicknames get their picture too: `DisplayName` masks the image with
the text through `@react-native-masked-view/masked-view`, the native
counterpart of the web's `background-clip: text`; the solid colours in
`NAME_STYLES` (`lib/cosmetics.ts`) show while it loads. Items that are no
longer sold are drawn as their replacement (`RETIRED_ALIASES`).

## Things that need the Edge Function

Ban, unban and account deletion call the `admin-actions` Supabase Edge Function
- the same one the site uses, for the same reason: they need the
`service_role` key, which must never ship inside a client. An APK is a client
that can be unzipped, so this is if anything more true here. If you haven't
deployed it (see the root README), those buttons return an error and everything
else works.
