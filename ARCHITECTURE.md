# How this codebase fits together

This is the map. Read it before reading code, and before rewriting any of it.
The [README](./README.md) has the setup steps and a long, detailed account of
every feature and why it is the way it is; this file is the short version of
*where things are, how they connect, and which rules hold it all up*.

## What it is

**XOXD** is a small social network for things people make - music, videos,
pictures, apps. People publish entries, follow each other, like, comment and
save, earn XP and levels from what others do with their work, and spend points
on profile cosmetics in a shop.

It exists twice, sharing one backend:

| Part | Where | What it is |
| --- | --- | --- |
| Website | repo root | Plain HTML, CSS and JavaScript modules. No framework, no build step. Hosted on GitHub Pages at psekiewicz.github.io. |
| Android app | `mobile/` | React Native (Expo). Native screens, not a WebView. Has its own [README](./mobile/README.md). |
| Backend | `schema.sql`, `supabase/` | One Supabase project: Auth, Postgres with Row Level Security, Storage, four Edge Functions. |

Two unrelated things also live in this repo, only because GitHub Pages serves
it:

- `zarolke/` - a standalone Polish landing page for a different project
  (zarolkę). Its own CSS, fonts and script; shares nothing with XOXD.
- `przewodnik/` - the privacy policy of a separate audio-guide app. That app
  uses the same Supabase project; its database objects are at the end of
  `schema.sql` and XOXD never touches them.

## The picture

```
  Browser (GitHub Pages)           Android app (APK + OTA updates)
  *.html + js/*.js + css/          mobile/src/**
          \                              /
           \   supabase-js, anon key    /
            v                          v
  +--------------------------------------------------+
  | Supabase                                         |
  |  Auth ........ accounts, sessions, bans          |
  |  Postgres .... tables + RLS policies + triggers  |
  |                + security-definer RPCs + views   |
  |  Storage ..... uploads / announcements buckets   |
  |  Edge Fns .... admin-actions, parental-consent,  |
  |                upload-cleanup, announcement-     |
  |                cleanup (hold the service key)    |
  +--------------------------------------------------+
            ^
            |  GitHub Actions: tests, APK build, OTA publish,
            |  schema drift check, weekly ffmpeg pass, keep-alive
```

There is **no server of our own**. Both clients talk straight to Supabase
with the public `anon` key (`js/supabase-config.js`). That is only safe
because of the rule below.

## The one rule: the database is the authority

Everything that matters is enforced in Postgres, in `schema.sql`:

- **Who may see or change a row** - Row Level Security policies on every
  table (drafts visible only to their owner, only the owner edits, you can only
  like/follow/comment as yourself, etc.).
- **Columns a client must not set** - "guard" triggers put them back to their
  stored value on any client write: counters on `projects`, `points` and
  `is_admin` on `profiles`, equipped cosmetics you don't own.
- **Anything involving value** - XP, points, achievement rewards, shop prices.
  These are computed or checked only in the database: the `user_reputation`
  view (XP and lifetime points from what *others* did), `claim_achievement()`,
  `purchase_item()`, `purchase_bundle()`, `collect_earnings()`.
- **Counters and notifications** - written by triggers, never by clients.
- **Rate limits and the age/parental-consent gate** - `BEFORE INSERT`
  triggers and the `consent_ok()` check inside write policies.

So the JavaScript and TypeScript are **display**. Hiding a button is
convenience, never security. A rewrite can change every line of client code
freely as long as it keeps going through these policies and functions. A
rewrite that moves any of these checks into a client opens a hole.

Some data exists both in the database and as a client copy for display. They
must match, and tests check that they do:

| Data | Truth (database) | Display copies | Checked by |
| --- | --- | --- | --- |
| Achievements + rewards | `achievement_defs` | `js/achievements.js`, `mobile/src/lib/achievements.ts` | `tests/integration`, `tests/parity.test.js` |
| Shop items + prices | `shop_item_defs`, `shop_bundle_defs` | `js/shop-items.js`, `mobile/src/lib/shopItems.ts` | same |
| XP weights | `user_reputation` view | none (clients only read the number) | - |

## Words used in the code

| Word | Means |
| --- | --- |
| project / entry / post | The same thing: one row of `projects`. "Project" in code and table names, "entry" or "post" in the interface. |
| Demos | The full-screen swipeable feed (`demos.html`). It used to be called **Scrolls**; `scrolls.html` only redirects, and you'll still see `scroll_image_url`, `scroll-styles.js`. |
| showcase | The project's old internal name. Survives in localStorage keys, the service-worker cache name and the APK file name (`showcase.apk`). Changing it would log people out of cached state or break the download link, so it stays. |
| XP / level | Reputation, computed by the database from what others did with your work. Never spent. |
| points | Spendable currency for the shop. Earned from reach (`collect_earnings()`) and achievement claims. |
| achievement | A badge with a threshold. Once earned it is recorded permanently (`unlocked_achievements`), and its reward is claimed once. |
| cosmetics | Profile background, avatar border, nickname effect - the three shop categories. |
| set / bundle | Three cosmetics sold together, cheaper. "Set" in the interface, "bundle" in code. |
| retired item | A shop item no longer sold. People who own it see its replacement (`RETIRED_ALIASES`). |
| update | A dated changelog entry on a project (`project_updates`). |
| consent | Parental consent for 13-15 year olds; until given, the account can only look around. |

## Repository map

```
*.html                Website pages. Each holds its own page logic in an inline
                      <script type="module"> at the bottom (see "How a page works").
  index.html            Home feed (For you / Following / Latest)
  projects.html         Explore: search posts, tags, people
  project.html          One entry (?id=), comments, updates, likes
  demos.html            Full-screen feed of entries with a live link
  profile.html          A person (?user=), their work, achievements
  dashboard.html        Your own entries: create, edit, publish, delete
  settings.html         Your account
  shop.html             Spend points on cosmetics
  leaderboard.html      Top accounts by XP
  admin.html            Moderation (admins only)
  login.html, register.html, age.html, consent.html, 404.html
  scrolls.html          Redirect only (old name of Demos)
legal/                Terms, privacy, guidelines - GENERATED, see below
download/             The page that links to the latest APK
css/style.css         Design tokens and every shared component
css/social.css        Feed layout: sidebar, posts, rail, Explore, profile
js/                   ES modules shared by the pages (see "Modules" below)
sw.js                 Service worker: network-first, cache as offline fallback
manifest.webmanifest  PWA manifest
assets/               Logo, interface icons, shop artwork (mostly GENERATED)
fonts/, icons/        Self-hosted fonts; PWA and social-preview icons
schema.sql            The whole database: tables, policies, triggers, functions
supabase/functions/   Edge Functions (Deno/TypeScript) + their schedules (*.sql)
mobile/               The Android app (own README)
tools/                Generators and maintenance scripts (see below)
tests/                Unit, database (RLS) and browser smoke tests
.github/workflows/    CI and scheduled jobs (see below)
zarolke/, przewodnik/ Unrelated sites hosted here (see top)
```

### Modules in `js/`

- **Data access - one module per table or feature**, named `*-data.js`:
  `projects-data`, `profiles-data`, `follows-data`, `likes-data`,
  `comments-data`, `saves-data`, `views-data`, `updates-data`,
  `notifications-data`, `reports-data`, `reputation-data`, `points-data`,
  `shop-data`, `uploads-data`, `announcements-data`, `admin-data`,
  `age-data`, plus `auth.js`. They all follow one pattern: call `supabase`,
  map snake_case rows to camelCase objects (`toPlainX`), `throw new Error`
  on failure. They contain no access checks - RLS does that.
- **Client setup** - `supabase-config.js` (URL + anon key),
  `supabase-init.js` (creates the client from esm.sh, pinned to an exact
  version).
- **Pure logic, unit-tested** - `utils.js` (escaping, `safeUrl`, avatars,
  dates), `markdown.js`, `media.js` (link -> player, host allowlist),
  `feed-rank.js`, `levels.js`, `compress.js`, `format-toolbar.js`,
  `scroll-styles.js`, `icons.js`.
- **Catalogs** - `achievements.js`, `shop-items.js` (display copies, see the
  table above).
- **Rendering pieces** - `post-card.js`, `feed-rail.js`, `stats-card.js`,
  `toast.js`, `create-sheet.js`, `upload-field.js`, `share.js`.
- **Loaded on every page** - `theme.js`, `nav.js`, `bottom-nav.js`,
  `cookie-consent.js`, `pwa.js`, and `animations.js` (all but Demos).
  `nav.js` in turn runs `age-gate.js` and `announcement.js`, mounts the
  notification bell (`notifications-ui.js`) and starts `progress-watch.js`
  (level-up and achievement toasts), so a new page gets all of that by
  loading `nav.js`.

Every module starts with a comment saying what it is for. Read those first.

## How a page works

1. The `<head>` has a one-line inline script that applies the saved theme
   before anything paints, then links `css/style.css` (and `css/social.css`
   on feed-style pages).
2. The navbar markup is **copied into every page** - there is no build step
   to include it. `tools/sync-nav.mjs` regenerates that block in all pages
   from one definition; never hand-edit one page's navbar.
3. At the bottom, shared modules are loaded (`theme.js`, `nav.js`,
   `bottom-nav.js`, ...), then one inline `<script type="module">` holds the
   page's own logic: it imports data modules, fetches, and renders HTML
   strings into the page.
4. Everything rendered from data goes through `escapeHtml()`, and every
   user-supplied link through `safeUrl()` (`js/utils.js`). Iframes are never
   given a user URL - `media.js` rebuilds embed URLs from an allowlist.
5. Pages that need an account redirect to `/login?next=...` when there
   is none. That is only a convenience; the data is protected by RLS anyway.
6. Links use **clean URLs**: `/projects`, `/project?id=...`, `/` for home -
   never `projects.html`. GitHub Pages serves `projects.html` for
   `/projects`, so both work, but code that recognises the current page must
   go through `pageId()` (`js/utils.js`), which treats them as the same page.
   A smoke test fails on any internal link ending in `.html`. Two exceptions
   keep `.html` on purpose: the password-reset `redirectTo` (it has to match
   the redirect allowlist in Supabase's Auth settings) and the link in the
   parental-consent email (sent by a deployed Edge Function).
7. Links in Supabase's own emails come back to the site: sign-up
   confirmation to `/login?confirmed=1` (`emailRedirectTo`), password reset
   to `/login.html`. Supabase only honours an address on the Redirect URLs
   allowlist (*Authentication -> URL Configuration*); anything else falls
   back to the Site URL there, which defaults to `http://localhost:3000`.
   Both should be set to the live site.

Pages are separate documents, not a single-page app. Cross-document view
transitions make navigation look seamless.

## The app (`mobile/`)

Same backend, same rules. Its structure mirrors the site on purpose:
`mobile/src/data/*.ts` are near line-by-line ports of `js/*-data.js`, and
`mobile/src/lib/` holds ports of the pure logic (levels, feed ranking,
markdown, media, catalogs). When you change one side, look for the other.
Screens are in `mobile/src/screens/`, navigation in
`mobile/src/navigation/RootNavigator.tsx`.

Builds: every push to `main` touching `mobile/` builds a signed APK
(`android.yml`) and publishes a JavaScript-only over-the-air update
(`eas-update.yml`). Details, signing and the fingerprint scheme are in
[mobile/README.md](./mobile/README.md).

## The database (`schema.sql`)

One file, safe to re-run from top to bottom (everything is
`if not exists` / `or replace` / drop-then-create). It grew by appending, so
later sections sometimes amend earlier tables. In order:

1. `projects`, `profiles`, `follows`, the admin flag
2. `comments`, `likes`, counters on the project row, views (`project_views`,
   `log_project_view()`)
3. Points and shop: `achievement_defs`, `unlocked_achievements`,
   `shop_item_defs`, `owned_items`, sets (`shop_bundle_*`), equip guard
4. `notifications` and the triggers that write them
5. `project_updates` (changelog) and telling followers about new work
6. Reputation: the `user_reputation` view and `collect_earnings()`
7. `saves`, `reports`, rate limits (`rate_limit_events`)
8. Age and parental consent: `account_ages`, `parental_consents`,
   `consent_ok()`
9. Storage: `uploads` bucket, `media_optimized`; `announcements`
10. The audio guide's objects (not XOXD's)
11. Indexes

`tools/schema-drift.mjs` (run daily in CI when its secret exists) compares
this file with the live database. If you change the database by hand, write
the change back here.

## Generated files - edit the source, then re-run

| Output | Source / generator | Command |
| --- | --- | --- |
| Navbar block in every `*.html` | `tools/sync-nav.mjs` | `node tools/sync-nav.mjs` |
| `legal/*.html` | `mobile/src/legal/documents.ts` via `tools/build-legal.mjs` | `node --experimental-strip-types tools/build-legal.mjs` |
| `assets/icons/*.svg` + the icons block in `css/style.css` | `tools/gen-icons.mjs` (Lucide) | `node tools/gen-icons.mjs` |
| `icons/*.png`, app icons in `mobile/assets/` | `assets/brand/xoxd-logo.png` via `tools/gen-brand.py` | `python3 tools/gen-brand.py` |
| `assets/shop/{bg,border,name}/*.webp` | `tools/gen-shop-art.py` | `python3 tools/gen-shop-art.py` |

`bg-blocks.webp`, `border-flame.png` and the Oxygene font are hand-made and
not generated.

## Automation (`.github/workflows/`)

| Workflow | When | Does |
| --- | --- | --- |
| `tests.yml` | every push to main, every PR | unit, RLS (Postgres 16) and browser smoke tests |
| `android.yml` | `mobile/` changes | builds and signs the APK/AAB, publishes a release |
| `eas-update.yml` | `mobile/` changes | over-the-air JavaScript update for installed apps |
| `schema-drift.yml` | `schema.sql` changes, daily | live database vs `schema.sql` |
| `media-optimize.yml` | weekly | re-encodes uploaded clips smaller with ffmpeg |
| `supabase-keepalive.yml` | every 3 days | stops the free Supabase tier from pausing |
| `mdash-to-dash.yml` | every 3 days | replaces em dashes with `-` across the repo and commits |

## Tests

```bash
npm test            # pure logic in js/, and site/app catalog parity - no setup
npm run test:rls    # schema.sql's policies and RPCs - needs TEST_DATABASE_URL (Postgres)
npm run test:smoke  # every page in Chromium against a fake Supabase
```

The RLS suite is the most valuable one for a rewrite: it describes, as
executable checks, what the database must allow and refuse.

## Common changes

- **New page** - copy an existing page's skeleton, add it to `PAGES` in
  `tools/sync-nav.mjs` and run it, add it to `sitemap.xml` if public and to
  `PRECACHE_URLS` in `sw.js` (by its clean URL) if it should open offline (then bump
  `CACHE_VERSION`). The smoke test finds new pages on its own.
- **New column or table** - add it to `schema.sql` (idempotently), with RLS
  policies if it's a table, run it in the Supabase SQL Editor, add a test to
  `tests/integration/rls.test.js`, then the `*-data` module on both the site
  and the app.
- **New achievement or shop item** - insert into the `*_defs` table in
  `schema.sql` *and* add it to both display copies (site and app). The tests
  fail until all three agree.
- **Legal text** - edit `mobile/src/legal/documents.ts`, run
  `tools/build-legal.mjs`.
- **Anything needing the service_role key** (acting on `auth.users`, sending
  email, deleting storage files) - an Edge Function in `supabase/functions/`,
  never client code.

## If you rewrite it

Things that must survive, whatever the stack:

- All authorization stays in the database (policies, guard triggers,
  security-definer functions). If you replace Supabase, those rules move to
  your server, not to the client.
- `escapeHtml` / `safeUrl` everywhere user text or links reach HTML, and the
  embed allowlist in `media.js`. Both closed real holes.
- The age gate and parental consent flow (legal requirement, GDPR Art. 8).
- The APK signing key (kept outside the repo) and the stable download URL
  `releases/latest/download/showcase.apk`.
- The audio guide's objects in the shared Supabase project.

Known rough edges, in rough order of how much they cost:

- Page logic lives in large inline scripts inside the HTML (up to ~550 lines
  in `project.html` and `admin.html`); the shared stylesheet is ~5,000 lines.
- Achievements, the shop catalog and data modules are written twice (site and
  app) and kept in step by hand, with tests as the safety net.
- `schema.sql` grew by appending; reading a table means searching for all
  its `alter table` statements.
- `sw.js` has a hand-kept list of files to precache.
- The README reads as a history of every feature; it is accurate but long.
- `fonts/oxygene-1.ttf` has a non-commercial licence (see README, "Legal").
