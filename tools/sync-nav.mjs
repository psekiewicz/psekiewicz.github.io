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
  'age.html',
  'consent.html',
  'dashboard.html',
  'index.html',
  'leaderboard.html',
  'login.html',
  'profile.html',
  'project.html',
  'register.html',
  'settings.html',
  'shop.html',
  'news.html',
  'newsletter.html',
  'article.html',
  'download/index.html',
  // Written by tools/build-legal.mjs; listed so a nav change reaches them too.
  'legal/terms.html',
  'legal/privacy.html',
  'legal/guidelines.html',
];

// Order is the sidebar's order. Active state is set at runtime by js/nav.js,
// which compares each href to the current page.
const LINKS = [
  // XOXD is only demos, and they are the home page.
  { href: '/', label: 'Demos', icon: 'play-circle' },
  { href: '/news', label: 'News', icon: 'globe' },
  { href: '/leaderboard', label: 'Leaderboard', icon: 'award' },
  { href: '/shop', label: 'Shop', icon: 'shopping-bag' },
  { href: '/dashboard', label: 'Your work', icon: 'grid' },
];

const BRAND_MARK =
  '<svg class="brand-mark" width="32" height="32" viewBox="0 0 1503 1525" fill="currentColor" fill-rule="evenodd" aria-hidden="true"><path d="M4 1518C7 1514 54 1441 110 1354C165 1268 217 1188 224 1177L237 1157L235 1153C234 1151 184 1074 124 981C65 888 16 811 16 811C16 810 49 810 99 810L182 810L185 814C206 851 335 1066 336 1066C336 1067 369 1012 409 944C449 876 483 818 485 815L488 810L569 810C638 810 650 810 650 811C649 812 479 1082 433 1154L426 1165L448 1197C507 1284 667 1524 667 1524C667 1525 628 1525 581 1525L494 1525L412 1390C366 1316 328 1255 328 1255C328 1256 294 1312 197 1469L162 1525L81 1525L0 1525L4 1518ZM1088 1503C1003 1497 940 1478 885 1442C805 1388 755 1304 736 1190C728 1143 727 1114 727 967L727 860L1115 860L1503 860L1503 1005C1502 1160 1502 1157 1497 1191C1471 1370 1358 1482 1183 1500C1154 1504 1113 1505 1088 1503ZM1167 1330C1284 1319 1351 1261 1365 1158C1368 1141 1369 1116 1369 1069L1369 1025L1116 1025L863 1025L863 1063C863 1101 864 1125 866 1142C876 1220 911 1273 972 1304C1006 1321 1040 1329 1097 1332C1108 1333 1152 1332 1167 1330ZM1038 734C1036 734 1028 734 1021 733C858 719 757 621 732 454C724 396 724 323 734 268C759 117 850 26 996 4C1046 -3 1114 -1 1162 9C1294 36 1376 129 1400 276C1404 308 1406 322 1405 367C1405 420 1403 447 1394 485C1362 632 1267 717 1116 732C1102 734 1048 735 1038 734ZM2 722C3 721 56 638 120 538C229 369 237 357 236 355C214 322 16 12 16 12C16 11 54 11 99 11L182 11L259 138C301 209 336 266 336 266C336 267 370 210 412 140C453 70 486 12 487 12C487 11 524 11 569 11L650 12L539 187C478 284 428 363 427 364C427 365 471 431 545 543C610 640 664 721 666 722L667 725L581 725L494 725L414 593C369 521 332 460 330 458L328 455L246 590L162 725L81 725L0 725L2 722ZM1100 606C1190 592 1237 526 1246 405C1248 384 1247 329 1245 311C1234 214 1197 157 1132 136C1098 124 1051 123 1014 132C941 150 899 210 887 312C885 332 884 382 886 404C895 530 946 597 1042 607C1054 608 1088 607 1100 606Z"/></svg>';

const nav = `<nav class="navbar">
    <div class="container">
      <a class="brand" href="/" aria-label="XOXD">
        ${BRAND_MARK}
      </a>
      <div class="nav-links">
${LINKS.map(
  (l) => `        <a class="nav-link" href="${l.href}">${icon(l.icon, { size: 22 })}<span>${l.label}</span></a>`
).join('\n')}
      </div>
      <div class="nav-right">
        <div class="nav-actions" id="nav-actions"></div>
        <div class="nav-tools" id="nav-tools">
          <button class="theme-toggle" id="theme-toggle" type="button" aria-label="Toggle dark mode"></button>
        </div>
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
