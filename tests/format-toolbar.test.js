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

test('bold on italic, and italic on bold, make bold italic; each press undoes its own', () => {
  const italic = wrap('say hi now', 4, 6, 'italic');
  const both = wrap(italic.value, italic.start, italic.end, 'bold');
  assert.equal(both.value, 'say ***hi*** now');
  assert.equal(wrap(both.value, both.start, both.end, 'bold').value, 'say *hi* now');
  assert.equal(wrap(both.value, both.start, both.end, 'italic').value, 'say **hi** now');

  const bold = wrap('say hi now', 4, 6, 'bold');
  assert.equal(wrap(bold.value, bold.start, bold.end, 'italic').value, 'say ***hi*** now');
  // Italic on **bold** doesn't eat one of its asterisks.
  assert.notEqual(wrap(bold.value, bold.start, bold.end, 'italic').value, 'say *hi* now');
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

test('inserted pictures and links survive spaces and parentheses in the address', () => {
  const picture = insertImage('', 0, 0, 'https://example.com/a b (1).jpg');
  const [block] = parseBlocks(picture.value);
  assert.equal(block.type, 'image');
  assert.equal(block.src, 'https://example.com/a%20b%20%281%29.jpg');
  assert.equal(insertLink('x', 0, 1, 'https://example.com/a)b').value, '[x](https://example.com/a%29b)');
});
