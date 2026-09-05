# Showcase - Android app

A real React Native app, not a WebView. Every screen is built from native
Android views (`View`, `FlatList`, `TextInput`, ExoPlayer via `expo-video`);
there is no `WebView` dependency anywhere in the tree, and nothing in here
loads the website.

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

## Layout

```
src/
  data/        one module per table - direct ports of the site's js/*-data.js
  lib/         shared logic: levels, feed ranking, achievements, shop catalog,
               cosmetics, media resolution, motion.ts (shared animations),
               push.ts (push token registration)
  screens/     one per screen
  components/  ui.tsx (the design system), ProjectCard, CommentsSheet,
               SplashReveal (the startup animation)
  theme/       the site's CSS custom properties, transcribed, plus
               MotionProvider (Settings' animations on/off/system toggle)
  context/     AuthContext - session, profile, and the cold-start gate
plugins/       Expo config plugins - build-time edits to the generated
               android/ project, which is regenerated and never committed
```

## Push notifications

A like, comment or follow pushes to every device you've enabled notifications
on (Settings → Notifications), even if the app isn't open. The whole path is
in [`../schema.sql`](../schema.sql): `public.push_tokens` holds one row per
registered device, and `add_notification()` - the same function the site's
in-app bell already calls - now also calls `send_push()`, which POSTs to
Expo's push relay via `pg_net` (Supabase's own extension for this, enabled
automatically by the script). No Edge Function, no server - the same "paste
schema.sql into the SQL Editor" step that sets up everything else also sets
up push.

That covers the *server* side unconditionally. Actually **receiving** a push
needs two things from Expo's tooling that a plain `npx expo start` doesn't
set up on its own:

1. **An EAS project id** - `Notifications.getExpoPushTokenAsync()` needs one
   to know which project a token belongs to. Run `eas init` once (needs a
   free Expo account); it writes `extra.eas.projectId` into `app.json` - commit
   that. Without it, Settings' "Enable notifications" button fails with an
   explanatory error rather than silently doing nothing.
2. **Android credentials** - Expo's push relay hands Android deliveries off
   to Firebase Cloud Messaging, which needs its own credentials per project
   (Expo no longer provides shared ones). Create a Firebase project, then run
   `eas credentials` and follow the Android → Push Notifications prompts to
   upload its service account key. iOS is simpler: EAS can generate and
   manage APNs credentials for you the first time you build.

Until both are done, everything still works except the push itself - the
in-app bell, `public.notifications`, all of it - `send_push()` just has
nothing to reach.

## Animations

Everything interactive - buttons, cards, chips, list rows, the tab bar, the
startup screen - is animated via `lib/motion.ts` and `MotionProvider`, which
also reads the OS's reduce-motion accessibility setting by default. Settings
→ Animations overrides that per-device (On/Off/System). One thing stays
static regardless: the animated shop cosmetics in Scrolls (see below) - a
one-shot UI animation and a continuous per-frame CSS-style keyframe running
on every visible avatar in a scrolling feed are different costs, and that
tradeoff hasn't changed.

The `data/` modules are deliberately near-identical to their web counterparts,
down to the comments, so a change to one has an obvious counterpart in the
other. The only structural difference is the Supabase client import and
AsyncStorage in place of `localStorage`.

## What the app does that the site can't

**It receives Android's Share.** Showcase appears in the share sheet of
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

Three things could not carry over as-is. All three are visible decisions rather
than omissions:

**Third-party media doesn't play in-app.** A direct `.mp4`/`.mp3`/`.jpg` URL
plays in a real Android player. YouTube, Vimeo, Spotify and SoundCloud expose
no playable stream - the only in-app way to play them is their iframe embed,
which means a WebView. Rather than smuggle one in, `lib/media.ts` resolves the
canonical link and hands it to Android, which opens the official app if it's
installed. The host allowlist from `js/media.js` is kept, so a user-supplied
link can never send the OS somewhere of its own choosing.

**Animated shop cosmetics render as static frames.** The CSS versions of Lava
Lamp, Orbit, Spectrum Spin, Glitch and Sparkle are keyframe animations. Running
one per avatar in a scrolling feed costs more frame rate than the effect is
worth, so `lib/cosmetics.ts` maps each to a still frame of the same palette.
Everything is still recognisably the item that was bought.

**The type is Android's monospace, not JetBrains Mono.** Bundling the variable
font would add to the APK and to first-frame cost for a face the platform
already has a good equivalent of. Same typographic decision, local materials.

Also worth knowing: gradient-filled *text* effects (`name-gradient`,
`name-rainbow`) take their dominant colour as a solid, because React Native
can't paint a gradient into glyphs without a masking layer.

## Things that need the Edge Function

Ban, unban and account deletion call the `admin-actions` Supabase Edge Function
- the same one the site uses, for the same reason: they need the
`service_role` key, which must never ship inside a client. An APK is a client
that can be unzipped, so this is if anything more true here. If you haven't
deployed it (see the root README), those buttons return an error and everything
else works.
