import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installWindow } from './helpers/browser-env.js';

installWindow('https://example.com');

const { wrap, toggleHeading, toggleList, insertLink, insertImage } = await import('../js/format-toolbar.js');
const { parseBlocks } = await import('../js/markdown.js');

test('wrap bolds the selection, and unwraps it on a second press', () => {
  const once = wrap('say hi now', 4, 6, 'bold');
  assert.deepEqual(once, { value: 'say **hi** now', start: 6, end: 8 });
  assert.deepEqual(wrap(once.value, once.start, once.end, 'bold'), { value: 'say hi now', start: 4, end: 6 });
});

test('wrap with nothing selected inserts a selected placeholder', () => {
  const r = wrap('', 0, 0, 'italic');
  assert.equal(r.value, '*italic text*');
  assert.equal(r.value.slice(r.start, r.end), 'italic text');
});

test('toggleHeading cycles the line through ## and ### to plain', () => {
  let r = toggleHeading('a\nNews\nb', 3, 3);
  assert.equal(r.value, 'a\n## News\nb');
  r = toggleHeading(r.value, r.start, r.end);
  assert.equal(r.value, 'a\n### News\nb');
  r = toggleHeading(r.value, r.start, r.end);
  assert.equal(r.value, 'a\nNews\nb');
});

test('toggleList numbers every selected line, and removes the markers again', () => {
  const r = toggleList('one\ntwo', 0, 7, true);
  assert.equal(r.value, '1. one\n2. two');
  assert.equal(toggleList(r.value, r.start, r.end, true).value, 'one\ntwo');
  assert.equal(toggleList('one', 0, 0, false).value, '- one');
});

test('insertLink uses the selection as the link text', () => {
  assert.equal(insertLink('read this', 5, 9, 'https://a.com/').value, 'read [this](https://a.com/)');
});

test('insertImage puts the picture on its own block mid-article', () => {
  const r = insertImage('Intro text. More text.', 11, 11, 'https://a.com/p.jpg', 'A caption');
  assert.equal(r.value, 'Intro text.\n\n![A caption](https://a.com/p.jpg)\n\nMore text.');
  assert.deepEqual(parseBlocks(r.value).map((b) => b.type), ['para', 'image', 'para']);
});
