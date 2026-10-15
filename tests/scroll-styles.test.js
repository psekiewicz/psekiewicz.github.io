import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installWindow } from './helpers/browser-env.js';

installWindow('https://example.com');

const { scrollImageFor } = await import('../js/scroll-styles.js');

const body = 'Intro\n\n![a chart](https://example.com/chart.png)\n\nMore text';

test('the full-screen card prefers its own image, then the cover, then the first picture in the post', () => {
  assert.equal(
    scrollImageFor({ scrollImageUrl: 'https://example.com/s.png', imageUrl: 'https://example.com/c.png', description: body }),
    'https://example.com/s.png',
  );
  assert.equal(
    scrollImageFor({ scrollImageUrl: '', imageUrl: 'https://example.com/c.png', description: body }),
    'https://example.com/c.png',
  );
  assert.equal(scrollImageFor({ scrollImageUrl: '', imageUrl: '', description: body }), 'https://example.com/chart.png');
});

test('a post with no picture anywhere gets no full-screen image, so the card falls back to its colour', () => {
  assert.equal(scrollImageFor({ scrollImageUrl: '', imageUrl: '', description: 'just words' }), '');
  assert.equal(scrollImageFor({ scrollImageUrl: '', imageUrl: '', description: '' }), '');
});
