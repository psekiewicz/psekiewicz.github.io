import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installWindow } from './helpers/browser-env.js';

installWindow('https://example.com');

const { scrollHint } = await import('../js/scroll-hint.js');

const words = (n) => Array.from({ length: n }, () => 'word').join(' ');

test('a long post is offered as a read, with its reading time', () => {
  assert.deepEqual(scrollHint({ description: words(600) }, null), { action: 'Read', meta: ['3 min read'] });
});

test('a caption-length post does not claim a reading time', () => {
  assert.deepEqual(scrollHint({ description: words(10) }, null), { action: 'Open', meta: [] });
});

test('video is watched, audio is listened to', () => {
  assert.equal(scrollHint({ description: '' }, { kind: 'video' }).action, 'Watch');
  assert.equal(scrollHint({ description: '' }, { kind: 'iframe', compact: false }).action, 'Watch');
  assert.equal(scrollHint({ description: '' }, { kind: 'iframe', compact: true }).action, 'Listen');
  assert.equal(scrollHint({ description: '' }, { kind: 'audio', compact: true }).action, 'Listen');
});

test('images in the body and links to a live demo or source are listed', () => {
  const hint = scrollHint(
    { description: `![a](https://x.test/a.png) ![b](https://x.test/b.png)`, liveUrl: 'https://x.test', repoUrl: 'https://g.test/r' },
    null,
  );
  assert.deepEqual(hint.meta, ['2 images', 'Live demo', 'Source code']);
});
