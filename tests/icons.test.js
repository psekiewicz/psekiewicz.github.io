import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { icon } from '../js/icons.js';

test('icon renders an empty masked element with the requested size', () => {
  const html = icon('heart', { size: 32 });
  assert.match(html, /^<i class="icon" data-icon="heart"/);
  assert.match(html, /width:32px;height:32px/);
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /><\/i>$/);
});

test('icon defaults the size to 20', () => {
  assert.match(icon('star'), /width:20px;height:20px/);
});

test('icon appends an extra className when given one', () => {
  assert.match(icon('bell', { className: 'audio-icon-play' }), /class="icon audio-icon-play"/);
});

test('icon keeps a name from breaking out of its attribute', () => {
  const html = icon('x" onload="alert(1)');
  assert.equal(html.includes('onload'), true); // the letters survive...
  assert.equal(/data-icon="[^"]*"[^>]*onload/.test(html), false); // ...but never as an attribute
});

test('every icon the code asks for has a file, and the stylesheet knows it', () => {
  const css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
  const used = new Set();
  for (const file of ['../js/bottom-nav.js', '../js/nav.js', '../js/post-card.js', '../js/media.js', '../js/create-sheet.js']) {
    const src = readFileSync(new URL(file, import.meta.url), 'utf8');
    for (const m of src.matchAll(/icon\('([a-z0-9-]+)'/g)) used.add(m[1]);
  }
  assert.ok(used.size > 5, 'found the icons the code uses');
  for (const name of used) {
    assert.ok(existsSync(new URL(`../assets/icons/${name}.svg`, import.meta.url)), `assets/icons/${name}.svg exists`);
    assert.ok(css.includes(`.icon[data-icon='${name}']`), `the stylesheet has a rule for ${name}`);
  }
});

test('the filled twins exist for the icons that have an on state', () => {
  for (const name of ['heart', 'bookmark', 'star']) {
    assert.ok(existsSync(new URL(`../assets/icons/${name}-filled.svg`, import.meta.url)), `${name}-filled.svg exists`);
  }
});

test('the lock carries its keyhole dot', () => {
  const svg = readFileSync(new URL('../assets/icons/lock.svg', import.meta.url), 'utf8');
  assert.match(svg, /M12 16h\.01/);
});

test('the shapes written for the app keep their attributes (a line needs its coordinates)', () => {
  const src = readFileSync(new URL('../mobile/src/components/iconShapes.ts', import.meta.url), 'utf8');
  assert.equal(/\{\s*\}/.test(src), false, 'no element is left without attributes');
  for (const m of src.matchAll(/"line",\s*\{([^}]*)\}/g)) {
    for (const key of ['x1', 'y1', 'x2', 'y2']) assert.ok(m[1].includes(`"${key}"`), `a line has ${key}`);
  }
  assert.match(src, /"lock":/);
});
