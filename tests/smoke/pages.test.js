// Loads every page of the site in a real browser, signed out and signed in,
// and fails on anything that goes wrong while it does: an uncaught exception,
// an error in the console, or a file of our own that does not load.
//
// The pages' logic lives in inline <script type="module"> blocks and modules
// that no unit test imports - project.html alone carries 24 KB of it - so a
// mistyped import path or a renamed export blanked a page while every other
// check stayed green. This is the check for that.
//
// Nothing here touches the real Supabase project. The site is served from
// this checkout the way GitHub Pages serves it, and the pinned esm.sh client
// is answered with tests/smoke/fake-supabase.js, which keeps a small database
// in memory. Every other outside request gets an empty answer, so a page
// cannot depend on the network to pass.
//
//   npm run test:smoke
//
// Needs Chromium: `npx playwright-core install chromium` once, or set
// SMOKE_CHROMIUM to an existing binary.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// The client the site imports, read from the one place that names it, so a
// version bump there can never quietly stop this test from faking it.
const SUPABASE_URL = readFileSync(path.join(root, 'js/supabase-init.js'), 'utf8').match(
  /from '(https:\/\/esm\.sh\/@supabase\/supabase-js@[^']+)'/,
)[1];
const FAKE_SUPABASE = readFileSync(path.join(root, 'tests/smoke/fake-supabase.js'), 'utf8');
const { SMOKE_IDS } = await import('./fake-supabase.js');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
};

// GitHub Pages' rules: a directory serves its index.html, a path with no
// extension serves the .html file of that name (the nav links to /demos and
// /shop), and anything else missing gets 404.html with a 404.
function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  const candidates = [clean, path.join(clean, 'index.html'), `${clean}.html`];
  for (const candidate of candidates) {
    const file = path.join(root, candidate);
    if (file.startsWith(root) && existsSync(file) && statSync(file).isFile()) return file;
  }
  return null;
}

let server;
let origin;
let browser;

before(async () => {
  server = createServer((req, res) => {
    const file = resolveFile(new URL(req.url, 'http://x').pathname);
    if (!file) {
      res.writeHead(404, { 'content-type': TYPES['.html'] });
      res.end(readFileSync(path.join(root, '404.html')));
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.SMOKE_CHROMIUM || undefined });
});

after(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
});

// Every page in the repository, found rather than listed, so a new page is
// covered without anyone remembering to add it. The app and the tests are
// not part of the site.
function sitePages(dir = root, prefix = '') {
  return readdirSync(dir).flatMap((name) => {
    if (['node_modules', 'mobile', 'tests', '.git', '.github', 'supabase', 'tools'].includes(name)) return [];
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sitePages(full, `${prefix}${name}/`);
    return name.endsWith('.html') ? [`/${prefix}${name}`] : [];
  });
}

// Pages that show one thing get one to show.
const QUERY = {
  '/project.html': `?id=${SMOKE_IDS.P1}`,
  '/profile.html': `?user=${SMOKE_IDS.GRACE}`,
  '/consent.html': `?token=${'a'.repeat(64)}`,
  '/newsletter.html': `?id=${SMOKE_IDS.I1}`,
  '/issue.html': `?id=${SMOKE_IDS.A1}`,
  '/article.html': `?id=${SMOKE_IDS.A1}`,
};

const SIGNED_IN = {
  id: SMOKE_IDS.ADA,
  email: 'ada@example.com',
  user_metadata: { display_name: 'Ada' },
  app_metadata: {},
  aud: 'authenticated',
  created_at: new Date(Date.now() - 90 * 86_400_000).toISOString(),
};

// A 1x1 transparent PNG, for any picture the page asks the outside world for.
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

async function visit(pagePath, user) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  const problems = [];

  await page.addInitScript((u) => {
    window.__SMOKE_USER__ = u;
  }, user);

  await page.route('**/*', (route) => {
    const request = route.request();
    const url = request.url();
    if (url.startsWith(origin)) return route.continue();
    if (url === SUPABASE_URL) {
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' },
        body: FAKE_SUPABASE,
      });
    }
    if (request.resourceType() === 'image') {
      return route.fulfill({ status: 200, headers: { 'content-type': 'image/png' }, body: PIXEL });
    }
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, body: '' });
  });

  page.on('pageerror', (err) => problems.push(`uncaught: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`console.error: ${msg.text()}`);
  });
  page.on('response', (res) => {
    // A page asking for a file of ours that is not there.
    if (res.url().startsWith(origin) && res.status() >= 400 && !res.url().includes('/does-not-exist')) {
      problems.push(`${res.status()} ${res.url().slice(origin.length)}`);
    }
  });
  page.on('requestfailed', (req) => {
    if (req.url().startsWith(origin)) problems.push(`failed: ${req.url().slice(origin.length)}`);
  });

  await page.goto(origin + pagePath + (QUERY[pagePath] || ''), { waitUntil: 'load' });
  // The data arrives after load; give the page's own requests time to land
  // and draw before deciding it is fine.
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(400);

  const finalPath = new URL(page.url()).pathname;
  const bodyText = (await page.locator('body').innerText().catch(() => '')).trim();
  await context.close();
  return { problems, finalPath, bodyText };
}

const pages = sitePages();

test('every page of the site is found', () => {
  // A broken walk would make every check below pass by checking nothing.
  assert.ok(pages.length >= 20, `found only ${pages.length} pages`);
  assert.ok(pages.includes('/index.html') && pages.includes('/project.html'));
});

for (const pagePath of pages) {
  for (const [state, user] of [
    ['signed out', null],
    ['signed in', SIGNED_IN],
  ]) {
    test(`${pagePath} loads cleanly (${state})`, async () => {
      const { problems, bodyText } = await visit(pagePath, user);
      assert.deepEqual(problems, [], `${pagePath} (${state}):\n  ${problems.join('\n  ')}`);
      assert.ok(bodyText.length > 0, `${pagePath} (${state}) drew nothing`);
      // Most pages catch their own failures and print "Could not load ..."
      // instead of throwing, which the checks above would never see.
      const shown = bodyText.match(/Could not load[^\n]*/);
      assert.equal(shown, null, `${pagePath} (${state}) shows: ${shown && shown[0]}`);
    });
  }
}

test('a missing page gets the 404 page', async () => {
  const { problems, bodyText } = await visit('/does-not-exist', null);
  // The browser logs the document's own 404; that one is the point.
  assert.deepEqual(problems.filter((p) => !/status of 404/.test(p)), []);
  assert.match(bodyText, /404|not found/i);
});

// A page with the fake client in place, for the checks below that look at
// what a page draws rather than only at what went wrong.
async function open(pagePath, user) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.addInitScript((u) => {
    window.__SMOKE_USER__ = u;
  }, user);
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url === SUPABASE_URL) {
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' },
        body: FAKE_SUPABASE,
      });
    }
    return url.startsWith(origin) ? route.continue() : route.fulfill({ status: 200, body: '' });
  });
  await page.goto(origin + pagePath);
  return { page, context };
}

// XOXD is only demos: the home page is the Demos feed, and an entry without a
// live link (Trail Map) appears nowhere public.
test('the home page is the demos, and only entries with a live link are on it', async () => {
  const { page, context } = await open('/', SIGNED_IN);
  await page.locator('.demo-card').first().waitFor({ timeout: 10_000 });
  const text = await page.locator('#demos-root').innerText();
  assert.match(text, /Pocket Synth/);
  assert.doesNotMatch(text, /Trail Map/);
  assert.equal(await page.locator('.demo-card', { hasText: 'Pocket Synth' }).locator('text=Try it').count(), 1);
  await context.close();
});

test('the leaderboard ranks accounts by XP from the server', async () => {
  const { page, context } = await open('/leaderboard.html', null);
  await page.locator('.leaderboard-row').first().waitFor({ timeout: 10_000 });
  const names = await page.locator('.leaderboard-name').allInnerTexts();
  // Grace has more XP than Ada in the fake database.
  assert.deepEqual(names.map((n) => n.trim().split('\n')[0]), ['Grace', 'Ada']);
  await context.close();
});

test('the old Demos and Explore addresses forward to the home page', async () => {
  // The home page writes the card on screen into the #, so only a link to one
  // demo can say which: it keeps its #id, which puts that demo first.
  for (const [from, hash] of [
    [`/demos#${SMOKE_IDS.P1}`, `#${SMOKE_IDS.P1}`],
    ['/projects?tag=synth', null],
  ]) {
    const { page, context } = await open(from, null);
    await page.waitForURL((url) => url.pathname === '/', { timeout: 10_000 });
    if (hash) assert.equal(new URL(page.url()).hash, hash, from);
    await context.close();
  }
});

test("a profile lists only that person's demos", async () => {
  const { page, context } = await open(`/profile?user=${SMOKE_IDS.GRACE}`, null);
  await page.locator('.tile-grid .tile').first().waitFor({ timeout: 10_000 });
  assert.deepEqual(await page.locator('.tile-title').allInnerTexts(), ['Pocket Synth']);
  await context.close();
  // Ada's only published entry has no live link, so there is nothing to show.
  const ada = await open(`/profile?user=${SMOKE_IDS.ADA}`, null);
  await ada.page.locator('text=No demos yet').waitFor({ timeout: 10_000 });
  await ada.context.close();
});

test('the bell names the new notification types', async () => {
  const { page, context } = await open('/index.html', SIGNED_IN);
  await page.locator('#notif-bell').click();
  await page.locator('.notif-item').first().waitFor({ timeout: 10_000 });
  const text = (await page.locator('#notif-list').innerText()).replace(/\s+/g, ' ');
  assert.match(text, /Grace published Pocket Synth/);
  assert.match(text, /Grace posted an update to Pocket Synth/);
  assert.doesNotMatch(text, /undefined/);
  await context.close();
});

// Links use clean URLs - /projects, /project?id=..., / for home - which
// GitHub Pages answers with the .html file of that name. The site had slid
// back to linking *.html in most places, so this holds every link to it, and
// to a page that exists.
test('internal links use clean URLs and lead to real pages', () => {
  const sources = [
    ...pages.map((p) => p.slice(1)),
    ...readdirSync(path.join(root, 'js')).map((name) => `js/${name}`),
  ];
  const problems = [];
  for (const file of sources) {
    const text = readFileSync(path.join(root, file), 'utf8');
    for (const [, href] of text.matchAll(/href=["'`](\/[^"'`\s$]*)/g)) {
      const target = href.split(/[?#]/)[0];
      if (target.startsWith('/zarolke') || target.startsWith('/przewodnik')) continue;
      if (/\.html$/.test(target)) problems.push(`${file}: ${href} (drop the .html)`);
      else if (!resolveFile(target)) problems.push(`${file}: ${href} (no such page)`);
    }
  }
  assert.ok(sources.length > 40, `checked only ${sources.length} files`);
  assert.deepEqual(problems, []);
});

// The age gate sends an account with no date of birth to /age and must leave
// it there. It used to recognise only /age.html, so with clean URLs /age
// would have sent itself to itself for ever.
test('the age gate leads to /age once, and lets it be', async () => {
  const noAge = { ...SIGNED_IN, id: '00000000-0000-4000-8000-0000000000aa' };
  const { page, context } = await open('/projects', noAge);
  let navigations = 0;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations++;
  });
  await page.waitForURL(/\/age\?next=/, { timeout: 10_000 });
  await page.waitForTimeout(1500);
  assert.equal(new URL(page.url()).pathname, '/age');
  assert.ok(navigations <= 1, `navigated ${navigations} times`);
  await context.close();
});

// Where the link in a sign-up confirmation email lands (emailRedirectTo in
// js/auth.js). The link signs the new account in, so the page says the email
// is confirmed and moves on; a stale link says why it did nothing.
test('a confirmation link that signed you in says so, then opens the dashboard', async () => {
  const { page, context } = await open('/login?confirmed=1', SIGNED_IN);
  await page.locator('#form-success', { hasText: 'confirmed' }).waitFor({ timeout: 10_000 });
  await page.waitForURL(/\/dashboard$/, { timeout: 10_000 });
  await context.close();
});

test('a confirmation without a session asks you to log in', async () => {
  const { page, context } = await open('/login?confirmed=1', null);
  await page.locator('#form-success', { hasText: 'Log in to continue' }).waitFor({ timeout: 10_000 });
  await page.waitForTimeout(500);
  assert.equal(new URL(page.url()).pathname, '/login');
  await context.close();
});

test('an expired confirmation link explains itself', async () => {
  const hash = '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired';
  const { page, context } = await open(`/login?confirmed=1${hash}`, null);
  await page.locator('#form-alert', { hasText: 'invalid or has expired' }).waitFor({ timeout: 10_000 });
  await context.close();
});

// A password-reset link signs you in. The login page used to treat that like
// any signed-in visit and go straight to the dashboard, so the password was
// never actually changed.
test('a password-reset link asks for the new password before anything else', async () => {
  const { page, context } = await open('/login?reset=1', SIGNED_IN);
  await page.locator('#reset-form').waitFor({ state: 'visible', timeout: 10_000 });
  assert.equal(await page.locator('#login-form').isVisible(), false);
  await page.waitForTimeout(500);
  assert.equal(new URL(page.url()).pathname, '/login', 'left the page before the password was set');
  await page.locator('#new-password').fill('a-new-password');
  await page.locator('#confirm-password').fill('a-new-password');
  await page.locator('#reset-btn').click();
  await page.locator('#form-success', { hasText: 'password is changed' }).waitFor({ timeout: 10_000 });
  await page.waitForURL(/\/dashboard$/, { timeout: 10_000 });
  await context.close();
});

test('a reset link from an older email (login.html, type=recovery) is caught too', async () => {
  const { page, context } = await open('/login.html#access_token=x&type=recovery', SIGNED_IN);
  await page.locator('#reset-form').waitFor({ state: 'visible', timeout: 10_000 });
  await context.close();
});

test('a reset link that signed nobody in says what to do', async () => {
  const { page, context } = await open('/login?reset=1', null);
  await page.locator('#form-alert', { hasText: 'did not sign you in' }).waitFor({ timeout: 10_000 });
  assert.equal(await page.locator('#reset-form').isVisible(), false);
  await context.close();
});

// A picture whose link isn't an image (a page that shows one, say) used to
// vanish from the preview without a word, which read as the editor failing.
test('the editor preview explains a picture that did not load; a post just hides it', async () => {
  const { page, context } = await open('/index.html', null);
  const state = await page.evaluate(async () => {
    const { attachFormatToolbar } = await import('/js/format-toolbar.js');
    const { renderMarkdown } = await import('/js/markdown.js');
    const md = '![cat](https://example.com/not-a-picture)';
    const textarea = document.createElement('textarea');
    textarea.value = md;
    document.body.append(textarea);
    attachFormatToolbar(textarea);
    document.querySelector('.fmt-tab[data-mode="preview"]').click();
    const post = document.createElement('div');
    post.className = 'detail-body';
    post.innerHTML = renderMarkdown(md);
    document.body.append(post);
    const figures = () => [...document.querySelectorAll('.post-figure')];
    for (let i = 0; i < 50 && !figures().every((f) => f.classList.contains('is-broken')); i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    const [inPreview, onPost] = figures();
    return {
      broken: figures().map((f) => f.classList.contains('is-broken')),
      previewShown: getComputedStyle(inPreview).display !== 'none',
      previewNote: getComputedStyle(inPreview, '::before').content,
      postShown: getComputedStyle(onPost).display !== 'none',
    };
  });
  assert.deepEqual(state.broken, [true, true]);
  assert.equal(state.previewShown, true);
  assert.match(state.previewNote, /didn't load/);
  assert.equal(state.postShown, false);
  await context.close();
});

// The upload policy also requires consent_ok() - a date of birth, and for a
// 13-15 year old a parent's say-so. Storage's refusal ("new row violates
// row-level security policy") used to be reported as the 300-file limit, and
// only after the file had been compressed. Two real accounts had no date.
async function tryUpload(user) {
  const { page, context } = await open('/index.html', user);
  const outcome = await page.evaluate(async () => {
    const { uploadMedia } = await import('/js/uploads-data.js');
    const canvas = Object.assign(document.createElement('canvas'), { width: 8, height: 8 });
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    try {
      const result = await uploadMedia(new File([blob], 'dot.png', { type: 'image/png' }), { kind: 'cover' });
      return { url: result.url };
    } catch (err) {
      return { error: err.message };
    }
  });
  await context.close();
  return outcome;
}

test('an upload from an account without a date of birth says to add one', async () => {
  const outcome = await tryUpload({ ...SIGNED_IN, id: '00000000-0000-4000-8000-0000000000aa' });
  assert.match(outcome.error || '', /date of birth/);
});

test('an upload from an account that passed the age check goes through', async () => {
  const outcome = await tryUpload(SIGNED_IN);
  assert.equal(outcome.error, undefined);
  assert.match(outcome.url, /\/uploads\//);
});

// Publishing needs a live link (XOXD shows only demos), and the type list is
// the one the database accepts: it used to offer Website, Game and the like,
// which failed on save with a check-constraint error.
test('the dashboard keeps an entry without a live link a draft, and offers only valid types', async () => {
  const { page, context } = await open('/dashboard', SIGNED_IN);
  await page.locator('#new-project-btn').click();
  const types = await page.locator('#type option').evaluateAll((options) => options.map((o) => o.value));
  assert.deepEqual(types.sort(), ['app', 'image', 'music', 'other', 'video']);
  await page.locator('#title').fill('No link yet');
  await page.locator('#published').check();
  await page.locator('#modal-submit-btn').click();
  await page.locator('#modal-alert', { hasText: 'needs a live link' }).waitFor({ timeout: 10_000 });
  await context.close();
});

// News: newsletters anyone reads, articles inside them, each reader's own
// read marks, and controls only for news editors (Ada is one in the fake
// database; Grace isn't, and has read the older T&G article).
const GRACE_SIGNED_IN = { ...SIGNED_IN, id: SMOKE_IDS.GRACE, user_metadata: { display_name: 'Grace' } };

test('News lists the newsletters with what is new to the reader; anyone signed in can start one, an editor also sees drafts', async () => {
  const out = await open('/news', null);
  await out.page.locator('.news-letter-card').first().waitFor({ timeout: 10_000 });
  assert.deepEqual(await out.page.locator('.news-letter-title').allInnerTexts(), ['XOXD T&G Weekly']);
  assert.match(await out.page.locator('.news-letter-card').first().innerText(), /2 articles[\s\S]*2 new/i);
  assert.equal(await out.page.locator('#new-letter-btn').count(), 0);
  await out.context.close();

  // Grace isn't in the newsroom: starting one would cost her 500 points,
  // and she has 120, so the form says so and won't submit.
  const grace = await open('/news', GRACE_SIGNED_IN);
  await grace.page.locator('.news-letter-card').first().waitFor({ timeout: 10_000 });
  assert.match(await grace.page.locator('.news-letter-card').first().innerText(), /1 new/i);
  await grace.page.locator('#new-letter-btn').click();
  await grace.page.locator('.news-terms').waitFor({ timeout: 10_000 });
  assert.match(await grace.page.locator('.news-terms').innerText(), /costs 500 points - you have 120/);
  assert.equal(await grace.page.locator('.modal-overlay button[type="submit"]').isDisabled(), true);
  await grace.context.close();

  const editor = await open('/news', SIGNED_IN);
  await editor.page.locator('#new-letter-btn').waitFor({ timeout: 10_000 });
  assert.equal(await editor.page.locator('.news-letter-card').count(), 3);
  await editor.page.locator('#new-letter-btn').click();
  await editor.page.locator('#nl-title').fill('Indie Picks');
  await editor.page.locator('.modal-overlay button[type="submit"]').click();
  await editor.page.waitForURL(/\/newsletter\?id=/, { timeout: 10_000 });
  await editor.context.close();
});

test('a newsletter lists every article newest first, each marked read or new, with editing only for editors', async () => {
  const reader = await open(`/newsletter?id=${SMOKE_IDS.I1}`, GRACE_SIGNED_IN);
  await reader.page.locator('.news-article-card').first().waitFor({ timeout: 10_000 });
  assert.deepEqual(await reader.page.locator('.news-article-title').allInnerTexts(), [
    'XOXD T&G Weekly - 17-24 Oct 2026',
    'XOXD T&G Weekly - 10-17 Oct 2026',
  ]);
  const cards = reader.page.locator('.news-article-card');
  assert.match(await cards.nth(0).innerText(), /^\s*new\b/i);
  assert.match(await cards.nth(1).innerText(), /^\s*read\b/i);
  assert.equal(await cards.nth(1).evaluate((el) => el.classList.contains('is-read')), true);
  assert.equal(await reader.page.locator('#add-article').count(), 0);
  await reader.context.close();

  const editor = await open(`/newsletter?id=${SMOKE_IDS.I1}`, SIGNED_IN);
  await editor.page.locator('#add-article').waitFor({ timeout: 10_000 });
  await editor.context.close();
});

test("a newsletter's owner runs it and picks its editors from the people around them", async () => {
  const { page, context } = await open(`/newsletter?id=${SMOKE_IDS.I3}`, GRACE_SIGNED_IN);
  await page.locator('#letter-editors').waitFor({ timeout: 10_000 });
  assert.equal(await page.locator('#edit-letter').count(), 1);
  assert.match(await page.locator('.news-letter-owner').innerText(), /Run by\s+Grace/);
  await page.locator('#letter-editors').click();
  // Ada follows Grace, so she's who Grace can add.
  const add = page.locator(`[data-add="${SMOKE_IDS.ADA}"]`);
  await add.waitFor({ timeout: 10_000 });
  await add.click();
  await page.locator(`[data-remove="${SMOKE_IDS.ADA}"]`).waitFor({ timeout: 10_000 });
  assert.match(await page.locator('[data-current]').innerText(), /Owner[\s\S]*Ada[\s\S]*Remove/i);
  await context.close();
});

test('an article reads like a news story, carries its likes and comments, and counts as read once opened', async () => {
  const { page, context } = await open(`/article?id=${SMOKE_IDS.A1}`, null);
  await page.locator('.news-article-full h1').waitFor({ timeout: 10_000 });
  assert.equal(await page.locator('.news-article-full h1').innerText(), 'XOXD T&G Weekly - 17-24 Oct 2026');
  assert.equal(await page.locator('#like-count').innerText(), '1');
  await page.locator('.comment-body', { hasText: 'Good week.' }).waitFor({ timeout: 10_000 });
  assert.deepEqual(await page.locator('.news-more li a').allInnerTexts(), ['XOXD T&G Weekly - 10-17 Oct 2026']);

  // A guest's read marks stay in the browser: back on the newsletter, the
  // article just opened no longer says "New".
  await page.goto(`${origin}/newsletter?id=${SMOKE_IDS.I1}`);
  await page.locator('.news-article-card').first().waitFor({ timeout: 10_000 });
  assert.match(await page.locator('.news-article-card').nth(0).innerText(), /^\s*read\b/i);
  assert.match(await page.locator('.news-article-card').nth(1).innerText(), /^\s*new\b/i);
  await context.close();
});

// One XOXD rather than separate features: what you bought shows wherever
// you appear, a profile has one activity list across everything, and news
// and demos link both ways. Ada wears the gold border and gradient name.
test('your border and name effect show on your comments, not only your profile', async () => {
  const { page, context } = await open(`/project?id=${SMOKE_IDS.P1}`, null);
  const comment = page.locator('.comment', { hasText: 'Lovely sound.' });
  await comment.waitFor({ timeout: 10_000 });
  assert.equal(await comment.locator('.avatar.shop-border-gold').count(), 1);
  assert.equal(await comment.locator('.comment-author .shop-name-gradient').count(), 1);
  await context.close();
});

test("a profile's Activity tab lists what they did across demos, news and the shop", async () => {
  const { page, context } = await open(`/profile?user=${SMOKE_IDS.ADA}`, null);
  await page.locator('.profile-tabs [data-tab="activity"]').click({ timeout: 10_000 });
  await page.locator('.activity-item').first().waitFor({ timeout: 10_000 });
  const text = await page.locator('.activity-list').innerText();
  assert.match(text, /Commented on Pocket Synth/);
  assert.match(text, /Earned Launched/);
  assert.match(text, /Got Paper in the shop/);
  await context.close();
});

test('an article shows the demos it links to, and the demo links back to the article', async () => {
  const article = await open(`/article?id=${SMOKE_IDS.A1}`, null);
  await article.page.locator('#article-demos .tile').first().waitFor({ timeout: 10_000 });
  assert.deepEqual(await article.page.locator('#article-demos .tile-title').allInnerTexts(), ['Pocket Synth']);
  await article.context.close();

  const demo = await open(`/project?id=${SMOKE_IDS.P1}`, null);
  await demo.page.locator('.news-featured a').first().waitFor({ timeout: 10_000 });
  assert.deepEqual(await demo.page.locator('.news-featured a').allInnerTexts(), ['XOXD T&G Weekly - 17-24 Oct 2026']);
  await demo.context.close();
});

test('an old issue link opens the article that took its place', async () => {
  const { page, context } = await open(`/issue?id=${SMOKE_IDS.A1}`, null);
  await page.waitForURL((url) => url.pathname === '/article', { timeout: 10_000 });
  await context.close();
});

test('the old T&G Weekly page forwards to News', async () => {
  const { page, context } = await open('/weekly', null);
  await page.waitForURL((url) => url.pathname === '/news', { timeout: 10_000 });
  await context.close();
});
