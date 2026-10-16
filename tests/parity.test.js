// The site and the app each carry their own copy of the achievement list and
// the shop catalog (js/ and mobile/src/lib/), kept in step by hand. They had
// drifted: the app was two achievements short (Shipper and Maintainer), so
// nobody on a phone could see or claim them. This reads both copies as text -
// neither can be imported here, they pull in a Supabase client - and fails on
// any difference. tests/integration/rls.test.js holds them against the
// database's own tables too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseAchievements, parseRetiredAliases, parseShopItems } from './helpers/catalogs.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');

const webAchievements = parseAchievements(read('js/achievements.js'));
const appAchievements = parseAchievements(read('mobile/src/lib/achievements.ts'));

test('the parsers find the whole catalogs, not an empty list that trivially matches', () => {
  assert.ok(webAchievements.length >= 21, `found ${webAchievements.length} achievements`);
  assert.ok(parseShopItems(read('js/shop-items.js')).length >= 26);
  assert.ok(Object.keys(parseRetiredAliases(read('js/shop-items.js'))).length >= 30);
});

test('the app has the same achievements as the site, in the same order, with the same rule and reward', () => {
  assert.deepEqual(appAchievements, webAchievements);
});

test('the app sells the same items as the site, at the same prices', () => {
  assert.deepEqual(parseShopItems(read('mobile/src/lib/shopItems.ts')), parseShopItems(read('js/shop-items.js')));
});

test('retired shop items are drawn as the same replacement on both', () => {
  assert.deepEqual(parseRetiredAliases(read('mobile/src/lib/shopItems.ts')), parseRetiredAliases(read('js/shop-items.js')));
});
