// Writes the one shared navigation into every page.
//
// The site is plain HTML with no build step, so the navbar is copied into each
// page - and the copies had drifted (some pages were missing links, one had a
// different set). This regenerates all of them from a single definition, with
// the icons baked in from js/icons.js so nothing pops in after load.
//
//   node tools/sync-nav.mjs
//
// Re-run it after changing LINKS below or adding a page.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { icon } from '../js/icons.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const PAGES = [
  '404.html',
  'admin.html',
  'dashboard.html',
  'index.html',
  'leaderboard.html',
  'login.html',
  'profile.html',
  'project.html',
  'projects.html',
  'register.html',
  'scrolls.html',
  'settings.html',
  'shop.html',
  'download/index.html',
];

// Order is the sidebar's order. Active state is set at runtime by js/nav.js,
// which compares each href to the current page.
const LINKS = [
  { href: '/index.html', label: 'Home', icon: 'home' },
  { href: '/projects.html', label: 'Explore', icon: 'search' },
  { href: '/scrolls', label: 'Scrolls', icon: 'film' },
  { href: '/leaderboard.html', label: 'Leaderboard', icon: 'award' },
  { href: '/shop', label: 'Shop', icon: 'shopping-bag' },
  { href: '/dashboard.html', label: 'Dashboard', icon: 'grid' },
];

const BRAND_MARK =
  '<svg class="brand-mark" width="28" height="28" viewBox="0 0 26 26" fill="none" aria-hidden="true"><polygon points="3,3 8.5,3 16.5,13 8.5,23 3,23 11,13" fill="var(--color-brand-orange)"/><polygon points="11.5,3 17,3 25,13 17,23 11.5,23 19.5,13" fill="var(--color-brand-blue)"/></svg>';

const nav = `<nav class="navbar">
    <div class="container">
      <a class="brand" href="/index.html">
        ${BRAND_MARK}
        <span class="brand-name">Showcase</span>
      </a>
      <div class="nav-links">
${LINKS.map(
  (l) => `        <a class="nav-link" href="${l.href}">${icon(l.icon, { size: 22 })}<span>${l.label}</span></a>`
).join('\n')}
      </div>
      <div class="nav-right">
        <button class="theme-toggle" id="theme-toggle" type="button" aria-label="Toggle dark mode"></button>
        <div class="nav-actions" id="nav-actions"></div>
      </div>
      <button class="nav-toggle" aria-label="Toggle menu" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
    </div>
  </nav>`;

let changed = 0;
for (const page of PAGES) {
  const path = join(root, page);
  const raw = readFileSync(path, 'utf8');
  const crlf = raw.includes('\r\n');
  const text = raw.replace(/\r\n/g, '\n');
  const match = text.match(/<nav class="navbar">[\s\S]*?<\/nav>/);
  if (!match) throw new Error(`${page}: no <nav class="navbar"> block found`);
  const next = text.replace(match[0], nav);
  if (next !== text) {
    writeFileSync(path, crlf ? next.replace(/\n/g, '\r\n') : next);
    changed++;
  }
}
console.log(`navbar synced: ${changed} of ${PAGES.length} pages changed`);
