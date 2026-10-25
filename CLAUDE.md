# Working on XOXD

A static site on GitHub Pages (root) and an Expo React Native app (`mobile/`),
both on one Supabase project (`tgikpcvkkkbkqtahmczt`). `ARCHITECTURE.md` and
`README.md` describe the parts; this file is what to remember between sessions.

## How the owner likes to work

- Short, direct UI text - minimum words on screen.
- Everything stays inside the app; features should feel connected, not glued on.
- After a change: open a PR, wait for green CI, merge when told "merge".
- Every app change bumps the version: `cd mobile && node ../tools/bump-version.mjs minor|patch`,
  plus a row in the version table in `mobile/README.md`.
- A change to site files bumps `CACHE_VERSION` in `sw.js`.
- No em or en dashes in text (a workflow rejects them) - use " - ".

## Database

- `schema.sql` is the whole database and must match live (the Schema drift
  workflow compares them). Change it first, then apply the same change live.
- Live changes go through the Supabase MCP `apply_migration`. Statements that
  drop anything (`drop policy`, `drop table`...) get auto-rejected as
  destructive: change policies with `alter policy ... rename to` / `alter
  policy ... using/with check` instead, or hand the SQL to the owner to run.
- Policy names max 63 characters (Postgres truncates longer ones silently).
- Check a migration before applying it: load `git show origin/main:schema.sql`
  plus the migration into one local database, the new `schema.sql` into
  another, run `tools/schema-fingerprint.sql` on both and diff.

## Tests

- `npm test` (unit), `npm run test:rls` (needs Postgres: `service postgresql
  start`, password `postgres`), `npm run test:smoke` with
  `SMOKE_CHROMIUM=/opt/pw-browsers/chromium` in the cloud container.
- `cd mobile && npx tsc --noEmit` for the app.
- Smoke tests run pages against `tests/smoke/fake-supabase.js`; a new RPC or
  table the site calls needs a stub there.

## News

- The newsroom (`news_editors`, granted by an admin) writes anywhere; CBot
  posts XOXD's T&G Weekly from a scheduled task every Saturday.
- Anyone can start their own newsletter via `start_newsletter()`: 500 points,
  or free with 25 followers, up to 3 each (`newsletter_terms()`). The owner
  picks editors (`newsletter_editors`). Completionist (every other
  achievement) pays 500 points.

## Open items

- No way to report a news article yet - Google Play expects reporting for
  user-written content before a store release.
- `showcase://**` still needs adding to Supabase Auth Redirect URLs (owner's
  dashboard).
- The intro has been checked in a browser build of the app only, not on a
  phone.
