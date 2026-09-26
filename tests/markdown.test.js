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
