import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The app's update module (mobile/src/features/app-update) has to come out of
// a Google Play build in one step: tools/remove-app-update.mjs deletes the
// folder and every line marked `app-update`. This runs it on a copy of
// mobile/src and checks nothing is left pointing at the module - which fails
// as soon as someone uses it from a line without the marker.

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

test('the app-update module can be removed without leaving anything that uses it', () => {
  const copy = mkdtempSync(path.join(tmpdir(), 'app-update-'));
  try {
    cpSync(path.join(root, 'mobile/src'), copy, { recursive: true });
    execFileSync('node', [path.join(root, 'tools/remove-app-update.mjs'), '--src', copy], { stdio: 'pipe' });

    const leftovers = sourceFiles(copy).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, i) => ({ line, at: `${path.relative(copy, file)}:${i + 1}` }))
        .filter(({ line }) => /features\/app-update|\bUpdateScreen\b|\bUpdateSettingsLink\b|['"]AppUpdate['"]/.test(line))
        .map(({ at, line }) => `${at}  ${line.trim()}`)
    );
    assert.deepEqual(leftovers, [], 'these lines use the module but lack the `app-update` marker');
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
});
