import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installWindow } from './helpers/browser-env.js';

installWindow('https://example.com');

const { postBuildHtml } = await import('../js/post-card.js');

const base = { id: 'p1', liveUrl: '', repoUrl: '' };

test('a plain post gets no build row', () => {
  assert.equal(postBuildHtml(base, null), '');
});

test('a live link becomes Try it and a repo becomes Source, both opening safely in a new tab', () => {
  const html = postBuildHtml({ ...base, liveUrl: 'https://app.example/x', repoUrl: 'https://github.com/a/b' }, null);
  assert.match(html, />\s*<i[^>]*><\/i>\s*Try it</);
  assert.match(html, /Source/);
  assert.match(html, /href="https:\/\/app\.example\/x"/);
  assert.equal((html.match(/rel="noopener noreferrer"/g) || []).length, 2);
});

test('a javascript: link is never offered', () => {
  const html = postBuildHtml({ ...base, liveUrl: 'javascript:alert(1)' }, null);
  assert.equal(html, '');
});

test('the latest update shows its version, falling back to "Update"', () => {
  const at = new Date().toISOString();
  assert.match(postBuildHtml(base, { version: 'v0.3', createdAt: at }), /v0\.3/);
  assert.match(postBuildHtml(base, { version: '', createdAt: at }), />Update</);
});

test('an update body or version cannot inject markup', () => {
  const html = postBuildHtml(base, { version: '<img src=x onerror=alert(1)>', createdAt: new Date().toISOString() });
  assert.ok(!html.includes('<img'));
});
