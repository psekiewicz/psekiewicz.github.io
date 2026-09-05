import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installWindow } from './helpers/browser-env.js';

installWindow('https://example.com');

const { escapeHtml, safeUrl, initials, pageId, timeAgo } = await import('../js/utils.js');

test('escapeHtml escapes all five XSS-relevant characters', () => {
  assert.equal(escapeHtml(`<img src=x onerror="alert(1)">'&`), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&#39;&amp;');
});

test('escapeHtml closes the stored-XSS hole described in its own comment', () => {
  // A title of `" onmouseover="…` must not be able to close the surrounding
  // attribute quote once escaped.
  const malicious = `" onmouseover="alert(1)`;
  const escaped = escapeHtml(malicious);
  assert.ok(!escaped.includes('"'), 'no raw double quote should survive escaping');
});

test('escapeHtml treats null/undefined as empty string', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
});

test('safeUrl accepts http(s) and rejects javascript: URLs', () => {
  assert.equal(safeUrl('https://example.com/a'), 'https://example.com/a');
  assert.equal(safeUrl('http://example.com'), 'http://example.com/');
  assert.equal(safeUrl('javascript:alert(1)'), '');
});

test('safeUrl rejects other dangerous or malformed schemes', () => {
  assert.equal(safeUrl('data:text/html,<script>alert(1)</script>'), '');
  assert.equal(safeUrl('vbscript:msgbox(1)'), '');
  assert.equal(safeUrl(''), '');
  assert.equal(safeUrl(null), '');
});

test('safeUrl resolves protocol-relative and root-relative URLs against window.origin', () => {
  assert.equal(safeUrl('//evil.example/x'), 'https://evil.example/x');
  assert.equal(safeUrl('/a/b'), 'https://example.com/a/b');
});

test('initials takes the first letter of up to two words, uppercased', () => {
  assert.equal(initials('ada lovelace'), 'AL');
  assert.equal(initials('Madonna'), 'M');
  assert.equal(initials('grace murray hopper'), 'GM');
});

test('initials falls back to "?" for empty input', () => {
  assert.equal(initials(''), '?');
  assert.equal(initials(null), '?');
  assert.equal(initials(undefined), '?');
});

test('pageId normalises paths, hrefs, query strings and hashes to a bare id', () => {
  assert.equal(pageId('scrolls.html'), 'scrolls');
  assert.equal(pageId('/scrolls'), 'scrolls');
  assert.equal(pageId('/scrolls/'), 'scrolls');
  assert.equal(pageId('/scrolls?x=1#y'), 'scrolls');
  assert.equal(pageId(''), 'index');
});

test('timeAgo buckets recent timestamps into just now/minutes/hours/days', () => {
  const now = Date.now();
  assert.equal(timeAgo(new Date(now).toISOString()), 'just now');
  assert.equal(timeAgo(new Date(now - 5 * 60_000).toISOString()), '5m ago');
  assert.equal(timeAgo(new Date(now - 3 * 3_600_000).toISOString()), '3h ago');
  assert.equal(timeAgo(new Date(now - 2 * 86_400_000).toISOString()), '2d ago');
});
