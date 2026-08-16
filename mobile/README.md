# Showcase — Android app

A real React Native app, not a WebView. Every screen is built from native
Android views (`View`, `FlatList`, `TextInput`, ExoPlayer via `expo-video`);
there is no `WebView` dependency anywhere in the tree, and nothing in here
loads the website.

It talks to the **same Supabase project** the site does, so accounts, entries,
likes, comments, follows, points and levels are shared: publish something in
the app and it's on the site a second later, and vice versa. The Row Level
Security policies in [`../schema.sql`](../schema.sql) are what enforce access —
they apply identically to a request from an APK and a request from a browser.

## Getting the .apk / .aab

The build runs in GitHub Actions, so you don't need Node, a JDK or the Android
SDK on your machine.

1. Push this folder to `main` (or open the repo's **Actions** tab and run
   **Build Android app** manually via *Run workflow*).
2. When the run finishes, download the artifacts at the bottom of the run page:
   - **`showcase-apk`** — sideload this onto a phone to try it.
   - **`showcase-aab`** — the format Google Play requires for an upload.

### Signing

With no secrets configured, the workflow generates a throwaway keystore so the
APK is installable. That's fine for testing and **not** fine for Play: every
update to a published app must be signed with the same key, and a fresh key
each run can't satisfy that.

To ship, create a keystore once:

```bash
keytool -genkeypair -v -keystore showcase-release.jks -alias showcase -keyalg RSA -keysize 2048 -validity 10000
```

Then add four repository secrets (*Settings → Secrets and variables → Actions*):

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 showcase-release.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | the store password you chose |
| `ANDROID_KEY_ALIAS` | `showcase` |
| `ANDROID_KEY_PASSWORD` | the key password you chose |

Keep the `.jks` file somewhere safe and out of git — losing it means you can
never update the app on Play under the same listing.

## Running it locally (optional)

Needs Node 20+. `npx expo start` then scan the QR with Expo Go for a quick
look, or `npx expo run:android` for a real debug build (that one also needs
JDK 17 and Android Studio's SDK).

## Layout

```
src/
  data/        one module per table — direct ports of the site's js/*-data.js
  lib/         shared logic: levels, feed ranking, achievements, shop catalog,
               cosmetics, media resolution
  screens/     one per screen
  components/  ui.tsx (the design system), ProjectCard, CommentsSheet
  theme/       the site's CSS custom properties, transcribed
  context/     AuthContext — session, profile, and the cold-start gate
```

The `data/` modules are deliberately near-identical to their web counterparts,
down to the comments, so a change to one has an obvious counterpart in the
other. The only structural difference is the Supabase client import and
AsyncStorage in place of `localStorage`.

## What differs from the website, and why

Three things could not carry over as-is. All three are visible decisions rather
than omissions:

**Third-party media doesn't play in-app.** A direct `.mp4`/`.mp3`/`.jpg` URL
plays in a real Android player. YouTube, Vimeo, Spotify and SoundCloud expose
no playable stream — the only in-app way to play them is their iframe embed,
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
— the same one the site uses, for the same reason: they need the
`service_role` key, which must never ship inside a client. An APK is a client
that can be unzipped, so this is if anything more true here. If you haven't
deployed it (see the root README), those buttons return an error and everything
else works.
