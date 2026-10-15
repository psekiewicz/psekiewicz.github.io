import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installWindow } from './helpers/browser-env.js';

installWindow('https://example.com');

const { scrollHint } = await import('../js/scroll-hint.js');

const words = (n) => Array.from({ length: n }, () => 'word').join(' ');

test('a long post is offered as a read, with its reading time', () => {
  assert.deepEqual(scrollHint({ description: words(600) }, null), { action: 'Read', meta: ['3 min read'], href: '' });
});

test('a caption-length post does not claim a reading time', () => {
  assert.deepEqual(scrollHint({ description: words(10) }, null), { action: 'Open', meta: [], href: '' });
});

test('video is watched, audio is listened to', () => {
  assert.equal(scrollHint({ description: '' }, { kind: 'video' }).action, 'Watch');
  assert.equal(scrollHint({ description: '' }, { kind: 'iframe', compact: false }).action, 'Watch');
  assert.equal(scrollHint({ description: '' }, { kind: 'iframe', compact: true }).action, 'Listen');
  assert.equal(scrollHint({ description: '' }, { kind: 'audio', compact: true }).action, 'Listen');
});

test('images in the body and a link to the source are listed', () => {
  const hint = scrollHint(
    { description: `![a](https://x.test/a.png) ![b](https://x.test/b.png)`, repoUrl: 'https://g.test/r' },
    null,
  );
  assert.deepEqual(hint.meta, ['2 images', 'Source code']);
});

test('a live link makes the card a Try it that leaves for the project, ahead of reading or watching', () => {
  const live = 'https://app.example/x';
  assert.deepEqual(scrollHint({ description: words(600), liveUrl: live }, null), { action: 'Try it', meta: ['3 min read'], href: live });
  assert.equal(scrollHint({ description: '', liveUrl: live }, { kind: 'video' }).action, 'Try it');
});

test('a javascript: live link is not treated as something to try', () => {
  const hint = scrollHint({ description: '', liveUrl: 'javascript:alert(1)' }, null);
  assert.equal(hint.action, 'Open');
  assert.equal(hint.href, '');
});

test('the newest update leads the facts, with its version or "Updated"', () => {
  const at = new Date(Date.now() - 2 * 3_600_000).toISOString();
  assert.equal(scrollHint({ description: '' }, null, { version: 'v0.3', createdAt: at }).meta[0], 'v0.3 2h ago');
  assert.equal(scrollHint({ description: '' }, null, { version: '', createdAt: at }).meta[0], 'Updated 2h ago');
});
