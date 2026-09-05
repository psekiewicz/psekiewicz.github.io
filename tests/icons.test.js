import { test } from 'node:test';
import assert from 'node:assert/strict';
import { icon } from '../js/icons.js';

test('icon renders a known name with the requested size and stroke width', () => {
  const svg = icon('heart', { size: 32, strokeWidth: 2 });
  assert.match(svg, /^<svg /);
  assert.match(svg, /width="32"/);
  assert.match(svg, /height="32"/);
  assert.match(svg, /stroke-width="2"/);
  assert.match(svg, /<path/);
});

test('icon defaults size to 20 and strokeWidth to 1.8', () => {
  const svg = icon('star');
  assert.match(svg, /width="20"/);
  assert.match(svg, /stroke-width="1.8"/);
});

test('icon appends an extra className when given one', () => {
  const svg = icon('bell', { className: 'audio-icon-play' });
  assert.match(svg, /class="icon audio-icon-play"/);
});

test('icon falls back to an empty body for an unknown name rather than throwing', () => {
  const svg = icon('does-not-exist');
  assert.match(svg, /^<svg /);
  assert.equal(/<path|<circle|<rect/.test(svg), false);
});
