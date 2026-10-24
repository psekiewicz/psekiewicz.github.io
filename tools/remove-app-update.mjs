// Takes the app-update module out of the mobile app - for a Google Play build,
// which may only be updated through Play (see
// mobile/src/features/app-update/README.md).
//
//   node tools/remove-app-update.mjs
//   cd mobile && npx tsc --noEmit -p .
//
// It deletes mobile/src/features/app-update and every line elsewhere in
// mobile/src that carries the `app-update` marker - the module's imports and
// the places it's used. `--src <dir>` points it at another copy of mobile/src
// (the test does that).
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const flag = process.argv.indexOf('--src');
const src = flag > -1 ? process.argv[flag + 1] : join(root, 'mobile/src');
const moduleDir = join(src, 'features/app-update');

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

if (existsSync(moduleDir)) {
  rmSync(moduleDir, { recursive: true });
  console.log(`removed ${relative(src, moduleDir)}/`);
}
const featuresDir = join(src, 'features');
if (existsSync(featuresDir) && readdirSync(featuresDir).length === 0) rmSync(featuresDir, { recursive: true });

for (const file of sourceFiles(src)) {
  const lines = readFileSync(file, 'utf8').split('\n');
  const kept = lines.filter((line) => !line.includes('app-update'));
  if (kept.length !== lines.length) {
    writeFileSync(file, kept.join('\n'));
    console.log(`${relative(src, file)}: removed ${lines.length - kept.length} line(s)`);
  }
}
