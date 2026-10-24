import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { siteRoute } from '../mobile/src/lib/siteRoutes.ts';

// The app keeps people inside it: a website link opens the matching screen
// (mobile/src/lib/siteRoutes.ts), anything else the in-app browser tab, and
// only mobile/src/lib/links.ts may hand a URL to the system.

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://psekiewicz.github.io';

test('website links open the matching app screen', () => {
  const cases = [
    ['/', { name: 'Tabs', params: { screen: 'Demos' } }],
    ['/index.html', { name: 'Tabs', params: { screen: 'Demos' } }],
    ['/project?id=p1', { name: 'ProjectDetail', params: { projectId: 'p1' } }],
    ['/project.html?id=p1', { name: 'ProjectDetail', params: { projectId: 'p1' } }],
    ['/profile?user=u1', { name: 'UserProfile', params: { userId: 'u1' } }],
    ['/news', { name: 'News' }],
    ['/weekly', { name: 'News' }],
    ['/newsletter?id=n1', { name: 'Newsletter', params: { newsletterId: 'n1' } }],
    ['/article?id=a1', { name: 'Article', params: { articleId: 'a1' } }],
    ['/issue?id=a1', { name: 'Article', params: { articleId: 'a1' } }],
    ['/leaderboard', { name: 'Tabs', params: { screen: 'Ranks' } }],
    ['/shop/', { name: 'Shop' }],
  ];
  for (const [page, route] of cases) assert.deepEqual(siteRoute(SITE + page), route, page);
});

test('other links are left to the in-app browser', () => {
  for (const url of [
    'https://example.com/project?id=p1',
    `${SITE}/legal/privacy.html`,
    `${SITE}/project`,
    `${SITE}/download/`,
    'mailto:someone@example.com',
    'not a url',
  ]) {
    assert.equal(siteRoute(url), null, url);
  }
});

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

test('nothing in the app opens a link except lib/links.ts', () => {
  const src = path.join(root, 'mobile/src');
  const offenders = sourceFiles(src)
    .filter((file) => path.relative(src, file) !== path.join('lib', 'links.ts'))
    .flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, i) => ({ line, at: `${path.relative(src, file)}:${i + 1}` }))
        .filter(({ line }) => /Linking\.openURL\(|openBrowserAsync\(/.test(line) && !line.trim().startsWith('//'))
        .map(({ at }) => at)
    );
  assert.deepEqual(offenders, [], 'use openLink / openInBrowserTab from lib/links.ts instead');
});
