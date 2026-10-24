// Moves the app to its next version name (mobile/app.json, expo.version).
//
//   node tools/bump-version.mjs minor   # 1.2.0 -> 1.3.0: new features
//   node tools/bump-version.mjs patch   # 1.3.0 -> 1.3.1: fixes only
//   node tools/bump-version.mjs major   # 1.3.1 -> 2.0.0: a different app
//
// The version is only the name people see - in Settings, on the App updates
// screen and in the GitHub release ("XOXD 1.3.0 (build 112)"). The build
// number that Android compares is separate and comes from CI. See "Version
// names" in mobile/README.md.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const file = join(dirname(fileURLToPath(import.meta.url)), '../mobile/app.json');
const part = process.argv[2];
if (!['major', 'minor', 'patch'].includes(part)) {
  console.error('Usage: node tools/bump-version.mjs <major|minor|patch>');
  process.exit(1);
}

const text = readFileSync(file, 'utf8');
const current = JSON.parse(text).expo.version;
const [major, minor, patch] = current.split('.').map(Number);
const next = {
  major: `${major + 1}.0.0`,
  minor: `${major}.${minor + 1}.0`,
  patch: `${major}.${minor}.${patch + 1}`,
}[part];

// A plain text swap, so the rest of app.json keeps its formatting.
writeFileSync(file, text.replace(`"version": "${current}"`, `"version": "${next}"`));
console.log(`${current} -> ${next}`);
