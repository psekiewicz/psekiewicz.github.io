# app-update

The **App updates** screen (Settings → App updates). It shows the installed
version and build and checks for two kinds of update:

- **Quick update** - an over-the-air JavaScript update published with
  `eas update` (`expo-updates`). The app already fetches these by itself on
  launch; this screen lets someone get one now and restart into it.
- **New app version** - a newer APK published as a GitHub release by
  `.github/workflows/android.yml`. The release's run number is the build's
  versionCode, so a higher one is newer. "Download" opens the APK in the
  browser and Android installs it - the app never installs anything itself.

## Removing it (for a Google Play release)

Google Play doesn't allow an app it distributes to update itself any other way
than through Play, so this module has to go from a Play build. It's built to
come out cleanly - everything is in this folder, and the only lines elsewhere
that use it end with an `// app-update` marker. From the repository root:

```sh
node tools/remove-app-update.mjs
cd mobile && npx tsc --noEmit -p .
```

The script deletes this folder and every marked line. Over-the-air updates
keep working without it (expo-updates checks on launch on its own); only the
screen and the APK download go.

`tests/app-update-removable.test.js` keeps this true: it fails if code outside
this folder imports from it on a line without the marker.
