// What decides the runtime version (app.json: runtimeVersion.policy
// "fingerprint"). An over-the-air update only reaches builds whose fingerprint
// matches, so anything that changes between building and publishing must not
// count - or no published update would ever reach a phone.
//
// ExpoConfigVersions: CI stamps android.versionCode with the run number just
// before it builds (.github/workflows/android.yml), which eas-update.yml never
// sees. Leaving it in made every APK's fingerprint differ from every update's.
// expo.version is the human-facing number and says nothing about native code
// either. The second entry is the library's own default, kept: prebuild
// rewrites package.json's android/ios scripts.
/** @type {import('expo/fingerprint').Config} */
module.exports = {
  sourceSkips: ['ExpoConfigVersions', 'PackageJsonAndroidAndIosScriptsIfNotContainRun'],
};
