import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installWindow } from './helpers/browser-env.js';

installWindow('https://example.com');

const { parseBlocks, renderMarkdown, stripMarkdown } = await import('../js/markdown.js');

test('plain text keeps its paragraphs and line breaks', () => {
  assert.equal(renderMarkdown('one\ntwo\n\nthree'), '<p>one<br>two</p><p>three</p>');
});

test('headings start one level below the page title', () => {
  assert.equal(renderMarkdown('# A\n## B\n### C'), '<h2>A</h2><h3>B</h3><h4>C</h4>');
});

test('bullet and numbered lists group consecutive items', () => {
  assert.deepEqual(parseBlocks('- a\n- b\n1. c\n2) d'), [
    { type: 'list', ordered: false, items: ['a', 'b'] },
    { type: 'list', ordered: true, items: ['c', 'd'] },
  ]);
});

test('a wrapped line continues the list item above it', () => {
  assert.equal(renderMarkdown('- first\n  more\n- second'), '<ul><li>first more</li><li>second</li></ul>');
});

test('bare URLs become links labelled with their site, without trailing punctuation', () => {
  assert.equal(
    renderMarkdown('See https://www.example.org/a/b.'),
    '<p>See <a href="https://www.example.org/a/b" target="_blank" rel="noopener noreferrer ugc">example.org</a>.</p>'
  );
});

test('inline bold, italic, code and [text](url)', () => {
  assert.equal(
    renderMarkdown('**b** *i* `c` [t](https://x.com)'),
    '<p><strong>b</strong> <em>i</em> <code>c</code> <a href="https://x.com/" target="_blank" rel="noopener noreferrer ugc">t</a></p>'
  );
});

test('bold and italic nest: italic made bold, bold made italic, and either inside the other', () => {
  for (const md of ['***both***', '**_both_**', '_**both**_', '*__both__*']) {
    assert.equal(renderMarkdown(md), '<p><strong><em>both</em></strong></p>', md);
  }
  assert.equal(renderMarkdown('**bold *it* bold**'), '<p><strong>bold </strong><strong><em>it</em></strong><strong> bold</strong></p>');
  assert.equal(renderMarkdown('*it **bold** it*'), '<p><em>it </em><strong><em>bold</em></strong><em> it</em></p>');
  assert.equal(renderMarkdown('__bold__'), '<p><strong>bold</strong></p>');
  assert.equal(renderMarkdown('a ** b ** c'), '<p>a ** b ** c</p>');
});

test('stray asterisks and snake_case are left alone', () => {
  assert.equal(renderMarkdown('2 * 3 * 4 and snake_case_name'), '<p>2 * 3 * 4 and snake_case_name</p>');
});

test('user HTML is escaped, never rendered', () => {
  const html = renderMarkdown('## <img src=x onerror=alert(1)>\n- [x](javascript:alert(1))');
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('href="javascript'));
});

test('stripMarkdown gives a plain one-line preview', () => {
  assert.equal(stripMarkdown('## Top\n- **One** https://a.com/x\n- Two'), 'Top · One a.com · Two');
});

test('a picture on its own line becomes a figure with its caption', () => {
  const html = renderMarkdown('Before\n\n![The new hub](https://a.com/p.jpg)\n\nAfter');
  assert.match(html, /<p>Before<\/p><figure class="post-figure"><a href="https:\/\/a.com\/p.jpg"[^>]*><img src="https:\/\/a.com\/p.jpg" alt="The new hub"/);
  assert.match(html, /<figcaption>The new hub<\/figcaption><\/figure><p>After<\/p>$/);
});

test('a picture directly under a line of text still breaks out of the paragraph', () => {
  assert.deepEqual(parseBlocks('text\n![](https://a.com/p.png)').map((b) => b.type), ['para', 'image']);
});

test('pictures only load from http(s) and are left out of previews', async () => {
  assert.equal(renderMarkdown('![x](javascript:alert(1))').includes('<img'), false);
  const { stripMarkdown, firstImage } = await import('../js/markdown.js');
  assert.equal(stripMarkdown('Hi\n\n![cap](https://a.com/p.png)'), 'Hi');
  assert.equal(firstImage('Hi\n\n![cap](https://a.com/p.png)'), 'https://a.com/p.png');
});

// Wikipedia-style addresses: the first ")" used to end the address, so the
// picture came out as a link followed by ".jpg)".
test('addresses with balanced parentheses stay whole', () => {
  const [image] = parseBlocks('![cap](https://upload.wikimedia.org/a/File_(1).jpg)');
  assert.deepEqual(image, { type: 'image', src: 'https://upload.wikimedia.org/a/File_(1).jpg', caption: 'cap' });
  assert.match(renderMarkdown('[wiki](https://en.wikipedia.org/wiki/Bach_(disambiguation)) ok'), /href="https:\/\/en\.wikipedia\.org\/wiki\/Bach_\(disambiguation\)"[^>]*>wiki<\/a> ok/);
  assert.match(renderMarkdown('see https://en.wikipedia.org/wiki/Bach_(disambiguation).'), /Bach_\(disambiguation\)" [^>]*>en\.wikipedia\.org<\/a>\.<\/p>/);
  assert.match(renderMarkdown('(see https://example.com/a)'), /href="https:\/\/example\.com\/a"/);
});
