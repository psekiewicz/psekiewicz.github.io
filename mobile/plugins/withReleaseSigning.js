/**
 * Teaches the generated Android project how to sign a release build.
 *
 * `expo prebuild` writes android/ from a template that signs *release* builds
 * with the debug key, and android/ is gitignored because it is regenerated on
 * every CI run — so there is no committed build.gradle to edit by hand. A
 * config plugin is the supported way to change that file: it runs as part of
 * prebuild, so the generated project comes out already correct.
 *
 * The key itself is passed in as Gradle properties rather than written here,
 * so no secret ends up in the repo. CI appends them to android/gradle.properties;
 * see .github/workflows/android.yml.
 *
 * When those properties are absent — a plain local `expo run:android` — the
 * release build stays on the debug key exactly as the stock template leaves it,
 * so this plugin changes nothing about the local workflow.
 */

const { withAppBuildGradle } = require('expo/config-plugins');

const STORE_FILE_PROPERTY = 'SHOWCASE_STORE_FILE';

const RELEASE_SIGNING_CONFIG = `
        release {
            if (project.hasProperty('${STORE_FILE_PROPERTY}')) {
                storeFile file(${STORE_FILE_PROPERTY})
                storePassword SHOWCASE_STORE_PASSWORD
                keyAlias SHOWCASE_KEY_ALIAS
                keyPassword SHOWCASE_KEY_PASSWORD
            }
        }`;

/**
 * Returns the [start, end) span of the body of `<name> {` inside `contents`,
 * searching from `searchFrom`, by matching braces rather than guessing at a
 * regex. Gradle blocks nest, so counting braces is the only way to know where
 * one ends.
 */
function findBlockBody(contents, name, searchFrom = 0) {
  const header = new RegExp(`\\b${name}\\s*\\{`, 'g');
  header.lastIndex = searchFrom;
  const match = header.exec(contents);
  if (!match) return null;

  const bodyStart = match.index + match[0].length;
  let depth = 1;
  for (let i = bodyStart; i < contents.length; i++) {
    if (contents[i] === '{') depth++;
    else if (contents[i] === '}') {
      depth--;
      if (depth === 0) return { start: bodyStart, end: i };
    }
  }
  return null;
}

function addReleaseSigningConfig(contents) {
  const signingConfigs = findBlockBody(contents, 'signingConfigs');
  if (!signingConfigs) {
    throw new Error(
      'withReleaseSigning: no `signingConfigs` block in the generated ' +
        'android/app/build.gradle. The Expo template changed shape; this ' +
        'plugin needs updating before release builds can be signed.'
    );
  }
  return (
    contents.slice(0, signingConfigs.start) +
    RELEASE_SIGNING_CONFIG +
    contents.slice(signingConfigs.start)
  );
}

function pointReleaseBuildTypeAtIt(contents) {
  const buildTypes = findBlockBody(contents, 'buildTypes');
  if (!buildTypes) {
    throw new Error(
      'withReleaseSigning: no `buildTypes` block in the generated ' +
        'android/app/build.gradle. The Expo template changed shape; this ' +
        'plugin needs updating before release builds can be signed.'
    );
  }

  // `signingConfig signingConfigs.debug` appears in both the debug and the
  // release build type. Scoping the search to the release block's own braces
  // is what tells the two apart — counting occurrences would silently target
  // the wrong one if the template ever reorders them.
  const release = findBlockBody(contents, 'release', buildTypes.start);
  if (!release || release.end > buildTypes.end) {
    throw new Error(
      'withReleaseSigning: no `release` build type inside `buildTypes` in the ' +
        'generated android/app/build.gradle. The Expo template changed shape; ' +
        'this plugin needs updating before release builds can be signed.'
    );
  }

  const body = contents.slice(release.start, release.end);
  const signingLine = /signingConfig\s+signingConfigs\.debug/;
  if (!signingLine.test(body)) {
    throw new Error(
      'withReleaseSigning: the `release` build type does not sign with ' +
        '`signingConfigs.debug` as expected, so there is nothing to redirect. ' +
        'The Expo template changed shape; this plugin needs updating.'
    );
  }

  // Fall back to the debug key when the properties are absent, so a local
  // release build behaves exactly as the stock template does.
  const patched = body.replace(
    signingLine,
    `signingConfig project.hasProperty('${STORE_FILE_PROPERTY}') ? signingConfigs.release : signingConfigs.debug`
  );

  return contents.slice(0, release.start) + patched + contents.slice(release.end);
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (gradleConfig) => {
    if (gradleConfig.modResults.language !== 'groovy') {
      throw new Error(
        `withReleaseSigning: expected a Groovy build.gradle, got ` +
          `${gradleConfig.modResults.language}.`
      );
    }

    // prebuild without --clean runs the mods over an already-generated
    // project, so skip work that is already present rather than doubling it.
    if (gradleConfig.modResults.contents.includes(STORE_FILE_PROPERTY)) {
      return gradleConfig;
    }

    let contents = addReleaseSigningConfig(gradleConfig.modResults.contents);
    contents = pointReleaseBuildTypeAtIt(contents);
    gradleConfig.modResults.contents = contents;
    return gradleConfig;
  });
};
