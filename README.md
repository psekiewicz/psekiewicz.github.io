# Showcase (psekiewicz.github.io)

A professional, multi-page website for publishing and discovering projects, with a full working authentication system — built to run entirely as static files on GitHub Pages.

Your previous personal site (home/blog/about/projects) has been preserved on the [`legacy-personal-site`](https://github.com/psekiewicz/psekiewicz.github.io/tree/legacy-personal-site) branch, in case you want to bring any of it back.

## Why Supabase

GitHub Pages only serves static files — there's no server to run session logic, hash passwords, or enforce "only the owner can edit their project." This site uses **Supabase Authentication** (real accounts, real password security, backed by Postgres) and **Supabase's Postgres database with Row Level Security (RLS)** so that authentication and authorization are still genuinely enforced — just by Supabase's servers instead of a server you'd have to run yourself.

## One-time setup (required before login will work)

The site is fully built, but it's pointed at a placeholder Supabase project. Until you complete these steps, register/login will fail.

1. **Create a Supabase project** — go to [supabase.com/dashboard](https://supabase.com/dashboard), click "New project" (the free tier is enough for this).
2. **Create the database tables and security policies** — open the project's *SQL Editor*, paste in everything from [`schema.sql`](./schema.sql) in this repo, and click **Run**. This creates the `projects`, `profiles`, `follows`, `comments`, `likes`, and `project_views` tables and the RLS policies that actually enforce ownership (only you can edit/delete your projects), draft privacy (only you can see your unpublished projects), "you can only follow/unfollow as yourself", "anyone signed in can comment, but only the comment's author, the project's owner, or an admin can delete it", "anyone signed in can like/unlike as themselves", and "only a project's owner (or an admin) can read its raw view log" — it's not optional. The whole file is safe to re-run any time you pull an update that adds to it.
3. **Get your project's API values** — go to *Project Settings* (gear icon) → *API*. Copy the **Project URL** and the **`anon` `public`** key (never the `service_role` key — that one must never appear in client-side code).
4. **Paste your config** — put those two values into [`js/supabase-config.js`](./js/supabase-config.js), replacing the `REPLACE_WITH_...` placeholders. These values are safe to publish in client-side code — they identify your project, they aren't secret keys (the RLS policies in `schema.sql` are what actually protect your data).
5. **Commit and push** the updated `js/supabase-config.js`. GitHub Pages will redeploy automatically within a minute or two.

Email confirmation is enabled by default on new Supabase projects. If you'd rather let people log in immediately after registering (no confirmation email), go to *Authentication → Providers → Email* and turn off "Confirm email" — fine for a personal/demo site, worth keeping on for anything public-facing.

That's it — no server to host, no environment variables, no backend to keep running.

### Making an account admin

There's deliberately no button anywhere in the app for this — granting the admin role is something only you, from the Supabase SQL Editor, should be able to do. After the person has registered an account, run (with their email filled in):

```sql
update public.profiles set is_admin = true
where id = (select id from auth.users where email = 'you@example.com');
```

They'll see an "Admin" link appear in the nav (desktop: next to Home/Projects/Scrolls; mobile: in the hamburger menu) next time they load the site, leading to `admin.html`.

### Real bans and account deletion (Supabase Edge Function)

Banning a user (so they genuinely can't log in) and deleting an account both require Supabase's **Admin API**, which only works with the `service_role` key — a key that must never exist in this repo or any other client-side code, because it grants full access to your entire database, bypassing every RLS policy. There is no safe way to do a real ban or delete from a static site alone.

The fix is a tiny **Supabase Edge Function** — server-side code that Supabase hosts for you (not GitHub Pages), where the `service_role` key can live safely as a secret. It's already written, at [`supabase/functions/admin-actions/index.ts`](./supabase/functions/admin-actions/index.ts); you just need to deploy it once:

1. **Install the Supabase CLI** — `npm install -g supabase` (or see [supabase.com/docs/guides/cli](https://supabase.com/docs/guides/cli) for other install methods).
2. **Log in and link this project to your Supabase project** — from the repo root:
   ```bash
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   ```
   Your project ref is the subdomain in your Project URL (`https://YOUR_PROJECT_REF.supabase.co`).
3. **Deploy the function**:
   ```bash
   supabase functions deploy admin-actions
   ```
4. That's it — no secrets to set manually. Supabase automatically provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as environment variables inside every deployed Edge Function; the function reads them from `Deno.env`, they're never in git.
5. **Re-run `schema.sql`** (see step 2 above) if you haven't already since the admin role was added — it adds `admin_list_users()`, which the Users tab in `admin.html` needs to show emails and ban status (neither of which live in the public `profiles` table).

Once deployed, the admin panel's Ban/Unban/Delete buttons and Settings' "Delete my account" button call this function. Everything else about the site (auth, projects, follows) is completely unaffected if you skip this — those features just won't work until you deploy it.

**What a ban actually does:** it sets `banned_until` on the Supabase Auth user (native support, not something this app invented) and Supabase rejects new logins/token refreshes for that account until it passes. A banned user's *already-issued* access token can keep working until it next needs to refresh (typically within an hour), since revoking a live token isn't something Supabase's ban exposes — this matches how bans normally behave against JWT-based auth.

## Features

- **Real authentication** — Supabase Authentication handles registration, login, logout, and password reset ("Forgot your password?" on the login page).
- **Ownership-based authorization** — enforced server-side by Postgres Row Level Security policies, not just hidden in the UI: only a project's creator can edit, publish/unpublish, or delete it.
- **Multi-page frontend** — separate HTML documents for each view, not a single-page app.
- **Public gallery** — anyone can browse and search published projects by keyword or tag.
- **Personal dashboard** — logged-in users manage their own projects (create, edit, publish/unpublish, delete).
- **Account settings** — edit display name, bio, avatar, and password (changing it requires re-entering the current one) from `settings.html`, plus a self-service "Delete my account" (type-to-confirm) that permanently removes your account and everything you published.
- **Profiles & followers** — every account has a public profile page (`profile.html?user=<id>`) listing their published work and follower/following counts; anyone signed in can follow/unfollow.
- **Scrolls** — a TikTok/Reels-style full-screen, swipeable feed of published projects at `scrolls.html`, **ranked rather than chronological** (`js/feed-rank.js`). Projects score on engagement (likes, comments, views) decayed by age with Hacker News-style gravity, get a boost if you follow the author, and are pushed down once you've actually watched them (tracked in `localStorage` on the same 3-second dwell that counts a view). The final order comes from weighted random sampling rather than a plain sort, so a good project is *likely* to come up first without the feed being identical on every visit — and a spacing pass keeps one prolific author from owning a run of cards.
- **Dark mode** — a toggle in the navbar, remembered per-browser (`localStorage`), falling back to the OS theme when no explicit choice has been made.
- **Mobile bottom nav** — on narrow screens, a fixed bottom tab bar (Home / Scrolls / Add / Dashboard / Profile) mirrors the app-like navigation of TikTok/Instagram and fully replaces the top navbar's account menu there (which would otherwise overflow); the top navbar remains the primary nav on desktop.
- **Homepage adapts to your session** — signed-in visitors see "Add new project" / "Browse projects" instead of the signed-out "Create free account" pitch.
- **Avatars everywhere** — not just the profile page: the navbar chip, the bottom nav's Profile tab, and every project card, scroll, and detail page show the author's actual photo (falling back to initials on a gradient when they haven't set one).
- **Outline icon set** — a small hand-built set of stroke-only ("no fill") SVG icons (`js/icons.js`) replaces emoji throughout the app: nav, bottom bar, theme toggle, feature cards, dashboard/admin row actions.
- **Admin panel** (`admin.html`) — accounts with `is_admin = true` get a moderation view of every project on the site (any user, any status, searchable) with unpublish/delete actions, and a searchable Users tab showing every account's email and ban status, with real Ban (for a chosen duration)/Unban/Delete-account actions. There's no in-app way to grant the admin role itself — see "Making an account admin" below. Ban/delete require the Edge Function described below; everything else works without it.
- **Project types** — every project is tagged as Website, Mobile App, Game, Design, Library/Tool, or Other (`dashboard.html`'s create/edit form), shown as an icon badge on every card and the detail page, and filterable on `projects.html`.
- **Comments** — anyone signed in can comment on a project from its detail page or from a Scrolls card's comments drawer; the comment's author, the project's owner, or an admin can delete it. Enforced by RLS in `schema.sql`, not just hidden buttons in the UI.
- **Likes** — a heart button on the detail page and every Scrolls card; anyone signed in can like/unlike a project, counts are public. Backed by `js/likes-data.js` and the `likes` table.
- **View counts + analytics** — every project detail-page load logs a view (`log_project_view()`, works for signed-out visitors too) and bumps a public `views_count` shown next to the project. Scrolls counts a view too, but only once a card has stayed at least 75% on screen for a full 3 seconds — a quick swipe past a card doesn't count, matching how the feed is meant to be skimmed vs. actually looked at. The dashboard adds two charts built from that data: a 14-day views line chart and a per-project views bar chart (`js/views-data.js`).
- **Edit from anywhere** — a project's owner sees an Edit button on its detail page and on their own profile's project cards, both deep-linking to `dashboard.html?edit=<id>`, which opens the same edit modal used on the dashboard itself pre-filled with that project — one edit UI, reachable from three places.
- **Scrolls action rail** — likes, comments, visit/source links, and the detail-page link live in a YT-Shorts-style vertical button rail on the right of each full-screen card; tapping the comment button opens a slide-up comments drawer without leaving the feed.
- **Age confirmation at signup** — registration requires checking "I confirm that I am at least 13 years old" before an account can be created.
- **Cookie notice** — a dismissible banner (`js/cookie-consent.js`), shown once per browser via `localStorage`, explains that the site only uses essential cookies/local storage (session + preferences), no tracking or advertising.
- **Installable PWA** — the site ships a web app manifest (`manifest.webmanifest`) and a service worker (`sw.js`) that caches the static app shell (HTML/CSS/JS/icons) for instant loads and resilience on a flaky connection. On Chrome/Edge, an "Install app" button appears in the navbar once the browser decides the site is installable (`js/pwa.js`, listening for `beforeinstallprompt` — Firefox doesn't implement that event at all, so the button simply never appears there; that's a Firefox platform limitation, not a bug). Installing puts a real icon on the home screen/app list that opens in its own window, no browser chrome. Live data (auth, projects, comments, etc.) is never cached — the service worker only ever intercepts same-origin requests, so Supabase calls always go straight to the network and nothing goes stale or works "offline" in a way that would show outdated account state. Page navigations are network-first (bypassing the HTTP cache, not just Cache Storage) so a new deploy shows up on the very next load in every browser, not just Chrome; `js/pwa.js` also force-checks for a new `sw.js` on every load and reloads once automatically when a newer one takes over.
- **Achievements** — 17 badges computed client-side from data the app already has (published projects, likes/views received, comments posted, followers/following, account age, profile completeness, shop ownership) via `js/achievements.js`. A profile page shows the full grid of unlocked/locked badges; tapping any badge (works the same on mobile, unlike a hover tooltip) opens a modal explaining exactly how to earn it. The single best-earned badge also shows as a small icon next to the name on the profile header and in the navbar's own account chip.
- **XP & levels** — every account has a level, shown as a "Lv 7" chip next to their name on their profile, in the navbar, on project cards, in the Scrolls feed, and on every comment; the profile also gets a progress bar to the next level. XP is **derived, never stored** (`js/levels.js`): it's recomputed from the same activity the achievements system already reads — published projects (100 XP), likes received (25), followers (40), comments posted (10), views (1) — so a level can never drift out of sync with reality, there's no XP column anyone could forge from the browser console, and this feature needed no schema changes at all. Each level costs quadratically more than the last (level *L* starts at 100·(*L*−1)² XP), so early levels come quickly and later ones stay meaningful. The trade-off, by design: XP can only reflect measurable activity — there's no way to grant a one-off bonus without giving XP a table of its own. Levelling a whole page of authors takes a fixed four queries no matter how many people are on it, via the batch helpers in `projects-data.js`/`comments-data.js`/`follows-data.js`.
- **Notifications** — a bell in the navbar with an unread count, listing new followers plus likes and comments on your projects. Rows are written entirely by database triggers, never by the client: the person who causes a notification is never the person who receives it, so "you may insert this row" can't be expressed as an RLS policy the actor could satisfy. The trigger functions are `security definer` and work out the recipient themselves; `notifications` has select/update/delete policies for its own owner and **no insert policy at all**, so a forged notification is rejected by Postgres. Self-actions (liking your own project) notify nobody, and an identical notification that's still unread isn't duplicated — otherwise unliking and re-liking would pile them up.
- **Leaderboard** — `leaderboard.html` ranks the top 50 accounts by XP, showing each one's avatar (with their equipped border), name (with their equipped effect), level and total XP, with medals for the podium and your own row highlighted. If you're outside the top 50 your standing is appended underneath rather than left a mystery. Accounts with no XP at all are filtered out so the table isn't padded with identical Lv 1 rows.
- **Points & Shop** — on your own profile, each unlocked achievement has a "Claim +N pts" button; claiming calls `claim_achievement()` in `schema.sql`, which independently re-checks eligibility against the real tables (it doesn't trust the client) and pays out the reward exactly once. Points are spent at `shop.html` on purely cosmetic profile items — backgrounds, avatar borders, and nickname effects (`js/shop-items.js` is the catalog) — bought via `purchase_item()`, which owns the real price list the same way. Buying is separate from equipping: owned items sit in your inventory until you Equip one per category, backed by `profiles.equipped_bg`/`equipped_border`/`equipped_name_effect` and a trigger that reverts any attempt to equip an item you don't own. Equipped effects show on your profile page (background behind the header, ring around your avatar, styled name) and — border + name effect — in the navbar's account chip too. Most items are pure CSS (gradients, patterns, animations), so they cost nothing to download and adapt to light/dark automatically; two are image-based and live in `assets/shop/`. The "Blue Flame" avatar frame is the one item that can't be a `box-shadow` ring like the others — it's artwork that has to sit *around* the avatar, drawn as an oversized pseudo-element sized in percentages of the avatar so a single rule works from the 26px navbar chip up to the 96px profile header. Framed avatars switch to `overflow: visible` (which would otherwise clip the frame) and get their circular crop from `border-radius` on the image instead.
- **Animated throughout** — the mobile hamburger morphs into an X and the nav dropdown slides open instead of snapping; every modal/drawer (new/edit project, followers list, Scrolls comments) fades and scales in instead of popping; the login/register card and error/success alerts fade in; liking a project pops the heart icon; buttons lift slightly on hover; new cards and table rows fade in as they render. Everything respects `prefers-reduced-motion` and collapses to near-instant for anyone who's asked their OS for less motion.

## Tech stack

- **Hosting:** GitHub Pages (static files only, served from the `main` branch root)
- **Auth + data:** Supabase Authentication + Postgres, called directly from the browser via the `@supabase/supabase-js` client (loaded from the esm.sh CDN, no build step, no `npm install` required to run the site)
- **Frontend:** plain HTML/CSS/vanilla JS (ES modules)
- **Typography:** [JetBrains Mono](https://www.jetbrains.com/lp/mono/) (OFL-licensed) throughout, self-hosted from `fonts/` rather than the Google Fonts CDN — that keeps it in the service worker's app-shell cache and avoids a third-party request on every page load. Only the `latin` and `latin-ext` subsets are shipped (~43 KB total); `latin-ext` is what carries the Polish diacritics.

## Local development

No build step or server is required — any static file server works:

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

(Auth/data calls will fail locally too until `js/supabase-config.js` has your real project's values.)

## Project structure

```
index.html            Home page — hero (auth-aware) + latest published projects
projects.html         Public gallery — search + tag filter over published projects
project.html           Single project detail (?id=<row uuid>)
scrolls.html            Full-screen swipeable feed of published projects
profile.html            Public profile (?user=<uuid>) — bio, stats, follow button, achievements, their published projects
leaderboard.html        Public — top 50 accounts by XP
shop.html               Protected — spend points on profile backgrounds, avatar borders, and nickname effects
settings.html           Protected — edit display name/bio/avatar, change password (requires current password), delete own account
admin.html               Protected + admin-gated — search/moderate every project and account on the site
login.html             Email/password login + "forgot password"
register.html          Account creation
dashboard.html         Protected — create/edit/publish/delete your own projects
404.html                GitHub Pages' custom not-found page
css/style.css          Shared design system (dark theme tokens, bottom nav, scrolls, profile, admin styles)
js/supabase-config.js  Your Supabase project's public URL + anon key — EDIT THIS
js/supabase-init.js     Initializes the Supabase client, exports `supabase`
js/auth.js               register/login/logout/reset-password/change-password, wraps Supabase Auth errors in plain-English messages
js/projects-data.js      All reads/writes for the `projects` table
js/profiles-data.js      Read/update the `profiles` table; batch-fetch profiles by id for author avatars
js/follows-data.js       Follow/unfollow, follower/following counts and lists
js/comments-data.js      getComments/addComment/deleteComment/getCommentCounts for the `comments` table
js/likes-data.js         getLikeCounts/getLikedSet/likeProject/unlikeProject for the `likes` table
js/views-data.js         logProjectView() (via the log_project_view() RPC) + getRecentViewTimestamps() for the dashboard charts
js/achievements.js       Achievement definitions (incl. display-only `reward` copy) + getUserStats()/computeAchievements()/getTopAchievement(), computed client-side from existing data
js/feed-rank.js          Scrolls ranking — engagement/recency scoring, weighted shuffle, seen-tracking and author spacing
js/toast.js              Reward toast stack (achievement / level-up / XP)
js/progress-watch.js     Notices new achievements, level-ups and XP gains and toasts them; also records unlocks so they become permanent
js/levels.js             XP weights + levelFromXp()/levelFromStats()/levelChipHtml(), and getLevelsForUsers() to level a whole page of authors in a fixed four queries — all derived, nothing stored
js/notifications-data.js Read/count/mark-read for your own notifications (RLS scopes them to you)
js/notifications-ui.js   Navbar bell, unread badge and dropdown panel, injected rather than written into every page
js/points-data.js        getAchievementRecords() (permanently-earned vs already-claimed) + recordAchievementUnlock() and claimAchievement(), both server-verified RPCs
js/shop-items.js         The shop's item catalog (backgrounds/borders/name effects) + effectClass() mapping an item id to its CSS class — display-only copy of the real prices in purchase_item()
js/shop-data.js          getOwnedItemIds() + purchaseItem() (calls purchase_item()) + equipItem() for the three cosmetic slots on `profiles`
js/admin-data.js         isAdmin() check, admin_list_users() RPC wrapper, and the ban/unban/delete-account calls into the admin-actions Edge Function
js/icons.js               Outline SVG icon set shared by every page
js/theme.js               Dark mode toggle + localStorage persistence
js/bottom-nav.js          Injects the mobile bottom tab bar, auth-aware, shows the signed-in user's real avatar
js/nav.js                 Shared top navbar: auth-aware links + avatar, admin link, mobile menu toggle
js/cookie-consent.js      One-time dismissible cookie notice banner, shown on every page
js/pwa.js                 Registers sw.js; shows the "Install app" button when the browser fires beforeinstallprompt
js/utils.js               escapeHtml / initials / avatarHtml / timeAgo / typeBadgeHtml helpers + PROJECT_TYPES metadata
sw.js                    Service worker — caches the static app shell, always passes Supabase/cross-origin requests straight through
manifest.webmanifest     Web app manifest — name, icons, standalone display, required for installability
icons/                   PWA icons (192/512/maskable/apple-touch-icon), generated from the navbar's gradient "S" mark
assets/shop/             Image-based shop items — the "Blocks" profile background and the "Blue Flame" avatar frame
fonts/                   Self-hosted webfonts — JetBrains Mono (latin + latin-ext subsets) for the whole UI, plus Oxygene 1 for the shop's nickname effect of the same name (see the licensing note under "Legal / compliance")
schema.sql              Table definitions + Row Level Security policies — run in the Supabase SQL Editor (see setup above)
supabase/functions/admin-actions/index.ts   Edge Function for real ban/unban/account deletion — see "Real bans and account deletion" above
```

## Data model

Postgres table `public.projects`, one row per project:

| Column         | Type                | Notes                                             |
| -------------- | ------------------- | -------------------------------------------------- |
| `user_id`      | uuid                 | Owner — references `auth.users(id)`, set once, never changed |
| `author_name`  | text                 | Display name snapshot at creation time             |
| `title`        | text (3–100 chars)   |                                                     |
| `summary`      | text                 | Short one-liner shown on cards                     |
| `description`  | text                 | Full write-up shown on the detail page             |
| `image_url`, `repo_url`, `live_url` | text  | All optional                                       |
| `tags`         | text[]               | Up to 10, enforced client-side                     |
| `project_type` | text                 | One of `website`, `mobile_app`, `game`, `design`, `library`, `other` — defaults to `other` |
| `views_count`  | integer              | Public running total, only ever incremented via `log_project_view()` |
| `published`    | boolean              | Controls public visibility                          |
| `created_at`   | timestamptz          | Defaults to `now()`                                 |
| `updated_at`   | timestamptz          | Kept current by a trigger on every update           |

Postgres table `public.profiles`, one row per account (auto-created by a trigger when someone signs up):

| Column         | Type       | Notes                                              |
| -------------- | ---------- | --------------------------------------------------- |
| `id`           | uuid       | Primary key, same as `auth.users(id)`                |
| `display_name` | text       | Editable from `settings.html`; kept in sync with `auth.user_metadata.display_name` |
| `bio`          | text       | Shown on the public profile page                     |
| `avatar_url`   | text       | Optional; falls back to initials-on-gradient everywhere it's shown when blank |
| `is_admin`     | boolean    | Grants access to `admin.html`; only settable via direct SQL (see "Making an account admin" above) — guarded by a trigger so the app itself can never set it |
| `points`       | integer    | Shop currency; only ever changed by `claim_achievement()`/`purchase_item()` — column-level `UPDATE` is revoked from the `authenticated` role, so a direct client update to it is rejected by Postgres itself |
| `equipped_bg`, `equipped_border`, `equipped_name_effect` | text | Currently-equipped shop item id per cosmetic slot, or `'none'`; a trigger reverts any value that isn't `'none'` and isn't in `owned_items` for that user |
| `created_at`   | timestamptz | Defaults to `now()`                                  |

This exists because `auth.users` itself is never queryable from the browser — profile pages, follower lists, and anything showing *other* people's info reads from `profiles` instead. Each project also keeps its own `author_name` snapshot so project cards don't need an extra join.

The one exception is the admin Users tab, which does need email addresses and ban status (both live only on `auth.users`, deliberately never copied into the public `profiles` table). `admin_list_users()` is a `security definer` Postgres function that reads `auth.users` and returns rows *only* if the caller is already an admin — the safety check lives in the function itself, not in a table policy.

Postgres table `public.follows`, one row per follow relationship:

| Column         | Type        | Notes                                    |
| -------------- | ----------- | ------------------------------------------ |
| `follower_id`  | uuid        | The person doing the following             |
| `following_id` | uuid        | The person being followed                  |
| `created_at`   | timestamptz | Defaults to `now()`                        |

Primary key is `(follower_id, following_id)`, so a given follow relationship can only exist once. Follower/following counts are just row counts — computed client-side via `js/follows-data.js`, no denormalized counter columns to keep in sync.

Postgres table `public.comments`, one row per comment:

| Column        | Type        | Notes                                              |
| ------------- | ----------- | ---------------------------------------------------- |
| `project_id`  | uuid        | References `projects(id)`, cascade-deletes with the project |
| `user_id`     | uuid        | Comment author — references `auth.users(id)`         |
| `author_name` | text        | Display name snapshot at comment time                |
| `body`        | text (1–2000 chars) |                                                |
| `created_at`  | timestamptz | Defaults to `now()`                                   |

Readable by anyone who can see the project; insertable by any signed-in user (as themselves); deletable by the comment's own author, the project's owner, or an admin.

Postgres table `public.likes`, one row per (project, user) like:

| Column       | Type        | Notes                                      |
| ------------ | ----------- | --------------------------------------------- |
| `project_id` | uuid        | References `projects(id)`, cascade-deletes with the project |
| `user_id`    | uuid        | References `auth.users(id)`                    |
| `created_at` | timestamptz | Defaults to `now()`                            |

Primary key is `(project_id, user_id)`, so liking twice is a no-op at the schema level. Public read (so counts show to signed-out visitors too); insert/delete only as yourself.

Postgres table `public.project_views`, an append-only log of detail-page views:

| Column       | Type        | Notes                                      |
| ------------ | ----------- | --------------------------------------------- |
| `project_id` | uuid        | References `projects(id)`, cascade-deletes with the project |
| `created_at` | timestamptz | Defaults to `now()`                            |

Only ever written through `log_project_view(project_id)`, a `security definer` RPC that both inserts the log row and increments `projects.views_count` — that's what lets a signed-out visitor's view count at all, without granting public write access to the `projects`/`project_views` tables directly. Reading the raw log (used for the dashboard's 14-day chart) is restricted by RLS to the project's owner or an admin.

Postgres table `public.unlocked_achievements`, one row per achievement a user has claimed:

| Column           | Type        | Notes                                    |
| ---------------- | ----------- | ------------------------------------------ |
| `user_id`        | uuid        | References `auth.users(id)`                |
| `achievement_id` | text        | One of the ids in `js/achievements.js`     |
| `claimed_at`     | timestamptz | Defaults to `now()`                        |

Primary key is `(user_id, achievement_id)`, so an achievement can only ever be claimed (and paid out) once. **Achievements are permanent**: a row is written by `record_achievement_unlock()` the moment one is first earned, so deleting the project (or losing the likes/followers) behind it doesn't take the badge away again — `computeAchievements()` treats an achievement as unlocked if the live stats qualify *or* a row exists. `claimed_at` is NULL for "earned but the reward hasn't been collected yet" and set once `claim_achievement()` pays out; that split is what lets the row exist from the moment of unlocking without the payout logic mistaking it for an already-paid claim, and it means you can still collect the reward for something you earned before deleting the project. Readable only by its own owner; there's no insert/update/delete policy at all — rows are only ever written by `claim_achievement()` (`security definer`), which looks up the achievement's metric/threshold/reward from `public.achievement_defs`, computes that metric for the caller via `achievement_metric()` (a small `case` over named metrics like `total_likes`/`follower_count`/`account_age_days`, each querying `projects`/`likes`/`comments`/`follows`/`profiles` directly rather than trusting a client-supplied stats object), and only then increments `profiles.points`. `achievement_defs` (id → metric, threshold, reward) is what makes adding a new achievement later just an `INSERT`, not a rewrite of `claim_achievement()` itself — it's publicly readable but only ever edited by hand in the SQL Editor.

Postgres table `public.owned_items`, one row per shop item a user has purchased:

| Column         | Type        | Notes                                    |
| -------------- | ----------- | ------------------------------------------ |
| `user_id`      | uuid        | References `auth.users(id)`                |
| `item_id`      | text        | One of the ids in `js/shop-items.js`       |
| `purchased_at` | timestamptz | Defaults to `now()`                        |

Primary key is `(user_id, item_id)`, so buying the same item twice is a no-op. Publicly readable (like `likes`/`follows`/`comments`) so the "Collector" achievement can be checked on anyone's profile, not just your own; there's no insert/update/delete policy — rows are only ever written by `purchase_item()` (`security definer`), which reads the price from `public.shop_item_defs` (id → price) and checks it against `profiles.points` before charging. Like `achievement_defs`, that table is what makes adding a shop item a one-line `INSERT` rather than a rewrite of `purchase_item()` — publicly readable, but only ever edited by hand in the SQL Editor.

## Legal / compliance

- **Age gate** — `register.html` requires checking "I confirm that I am at least 13 years old" before the form will submit; there's no server-side age verification (Supabase doesn't offer one), so this is a self-attestation, same as most consumer sites.
- **Cookie notice** — `js/cookie-consent.js` shows a one-time banner (dismissal remembered in `localStorage`) describing what's stored: the Supabase auth session, and preferences like the dark-mode choice. No analytics or advertising cookies are set by this app.
- **⚠️ Oxygene 1 font licensing** — `fonts/oxygene-1.ttf` is © Jakob Fischer (pizzadude.dk) and its bundled license (`fonts/oxygene-1-LICENSE.txt`) says **non-commercial use only** and **"do not distribute without the author's permission"**. Serving it as a webfont from a public site is arguably distribution, so if this site is ever monetised — or if you want to be strictly safe — either email the author for permission or swap the `name-oxygene` shop item for an open-licensed display font. JetBrains Mono has no such restriction (SIL Open Font License).

## Notes

- **Keeping the free Supabase tier awake** — free-tier Supabase projects auto-pause after 7 days with no API activity. [`.github/workflows/supabase-keepalive.yml`](./.github/workflows/supabase-keepalive.yml) pings the REST API every 3 days via a scheduled GitHub Action (reads the URL/anon key straight from `js/supabase-config.js`, so it never needs editing) — set it and forget it. Also worth setting a spend cap in Supabase's billing settings so a traffic spike can never turn into a surprise bill.
- Since there's no backend, the in-app brute-force protection from the original Express version isn't present — Supabase Auth has its own built-in rate limiting instead.
- The one piece of server-side logic this app needs — banning/deleting accounts, which requires the `service_role` key — runs as a Supabase Edge Function (see "Real bans and account deletion" above) rather than a server you host. If you ever need more server-side logic (sending emails, webhooks, scheduled jobs), that's the same mechanism to reach for.
