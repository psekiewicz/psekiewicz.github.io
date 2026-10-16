# XOXD (psekiewicz.github.io)

A professional, multi-page website for publishing and discovering projects, with a full working authentication system - built to run entirely as static files on GitHub Pages.

Your previous personal site (home/blog/about/projects) has been preserved on the [`legacy-personal-site`](https://github.com/psekiewicz/psekiewicz.github.io/tree/legacy-personal-site) branch, in case you want to bring any of it back.

## Why Supabase

GitHub Pages only serves static files - there's no server to run session logic, hash passwords, or enforce "only the owner can edit their project." This site uses **Supabase Authentication** (real accounts, real password security, backed by Postgres) and **Supabase's Postgres database with Row Level Security (RLS)** so that authentication and authorization are still genuinely enforced - just by Supabase's servers instead of a server you'd have to run yourself.

## One-time setup (required before login will work)

The site is fully built. The repo ships with the config of the live XOXD Supabase project; to run your own copy, complete these steps and swap in your own values (until then your copy talks to the XOXD project, not yours).

1. **Create a Supabase project** - go to [supabase.com/dashboard](https://supabase.com/dashboard), click "New project" (the free tier is enough for this).
2. **Create the database tables and security policies** - open the project's *SQL Editor*, paste in everything from [`schema.sql`](./schema.sql) in this repo, and click **Run**. This creates the `projects`, `profiles`, `follows`, `comments`, `likes`, and `project_views` tables and the RLS policies that actually enforce ownership (only you can edit/delete your projects), draft privacy (only you can see your unpublished projects), "you can only follow/unfollow as yourself", "anyone signed in can comment, but only the comment's author, the project's owner, or an admin can delete it", "anyone signed in can like/unlike as themselves", and "only a project's owner (or an admin) can read its raw view log" - it's not optional. The whole file is safe to re-run any time you pull an update that adds to it.
3. **Get your project's API values** - go to *Project Settings* (gear icon) → *API*. Copy the **Project URL** and the **`anon` `public`** key (never the `service_role` key - that one must never appear in client-side code).
4. **Paste your config** - put those two values into [`js/supabase-config.js`](./js/supabase-config.js), replacing the `REPLACE_WITH_...` placeholders. These values are safe to publish in client-side code - they identify your project, they aren't secret keys (the RLS policies in `schema.sql` are what actually protect your data).
5. **Commit and push** the updated `js/supabase-config.js`. GitHub Pages will redeploy automatically within a minute or two.

Email confirmation is enabled by default on new Supabase projects. If you'd rather let people log in immediately after registering (no confirmation email), go to *Authentication → Providers → Email* and turn off "Confirm email" - fine for a personal/demo site, worth keeping on for anything public-facing.

That's it - no server to host, no environment variables, no backend to keep running.

### Making an account admin

There's deliberately no button anywhere in the app for this - granting the admin role is something only you, from the Supabase SQL Editor, should be able to do. After the person has registered an account, run (with their email filled in):

```sql
update public.profiles set is_admin = true
where id = (select id from auth.users where email = 'you@example.com');
```

They'll see an "Admin" link appear in the nav (desktop: next to Home/Projects/Demos; mobile: in the hamburger menu) next time they load the site, leading to `admin.html`.

### Real bans and account deletion (Supabase Edge Function)

Banning a user (so they genuinely can't log in) and deleting an account both require Supabase's **Admin API**, which only works with the `service_role` key - a key that must never exist in this repo or any other client-side code, because it grants full access to your entire database, bypassing every RLS policy. There is no safe way to do a real ban or delete from a static site alone.

The fix is a tiny **Supabase Edge Function** - server-side code that Supabase hosts for you (not GitHub Pages), where the `service_role` key can live safely as a secret. It's already written, at [`supabase/functions/admin-actions/index.ts`](./supabase/functions/admin-actions/index.ts); you just need to deploy it once:

1. **Install the Supabase CLI** - `npm install -g supabase` (or see [supabase.com/docs/guides/cli](https://supabase.com/docs/guides/cli) for other install methods).
2. **Log in and link this project to your Supabase project** - from the repo root:
   ```bash
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   ```
   Your project ref is the subdomain in your Project URL (`https://YOUR_PROJECT_REF.supabase.co`).
3. **Deploy the function**:
   ```bash
   supabase functions deploy admin-actions
   ```
4. That's it - no secrets to set manually. Supabase automatically provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as environment variables inside every deployed Edge Function; the function reads them from `Deno.env`, they're never in git.
5. **Re-run `schema.sql`** (see step 2 above) if you haven't already since the admin role was added - it adds `admin_list_users()`, which the Users tab in `admin.html` needs to show emails and ban status (neither of which live in the public `profiles` table).

Once deployed, the admin panel's Ban/Unban/Delete buttons and Settings' "Delete my account" button call this function. Everything else about the site (auth, projects, follows) is completely unaffected if you skip this - those features just won't work until you deploy it.

**What a ban actually does:** it sets `banned_until` on the Supabase Auth user (native support, not something this app invented) and Supabase rejects new logins/token refreshes for that account until it passes. A banned user's *already-issued* access token can keep working until it next needs to refresh (typically within an hour), since revoking a live token isn't something Supabase's ban exposes - this matches how bans normally behave against JWT-based auth.

### Uploads and compression (bucket, cleanup function, weekly ffmpeg)

Every picture field (avatar, cover, full-screen image, pictures in a post) and the media field still take a link, and each now also has an **Upload** button. The file is compressed on the device first and goes into the public `uploads` bucket; its URL is written into the field as if it had been pasted, so nothing that draws a post knows the difference.

- **On the device** - pictures are redrawn at no more than the size they are shown at (512 px for an avatar, 1600-1920 px otherwise) and saved as WebP, which also drops the camera's metadata. Clips (up to 60 s) are re-encoded to H.264 MP4 at no more than 720p: on the site with WebCodecs at a constant quality ([`js/compress.js`](./js/compress.js), through Mediabunny, falling back to a MediaRecorder in browsers without WebCodecs), in the app with the phone's hardware encoder ([`mobile/src/lib/upload.ts`](./mobile/src/lib/upload.ts)). Announcement attachments in `admin.html` go through the same compression.
- **The bucket** - `schema.sql` creates it with its own ceiling (the 300-file count is a function, `my_upload_count()`, rather than a subquery in the policy: a policy on `storage.objects` that reads `storage.objects` made every insert into Storage fail with "infinite recursion detected in policy" once another policy on that table held a subquery - which the audio guide's does), since the server can't check that compression happened: pictures and MP4/WebM only, at most 25 MB a file, 300 files a person, each person writing only into their own folder.
- **Cleanup** - files nothing refers to any more (a replaced picture, a deleted post, an upload whose form was never saved) are removed after a day by [`supabase/functions/upload-cleanup`](./supabase/functions/upload-cleanup/index.ts). Deploy it with `supabase functions deploy upload-cleanup --no-verify-jwt`, then run [`supabase/upload-cleanup.schedule.sql`](./supabase/upload-cleanup.schedule.sql) once (with your project ref filled in) to run it hourly.
- **Weekly ffmpeg pass** - the device's encoder is fast but not thorough, so once a week [`.github/workflows/media-optimize.yml`](./.github/workflows/media-optimize.yml) runs [`tools/media-optimize.mjs`](./tools/media-optimize.mjs) on every clip not yet in `media_optimized`: x264 on a slow preset at CRF 26, replacing the file in place when it comes out smaller (links stay the same). Until then a clip is cached for a day only; afterwards for a year. It needs the repository secret `SUPABASE_SERVICE_ROLE_KEY`; without it the job skips itself. It can also be run by hand from the Actions tab.

### Schema drift: keeping schema.sql the truth

`schema.sql` is meant to describe the whole database - run it and you have what is live. Two things break that: a change made in the SQL Editor and never written back here, and a change written here and never run there. Both had happened (a table and three functions only in the database, a table and a function only in this file), so there is a check:

```bash
SUPABASE_DB_URL=postgres://... node tools/schema-drift.mjs
```

It builds a scratch database from `schema.sql` on the local Postgres the RLS tests use, fingerprints that and the live database with `tools/schema-fingerprint.sql` (tables, columns, constraints, indexes, policies, functions and who may call them, triggers, views, grants, buckets) and lists every difference. [`.github/workflows/schema-drift.yml`](./.github/workflows/schema-drift.yml) runs it when `schema.sql` reaches `main` and every morning, once the repository secret `SUPABASE_DB_URL` exists; until then it skips itself. The check only reads the catalog, so give it a login that can do nothing else - in the SQL Editor:

```sql
create role schema_drift login password '<a long random password>';
grant usage on schema storage to schema_drift;
grant select on storage.buckets to schema_drift;
```

then set `SUPABASE_DB_URL` to the **Session pooler** connection string from the dashboard's *Connect* panel, with the user changed to `schema_drift.<project ref>` and that password. (GitHub's runners have no IPv6, which the direct connection needs.)

**This Supabase project is shared with the audio guide** (Audioprzewodnik, Wczasy Bez Kasy - `przewodnik/` is its privacy policy). Its objects - `user_ranks`, `has_rank()`, `admin_grant_rank()`/`admin_revoke_rank()`, the `przewodnik` bucket and its four storage policies - are recorded at the end of `schema.sql` so the drift check has nothing to explain away. XOXD uses none of them.

## Features

- **Real authentication** - Supabase Authentication handles registration, login, logout, and password reset ("Forgot your password?" on the login page).
- **Ownership-based authorization** - enforced server-side by Postgres Row Level Security policies, not just hidden in the UI: only a project's creator can edit, publish/unpublish, or delete it.
- **Multi-page frontend** - separate HTML documents for each view, not a single-page app. Navigation opts into **cross-document view transitions**, so the browser holds the old page on screen and cross-fades into the new one instead of flashing white; the navbar and bottom bar are named so they're matched across documents and held still rather than redrawn. A full document load still happens underneath - this changes how it looks, not what it does - and browsers without support just navigate normally.
- **Media that plays** - an entry carries a media link (`projects.media_url`) and `js/media.js` turns it into a player in the page and in the Demos feed: YouTube, Vimeo, Spotify, SoundCloud, or a direct audio/video/image URL. A user-supplied URL is **never** put into an iframe `src` - each provider is matched against an allowlist of hosts, the id extracted, and the embed URL rebuilt from a template here, so a link can't point an iframe wherever it likes. Content types are Music / Video / Image / App / Other; the type also acts as a hint, since plenty of image hosts serve without a file extension and sniffing alone would quietly fail on them.
- **Explore** - one search box over posts, tags and people (`projects.html`), type chips, and a tag filter every #tag on the site links into. The query lives in the URL, so a search can be shared. People are searched on the server (`searchProfiles()`), so anybody can be found; posts are searched within the newest 200.
- **Personal dashboard** - logged-in users manage their own projects (create, edit, publish/unpublish, delete).
- **Account settings** - edit display name, bio, avatar, and password (changing it requires re-entering the current one) from `settings.html`, plus a self-service "Delete my account" (type-to-confirm) that permanently removes your account and everything you published.
- **Profiles & followers** - every account has a public profile page (`profile.html?user=<id>`) listing their published work and follower/following counts; anyone signed in can follow/unfollow.
- **Demos** - a full-screen, swipeable feed of the published entries that have a live link, at `demos.html` (it replaced Scrolls; `/scrolls` now forwards there, and `scrolls?project=<id>` to that entry's page). Each card leads with the entry's clip or picture and puts **Try it**, Source and Details under it; the demo itself always opens in a new tab, never inside the site. Scrolling is the browser's own (CSS scroll snap); the page only manages what each card holds: the card on screen plays, the next one's clip is already loading, the ones either side of that have metadata only, and every other card holds just its poster - so a long feed costs no more memory than a short one. Arrow keys / J / K step one card, M toggles sound, the address follows the card on screen (`demos#<id>`, shareable), and the next page loads with three cards still to go. A 3-second dwell counts a view and marks the entry seen for the home feed's ranking. Uploaded clips get a poster frame saved beside them (`<name>.poster.webp`), shown until the clip has a frame of its own.
- **Look** - the same design system as the Android app (Bloom): warm cream ground, terracotta for anything you act on, sage as the second accent, soft rounded cards and pill buttons, set in JetBrains Mono like the app. Dark mode walks the same hues down a neutral ramp. Tokens live at the top of `css/style.css`; the social layout (sidebar, feed, posts, rail, Explore, profile, post page) is in `css/social.css`.
- **Dark mode** - a toggle in the navbar, remembered per-browser (`localStorage`), falling back to the OS theme when no explicit choice has been made.
- **Mobile bottom nav** - on narrow screens, a fixed bottom tab bar (Home / Demos / Add / Dashboard / Profile) mirrors the app-like navigation of TikTok/Instagram and fully replaces the top navbar's account menu there (which would otherwise overflow); the top navbar remains the primary nav on desktop. It renders **independently of the rest of the page**: it paints immediately from a `localStorage` snapshot of what it showed last time and only re-renders if the fresh account data actually differs, so tapping a tab no longer blanks the bar and rebuilds it. Auth and profile modules are imported dynamically rather than at the top, so the bar is never chained to the Supabase client loading - if that's slow or unreachable, the cached bar simply stays put.
- **Feed-first home** - `index.html` is the feed for everyone: For you (ranked by `js/feed-rank.js`), Following and Latest tabs, posts with inline like / save / share (`js/post-card.js`), and a right-hand rail with search, who to follow and trending tags (`js/feed-rail.js`). Signed-out visitors get a short welcome card above the posts instead of a marketing page. On desktop the navigation is a left sidebar; it is written into every page by `node tools/sync-nav.mjs`, so change it there rather than by hand. A post is drawn the way a timeline draws one - the avatar down the left, one column of content beside it, name and time on a single line, and flat actions spread underneath - and posts are full-bleed, told apart by a hairline rather than each boxed in its own card, matching [the Android app](./mobile/README.md). A post with no picture stays text rather than drawing a placeholder gradient; what kind of entry it is moves up beside the time instead.
- **Avatars everywhere** - not just the profile page: the navbar chip, the bottom nav's Profile tab, and every project card, scroll, and detail page show the author's actual photo (falling back to initials on a gradient when they haven't set one).
- **Outline icon set** - a small hand-built set of stroke-only ("no fill") SVG icons (`js/icons.js`) replaces emoji throughout the app: nav, bottom bar, theme toggle, feature cards, dashboard/admin row actions.
- **Admin panel** (`admin.html`) - accounts with `is_admin = true` get a moderation view of every project on the site (any user, any status, searchable) with unpublish/delete actions, and a searchable Users tab showing every account's email and ban status, with real Ban (for a chosen duration)/Unban/Delete-account actions. There's no in-app way to grant the admin role itself - see "Making an account admin" below. Ban/delete require the Edge Function described below; everything else works without it.
- **Content types** - every entry is tagged Music, Video, Image, App or Other, shown as an icon badge on every card and the detail page, and filterable on `projects.html`. These replaced the old project-shaped list (Website / Mobile App / Game / Design / Library) when the site became a place to find things rather than a portfolio; the migration in `schema.sql` folds the old values into the new ones.
- **Comments** - anyone signed in can comment on a project from its detail page; the comment's author, the project's owner, or an admin can delete it. Enforced by RLS in `schema.sql`, not just hidden buttons in the UI.
- **Likes** - a heart button on the detail page and in the feed; anyone signed in can like/unlike a project, counts are public. Backed by `js/likes-data.js` and the `likes` table. Pages read the count from `projects.likes_count` (and `comments_count`), which triggers keep as rows come and go: tallying like rows in the browser stopped at PostgREST's 1000-row cap.
- **View counts + analytics** - every project detail-page load logs a view (`log_project_view()`, works for signed-out visitors too) and bumps a public `views_count` shown next to the project. Demos counts a view too, but only once a card has stayed on screen for a full 3 seconds - a quick swipe past a card doesn't count, matching how the feed is meant to be skimmed vs. actually looked at. Your own views of your own entry never count, and a signed-in viewer counts once per entry per 6 hours rather than once per reload. A signed-out visitor counts once per entry per 6 hours too - by a one-way hash of their address made with a salt that changes daily, kept 6 hours and then deleted; the address itself is never stored - and however many visitors there are, at most 60 signed-out views per entry per hour count, so the public anon key cannot be used to inflate a counter or fill the database. The dashboard adds two charts built from that data: a 14-day views line chart and a per-project views bar chart (`js/views-data.js`).
- **Edit from anywhere** - a project's owner sees an Edit button on its detail page and on their own profile's project cards, both deep-linking to `dashboard.html?edit=<id>`, which opens the same edit modal used on the dashboard itself pre-filled with that project - one edit UI, reachable from three places.
- **Date of birth and parental consent** - sign-up asks for a date of birth (under 13 is refused), and an account without one is sent to `age.html` to give it before anything else. A 13-15 year old's account can look around but cannot publish, comment, like, follow, save or report until a parent confirms it by email - see "Legal / compliance" below.
- **Cookie notice** - a dismissible banner (`js/cookie-consent.js`), shown once per browser via `localStorage`, explains that the site only uses essential cookies/local storage (session + preferences), no tracking or advertising.
- **Installable PWA** - the site ships a web app manifest (`manifest.webmanifest`) and a service worker (`sw.js`) that caches the static app shell (HTML/CSS/JS/icons) for instant loads and resilience on a flaky connection. On Chrome/Edge, an "Install app" button appears in the navbar once the browser decides the site is installable (`js/pwa.js`, listening for `beforeinstallprompt` - Firefox doesn't implement that event at all, so the button simply never appears there; that's a Firefox platform limitation, not a bug). Installing puts a real icon on the home screen/app list that opens in its own window, no browser chrome. Live data (auth, projects, comments, etc.) is never cached - the service worker only ever intercepts same-origin requests, so Supabase calls always go straight to the network and nothing goes stale or works "offline" in a way that would show outdated account state. Every same-origin request is network-first and revalidated (`cache: 'no-cache'`: the browser asks with the file's ETag and an unchanged file comes back as an empty 304), so a new deploy shows up on the very next load in every browser, not just Chrome; `js/pwa.js` also force-checks for a new `sw.js` on every load and reloads once automatically when a newer one takes over.
- **Achievements** - 21 badges computed client-side from data the app already has (published projects, likes/views received, comments posted, followers/following, account age, profile completeness, shop ownership) via `js/achievements.js`. A profile page shows the full grid of unlocked/locked badges; tapping any badge (works the same on mobile, unlike a hover tooltip) opens a modal explaining exactly how to earn it. The single best-earned badge also shows as a small icon next to the name on the profile header and in the navbar's own account chip.
- **Project updates (changelog)** - a project is something being made, so each one has a dated changelog: "v0.3 - added the editor". The owner posts an entry from the project page (`#updates`, form shown only to them); anyone who can see the project can read it; the owner or an admin can delete one; there is no edit, so a history stays a history. The newest entry shows on the project's post in the feed next to **Try it** (its live link) and **Source** (its repo). Stored in `project_updates` (see `schema.sql`): RLS checks the poster owns the project, `created_at` is the server's, posting is limited to 10 an hour and gated by the same age/consent check as everything else. Everything that reads it degrades quietly if `schema.sql` has not been re-run yet - cards just omit the line, and `js/reputation-data.js` falls back to the columns that always existed - so the code can ship before the database does. Two achievements go with it: **Shipper** (a published project with a live link or a video) and **Maintainer** (updates on 5 different days).
- **XP & levels** - every account has a level, shown as a "Lv 7" chip next to their name on their profile, in the navbar, on project cards and on every comment; the profile also gets a progress bar to the next level. XP comes from making plus reach: 25 for each published entry (the first 20 only), 10 for each *release* - a project update, counted once per project per day and again capped at the first 20, so keeping a project going pays but a script posting updates all day earns the same 200 XP at most - then distinct signed-in people who opened your entries (2 XP each), likes received (30), comments other people left you (15) and followers (60). Publishing pays less than a single like and stops paying after the twentieth entry, so it rewards posting without being worth farming; everything above it has to come from someone else. Your own comments pay nothing, self-likes are rejected by policy, and reloading your own entry doesn't register a view. **Points - the spendable currency - ignore publishing entirely** and come only from reach. The weights live in the `user_reputation` view in `schema.sql`, not in JS: the browser can't be the authority on what a like is worth, and one definition is what stops the level on a card disagreeing with the level on the profile. `js/levels.js` only turns that number into a level, on a quadratic curve (level *L* starts at 100·(*L*−1)² XP) so early levels come quickly and later ones stay meaningful. Levelling a whole page of authors is a single query against the view - it used to be four, plus a fifth for likes.
- **Create sheet** - on mobile the + tab no longer navigates to the dashboard: it rotates 45° into a close control and slides the **full project editor** up from the bottom (`js/create-sheet.js`) - every field the dashboard modal has, so there's never a reason to go elsewhere to finish. It stops short of the tab bar so the + stays visible and can close it again. Only local modules are imported statically; anything touching Supabase is pulled in on submit, so opening and filling the sheet never waits on the network.
- **Full-screen image per project** - Demos shows an entry full-screen and portrait, where a wide thumbnail crops badly, so a project can supply its own image just for that (`projects.scroll_image_url`), offered in both the create sheet and the dashboard editor with a live preview.
- **Open in Demos** - the page of an entry with a live link links straight to its own card via `demos#<id>`, which puts that entry first even when it is older than the first page.
- **Share** - every project has a Share control (detail page) using the native share sheet on phones via the Web Share API, falling back to copying the link with a toast. Both APIs need a user gesture, so `js/share.js` is only ever called from a click.
- **Share your stats card** - "Share stats card" on your own profile renders a `<canvas>` "wrapped"-style PNG (avatar, level, XP bar, published/followers/likes/viewers, top achievement) via `js/stats-card.js` and hands it to the native share sheet when it can carry a file, falling back to a download. Nothing is server-rendered - the card is drawn client-side from the same numbers already on the page, reading the live theme's CSS colour tokens so it matches light/dark mode, and re-drawn fresh every time so it's never stale. Own profile only, for the same reason the reach numbers themselves are: it's a card worth posting, not a stat line worth exposing about someone else. Equipped shop cosmetics show up on it too, through two complementary techniques picked per element after actually testing the alternatives, not by assumption. The background is captured with html2canvas (loaded lazily from esm.sh, the same no-build-step CDN pattern already used for `@supabase/supabase-js`) - it walks the real DOM and paints it primitive-by-primitive, so it correctly renders tiled patterns and the one image-based background that nothing else could. The avatar border and nickname effect instead read the *computed* CSS off a real, hidden element wearing the shop's own class and rebuild the visual with canvas's native gradient/shadow/stroke APIs: html2canvas renders `background-clip: text` gradient names as a flat color (a long-standing gap in that library) and renders plain box-shadow rings - 11 of the shop's 19 borders - as a solid disc covering the whole avatar instead of a ring, both real regressions found by testing rather than shipped blind. Either path needs no maintenance as the shop catalog grows, since neither hand-copies an item's definition. An earlier version tried rasterizing the real DOM into an image via an SVG `<foreignObject>` for pixel-exact fidelity everywhere, but any `<foreignObject>`-bearing SVG permanently taints a canvas it's drawn onto, unconditionally, which made the image un-exportable. The avatar photo itself (`avatarUrl` is any URL pasted into `settings.html` - not a Supabase Storage upload) often comes from a host that never sends CORS headers, which would otherwise make the card silently fall back to initials even when a real photo is set; a failed load retries once through images.weserv.nl, a free image proxy that always adds them, before giving up.
- **Following actually does something** - Projects has an "Everyone / People I follow" filter (shown only once you follow somebody), and the home feed's ranker boosts people you follow. Before this, following someone changed nothing about what you saw.
- **Finding people** - the leaderboard doubles as people discovery: search by name, and Follow/Unfollow inline without leaving the list. Ranks stay absolute while searching, so filtering never tells you someone is #1 when they're #23.
- **Link previews** - every page carries Open Graph and Twitter card tags with a generated 1200×630 preview image, so a shared link renders as a card instead of a bare URL. Note the limit of static hosting: previews are site-level, not per-project - crawlers don't run the JavaScript that fills a project page in, so per-project preview cards would need server-side rendering.
- **Notifications** - a bell in the navbar with an unread count, listing new followers, likes and comments on your projects, and new work from people you follow: an entry they publish (once per entry, however often it is taken down and put back) and their changelog updates (one unread per project). Rows are written entirely by database triggers, never by the client: the person who causes a notification is never the person who receives it, so "you may insert this row" can't be expressed as an RLS policy the actor could satisfy. The trigger functions are `security definer` and work out the recipient themselves; `notifications` has select/update/delete policies for its own owner and **no insert policy at all**, so a forged notification is rejected by Postgres. Self-actions (liking your own project) notify nobody, and an identical notification that's still unread isn't duplicated - otherwise unliking and re-liking would pile them up. The [mobile app](./mobile/README.md#notifications) reads the same table: a background task checks for new rows about every 15 minutes and shows them as local notifications, so no push service is involved. The old Expo push path (`send_push()` and `push_tokens`) is gone from the database and from `schema.sql`.
- **Leaderboard** - `leaderboard.html` ranks the top 50 accounts by XP (ranked by the server, out of everyone - it used to sort the 200 oldest accounts in the browser), showing each one's avatar (with their equipped border), name (with their equipped effect), level and total XP, with medals for the podium and your own row highlighted. If you're outside the top 50 your standing is appended underneath rather than left a mystery. Accounts with no XP at all are filtered out so the table isn't padded with identical Lv 1 rows.
- **Saves** - a private shelf. A discovery app's job is putting something in front of you that you weren't looking for, and until now there was nowhere to put it if you couldn't watch it right then. `saves` has no public read policy, no count anywhere in the UI, and saving something earns its author nothing - the moment it pays, it stops being a shelf and becomes another number to farm. The list lives on the dashboard and reads through the projects table's own RLS, so anything unpublished or deleted since simply isn't returned.
- **Reports & the moderation queue** - `admin.html` could already unpublish and delete, but nothing told an admin where to look. Any signed-in user can report an entry that isn't their own (reason + optional note); ordinary users can file and nothing else - there is deliberately **no select policy**, because being able to read your own reports means being able to check whether one landed and re-file until it does. One report per person per entry, enforced by a unique index. The admin queue is one row per reported *entry* with its report count, not one row per report, and closing it closes every open report on that entry at once.
- **Rate limits** - everything cheap to do and expensive to receive is capped per account per hour: 20 comments, 15 entries, 120 likes, 60 follows, 20 reports. RLS has nothing to say about volume - it only ever answers "may this row exist", never "how many of these in the last hour" - so these are `BEFORE INSERT` triggers. They count attempts, not surviving rows: every insert the limit lets through leaves an event in `rate_limit_events`, and deleting the row does not take the event back, so liking and unliking (or following and unfollowing) in a loop runs into the cap like anything else. The counting runs through a `security definer` helper (`rate_limit_take()` - no client can read the events), while the role check stays *outside* it: inside a definer function `current_user` is the function's owner, so a check for `authenticated` there is always false. The first version of this made exactly that mistake and accepted 25 comments against a limit of 20. The numbers live inside the helper, which takes nothing from its caller but the action: signed-in users can call it straight through the API, and a version that took the window as an argument let a window of zero wipe a person's history.
- **Points are earned by reach** - points arrive on their own as other people find your work: 1 per distinct viewer, 5 per like, 3 per comment someone leaves you, 10 per follower. `collect_earnings()` (`security definer`) re-derives the figure from the `user_reputation` view and pays out the difference against a high-water mark stored in `profiles.points_earned_total`, so it pays exactly once per thing earned, a withdrawn like never claws back points you may already have spent, and re-earning it doesn't pay twice. `js/progress-watch.js` calls it on every progress check, so the payout lands whichever page you're on and toasts itself.
- **Sets** - six themed packs (Puppy, Summer, Winter, Terminal, Retro, Paper): a background, an avatar border and a nickname effect drawn to go together, sold for less than the three separately. A set owns no cosmetics of its own - `shop_bundle_items` is a list of item ids - so buying one is exactly the same as buying its members, and an item can sit in more than one set. `purchase_bundle()` **pro-rates the price against what you already own**, charging the set's share of the members still missing: without that, buying the Winter set after already owning Ice would charge full price for two items, which makes a set a worse deal than buying the rest of it piece by piece. A shop that punishes people for having shopped there before is a bug, not a pricing strategy. The set card previews all three pieces arranged the way they sit on a profile.
- **Points & Shop** - on your own profile, each unlocked achievement has a "Claim +N pts" button; claiming calls `claim_achievement()` in `schema.sql`, which independently re-checks eligibility against the real tables (it doesn't trust the client) and pays out the reward exactly once. Points are spent at `shop.html` on purely cosmetic profile items - **26 of them**: 9 profile backgrounds, 8 avatar frames and 9 nickname effects (`js/shop-items.js` is the catalog). Almost every one is a picture - rendered by `tools/gen-shop-art.py` into `assets/shop/`, animated WebP where the item moves (the exceptions are the hand-made Blocks and Blue Flame art and the Oxygene 1 typeface) - and rarity follows the price (common, rare, epic). The 32 items that used to be sold are retired, not deleted: they stay in `shop_item_defs` and in people's `owned_items`, and wherever one is equipped it is drawn as its replacement (`RETIRED_ALIASES`) - bought via `purchase_item()`, which owns the real price list the same way. Adding one is a price row in `shop_item_defs`, a line in the catalog and a single CSS rule; nothing else knows the list exists. The balance check and the charge are a single statement, so two purchases fired at once cannot both spend the same points. Buying is separate from equipping: owned items sit in your inventory until you Equip one per category, backed by `profiles.equipped_bg`/`equipped_border`/`equipped_name_effect` and a trigger that reverts any attempt to equip an item you don't own. Equipped effects show on your profile page (background behind the header, ring around your avatar, styled name) and - border + name effect - in the navbar's account chip too. All but two are pure CSS - gradients, repeating patterns, masked conic rings, clipped text, keyframes - so they cost nothing to download and adapt to light/dark on their own; the two image-based ones live in `assets/shop/`. The three borders that need a moving or gradient ring (Orbit, Spectrum Spin, Halo) use the same pseudo-element trick as Blue Flame, and Spectrum Spin masks a conic gradient into a ring because a `box-shadow` cannot hold a gradient at all. The "Blue Flame" avatar frame is the one item that can't be a `box-shadow` ring like the others - it's artwork that has to sit *around* the avatar, drawn as an oversized pseudo-element sized in percentages of the avatar so a single rule works from the 26px navbar chip up to the 96px profile header. Framed avatars switch to `overflow: visible` (which would otherwise clip the frame) and get their circular crop from `border-radius` on the image instead.
- **Animated throughout** - the mobile hamburger morphs into an X and the nav dropdown slides open instead of snapping; every modal/drawer (new/edit project, followers list) fades and scales in instead of popping; the login/register card and error/success alerts fade in; liking a project pops the heart icon; buttons lift slightly on hover; new cards and table rows fade in as they render. Everything respects `prefers-reduced-motion` and collapses to near-instant for anyone who's asked their OS for less motion.

## Tech stack

- **Hosting:** GitHub Pages (static files only, served from the `main` branch root)
- **Auth + data:** Supabase Authentication + Postgres, called directly from the browser via the `@supabase/supabase-js` client (loaded from the esm.sh CDN at an exact version - see `js/supabase-init.js` - no build step, no `npm install` required to run the site)
- **Frontend:** plain HTML/CSS/vanilla JS (ES modules)
- **Typography:** [JetBrains Mono](https://www.jetbrains.com/lp/mono/) (OFL-licensed) throughout, self-hosted from `fonts/` rather than the Google Fonts CDN - that keeps it in the service worker's app-shell cache and avoids a third-party request on every page load. Only the `latin` and `latin-ext` subsets are shipped (~43 KB total); `latin-ext` is what carries the Polish diacritics.

## Local development

No build step or server is required - any static file server works:

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

(Auth/data calls will fail locally too until `js/supabase-config.js` has your real project's values.)

## Tests

Three suites, all via Node's built-in test runner:

```bash
npm test            # unit tests over the pure-logic JS modules - no setup needed
npm run test:rls    # integration tests over schema.sql's RLS policies - needs a local Postgres
npm run test:smoke  # every page in a real browser, signed out and signed in - needs Chromium
npm run test:all    # all three
```

`npm test` covers `js/levels.js`, `js/utils.js`, `js/icons.js`, `js/feed-rank.js` and `js/media.js` - things like the XP curve, HTML/URL escaping, and the home feed's anti-bunching logic - and `tests/parity.test.js`, which holds the app's copies of the achievement list and the shop catalog to the site's (they had drifted: the app was two achievements short). It has no dependencies and needs nothing running.

`npm run test:smoke` (in `tests/smoke/`) serves this checkout the way GitHub Pages does and loads every `.html` page in Chromium, signed out and signed in, failing on an uncaught exception, a console error, a file of ours that does not load, or a page that shows "Could not load ...". The esm.sh Supabase client is answered with `tests/smoke/fake-supabase.js`, a small in-memory database, so nothing touches the real project and no other outside request is needed. Pages are found, not listed, so a new page is covered on its own. Run `npx playwright-core install chromium` once first, or point `SMOKE_CHROMIUM` at a Chromium binary.

`npm run test:rls` (in `tests/integration/`) exercises the actual Row Level Security policies in `schema.sql` - draft privacy, "only the owner can edit/delete", "only as yourself", comment/like/follow rules, the points-integrity RPCs (`log_project_view`, `claim_achievement`, `purchase_item`, `collect_earnings` - including two calls racing on separate connections), the age and parental-consent gate, and that `created_at` is always the server's - against a real local Postgres, since none of that can be verified from JS alone. It needs `TEST_DATABASE_URL` (defaults to `postgres://postgres:postgres@127.0.0.1:5432/postgres`) pointing at an empty Postgres instance; it creates its own scratch database (`showcase_rls_test`) there each run and never touches a real Supabase project. If it can't connect, every test is skipped with an explanation instead of failing. `tests/integration/sql/stub-supabase.sql` stands in for the pieces of a real Supabase project that `schema.sql` assumes exist (the `auth` schema, `auth.uid()`, and the `anon`/`authenticated`/`service_role` roles).

CI runs all three, against a `postgres:16` service container (see `.github/workflows/tests.yml`). The integration suite also checks the catalogs the site shows against the tables that pay out (`achievement_defs`, `shop_item_defs`).

## Project structure

```
index.html            Home - the feed (For you / Following / Latest), with a welcome card for signed-out visitors
age.html              Asks an account with no date of birth for one; for a 13-15 year old, asks for a parent's email
consent.html          Where the link in a parent's email lands - confirms the account only when the button is pressed
legal/                Terms of Service, Privacy Policy, Community Guidelines - generated, see tools/build-legal.mjs
projects.html         Public gallery - search + tag filter over published projects
project.html           Single project detail (?id=<row uuid>)
demos.html              Full-screen swipeable feed of entries with a live link (scrolls.html only forwards here)
profile.html            Public profile (?user=<uuid>) - bio, stats, follow button, achievements, their published projects
leaderboard.html        Public - top 50 accounts by XP
shop.html               Protected - spend points on profile backgrounds, avatar borders, and nickname effects
settings.html           Protected - edit display name/bio/avatar, change password (requires current password), delete own account
admin.html               Protected + admin-gated - search/moderate every project and account on the site
login.html             Email/password login + "forgot password"
register.html          Account creation
dashboard.html         Protected - create/edit/publish/delete your own projects
404.html                GitHub Pages' custom not-found page
robots.txt              Crawler rules - allows public pages, disallows the protected/auth-gated ones
sitemap.xml             Lists the public, statically-linkable pages for search engines
css/style.css          Shared design system (dark theme tokens, bottom nav, the Demos feed, profile, admin styles)
js/supabase-config.js  Your Supabase project's public URL + anon key - EDIT THIS
js/supabase-init.js     Initializes the Supabase client, exports `supabase`
js/auth.js               register/login/logout/reset-password/change-password, wraps Supabase Auth errors in plain-English messages
js/projects-data.js      All reads/writes for the `projects` table
js/profiles-data.js      Read/update the `profiles` table; batch-fetch profiles by id for author avatars
js/follows-data.js       Follow/unfollow, follower/following counts and lists
js/comments-data.js      getComments/addComment/deleteComment/getCommentCounts for the `comments` table
js/likes-data.js         getLikeCounts/getLikedSet/likeProject/unlikeProject for the `likes` table
js/views-data.js         logProjectView() (via the log_project_view() RPC) + getRecentViewTimestamps() for the dashboard charts
js/achievements.js       Achievement definitions (incl. display-only `reward` copy) + getUserStats()/computeAchievements()/getTopAchievement(), computed client-side from existing data
js/feed-rank.js          Home feed ranking - engagement/recency scoring, weighted shuffle, seen-tracking and author spacing
js/toast.js              Reward toast stack (achievement / level-up / XP / points earned)
js/progress-watch.js     Notices new achievements, level-ups and XP gains and toasts them; also records unlocks so they become permanent.
                         Re-checks on tab focus and via refreshProgress() after anything that changes your own XP, so a reward doesn't wait for the next navigation
js/media.js              Turns a pasted link into an embedded player; host-allowlisted, ids rebuilt into the embed URL
js/levels.js             The level curve and chip: levelFromXp()/levelFromStats()/levelChipHtml(), plus getLevelsForUsers() to level a whole page of authors in one query. The xp number itself comes from the server
js/updates-data.js       A project's changelog: getUpdates(), getLatestUpdates() for a page of cards, addUpdate(), deleteUpdate()
js/reputation-data.js    The user_reputation view (viewers/likes/comments received/followers → xp + lifetime points) and collectEarnings(), the RPC that pays reach out as spendable points
js/notifications-data.js Read/count/mark-read for your own notifications (RLS scopes them to you)
js/notifications-ui.js   Navbar bell, unread badge and dropdown panel, injected rather than written into every page
js/points-data.js        getAchievementRecords() (permanently-earned vs already-claimed) + recordAchievementUnlock() and claimAchievement(), both server-verified RPCs
js/shop-items.js         The shop's item catalog (backgrounds/borders/name effects) + effectClass() mapping an item id to its CSS class - display-only copy of the real prices in purchase_item()
js/create-sheet.js       Bottom-sheet quick create (mobile + tab), incl. the full-screen image
js/scroll-styles.js     Picks which image a full-screen Demos card uses
js/share.js              Web Share API with a clipboard fallback
js/stats-card.js         Draws the shareable stats-card PNG on a canvas and shares/downloads it
js/shop-data.js          getOwnedItemIds() + purchaseItem() (calls purchase_item()) + equipItem() for the three cosmetic slots on `profiles`
js/admin-data.js         isAdmin() check, admin_list_users() RPC wrapper, and the ban/unban/delete-account calls into the admin-actions Edge Function
js/icons.js               Outline SVG icon set shared by every page
js/theme.js               Dark mode toggle + localStorage persistence
js/bottom-nav.js          Injects the mobile bottom tab bar, auth-aware, shows the signed-in user's real avatar
js/nav.js                 Shared top navbar: auth-aware links + avatar, admin link, mobile menu toggle
js/cookie-consent.js      One-time dismissible cookie notice banner, shown on every page
js/pwa.js                 Registers sw.js; shows the "Install app" button when the browser fires beforeinstallprompt
js/utils.js               escapeHtml / initials / avatarHtml / timeAgo / typeBadgeHtml helpers + PROJECT_TYPES metadata
sw.js                    Service worker - caches the static app shell, always passes Supabase/cross-origin requests straight through
manifest.webmanifest     Web app manifest - name, icons, standalone display, required for installability
icons/                   PWA icons (192/512/maskable/apple-touch-icon) and the social preview, generated from the XOXD logo by tools/gen-brand.py
assets/brand/            The XOXD logo - xoxd-logo.png (source) and xoxd.svg (traced vector); tools/gen-brand.py renders it into icons/ and mobile/assets/, and tools/sync-nav.mjs / js/stats-card.js / mobile BrandMark embed its path
assets/shop/             The shop artwork - bg/ (800x240 backgrounds), border/ (240x240 transparent avatar frames), name/ (nickname fills); generated by tools/gen-shop-art.py, previewed with tools/shop-gallery.mjs
fonts/                   Self-hosted webfonts - JetBrains Mono (latin + latin-ext subsets) for the whole UI, plus Oxygene 1 for the shop's nickname effect of the same name (see the licensing note under "Legal / compliance")
schema.sql              Table definitions + Row Level Security policies - run in the Supabase SQL Editor (see setup above)
supabase/functions/admin-actions/index.ts   Edge Function for real ban/unban/account deletion - see "Real bans and account deletion" above
supabase/functions/upload-cleanup/index.ts  Edge Function that deletes uploads nothing refers to - see "Uploads and compression" above
js/compress.js            Compresses pictures (WebP) and clips (WebCodecs/MediaRecorder -> MP4) on the device before upload
js/uploads-data.js        uploadMedia(): compress, then put the file in the uploads bucket and return its public URL
js/upload-field.js        attachUpload(): the Upload button under a link field; pickAndUpload() for pictures inside a post
tools/media-optimize.mjs  The weekly ffmpeg pass over uploaded clips (.github/workflows/media-optimize.yml)
tools/schema-drift.mjs    Compares the live database with schema.sql (.github/workflows/schema-drift.yml)
tools/schema-fingerprint.sql  The catalog query both sides of that comparison run
tests/smoke/              Every page in Chromium against an in-memory fake of Supabase (npm run test:smoke)
```

## Data model

Postgres table `public.projects`, one row per project:

| Column         | Type                | Notes                                             |
| -------------- | ------------------- | -------------------------------------------------- |
| `user_id`      | uuid                 | Owner - references `auth.users(id)`, set once, never changed |
| `author_name`  | text                 | Display name snapshot at creation time             |
| `title`        | text (3–100 chars)   |                                                     |
| `summary`      | text                 | Short one-liner shown on cards                     |
| `description`  | text                 | Full write-up shown on the detail page             |
| `image_url`, `repo_url`, `live_url` | text  | All optional                                       |
| `tags`         | text[]               | Up to 10, enforced client-side                     |
| `project_type` | text                 | One of `music`, `video`, `image`, `app`, `other` - defaults to `other` |
| `views_count`  | integer              | Public running total, only ever incremented via `log_project_view()` |
| `likes_count`, `comments_count` | integer | Kept by triggers on `likes`/`comments`; pinned against client writes like `views_count` |
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
| `is_admin`     | boolean    | Grants access to `admin.html`; only settable via direct SQL (see "Making an account admin" above) - guarded by a trigger so the app itself can never set it |
| `points`       | integer    | Shop currency; only ever changed by `claim_achievement()`/`purchase_item()`/`collect_earnings()`. Protected by the `profiles_guard_client_writes` trigger, which pins the column back to its stored value on any write by the `authenticated`/`anon` role. This replaced a column-level `REVOKE UPDATE`, which never worked: a table-level `UPDATE` grant covers every column and revoking one back does not override it |
| `points_earned_total` | integer | High-water mark of what `collect_earnings()` has already paid out, so a withdrawn like never claws back spent points and re-earning it never pays twice. Pinned by the same trigger - left writable, setting it negative would make the next collect print money |
| `equipped_bg`, `equipped_border`, `equipped_name_effect` | text | Currently-equipped shop item id per cosmetic slot, or `'none'`; a trigger reverts any value that isn't `'none'` and isn't in `owned_items` for that user |
| `created_at`   | timestamptz | Defaults to `now()`                                  |

This exists because `auth.users` itself is never queryable from the browser - profile pages, follower lists, and anything showing *other* people's info reads from `profiles` instead. Each project also keeps its own `author_name` snapshot so project cards don't need an extra join.

The one exception is the admin Users tab, which does need email addresses and ban status (both live only on `auth.users`, deliberately never copied into the public `profiles` table). `admin_list_users()` is a `security definer` Postgres function that reads `auth.users` and returns rows *only* if the caller is already an admin - the safety check lives in the function itself, not in a table policy.

Postgres table `public.follows`, one row per follow relationship:

| Column         | Type        | Notes                                    |
| -------------- | ----------- | ------------------------------------------ |
| `follower_id`  | uuid        | The person doing the following             |
| `following_id` | uuid        | The person being followed                  |
| `created_at`   | timestamptz | Defaults to `now()`                        |

Primary key is `(follower_id, following_id)`, so a given follow relationship can only exist once. Follower/following counts are just row counts - computed client-side via `js/follows-data.js`, no denormalized counter columns to keep in sync.

Postgres table `public.comments`, one row per comment:

| Column        | Type        | Notes                                              |
| ------------- | ----------- | ---------------------------------------------------- |
| `project_id`  | uuid        | References `projects(id)`, cascade-deletes with the project |
| `user_id`     | uuid        | Comment author - references `auth.users(id)`         |
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

Only ever written through `log_project_view(project_id)`, a `security definer` RPC that both inserts the log row and increments `projects.views_count` - that's what lets a signed-out visitor's view count at all, without granting public write access to the `projects`/`project_views` tables directly. It drops the owner's views of their own entry outright, and counts a signed-in viewer at most once per project per 6 hours. A signed-out visitor is told apart by a salted one-way hash of their address (`anon_view_marks`, kept 6 hours; the day's salt in `view_salts` is deleted the next day) and capped at 60 counted views per entry per hour; they count towards the public number and towards nothing else. The log carries a `viewer_id` for that deduplication, which is why **nothing can read this table any more** - an owner-readable policy would have turned the dashboard chart into a "who looked at your entry" list. The chart reads `my_view_timestamps(days)`, a `security definer` function that returns timestamps for your own projects and no ids.

Postgres table `public.unlocked_achievements`, one row per achievement a user has claimed:

| Column           | Type        | Notes                                    |
| ---------------- | ----------- | ------------------------------------------ |
| `user_id`        | uuid        | References `auth.users(id)`                |
| `achievement_id` | text        | One of the ids in `js/achievements.js`     |
| `claimed_at`     | timestamptz | Defaults to `now()`                        |

Primary key is `(user_id, achievement_id)`, so an achievement can only ever be claimed (and paid out) once. **Achievements are permanent**: a row is written by `record_achievement_unlock()` the moment one is first earned, so deleting the project (or losing the likes/followers) behind it doesn't take the badge away again - `computeAchievements()` treats an achievement as unlocked if the live stats qualify *or* a row exists. `claimed_at` is NULL for "earned but the reward hasn't been collected yet" and set once `claim_achievement()` pays out; that split is what lets the row exist from the moment of unlocking without the payout logic mistaking it for an already-paid claim, and it means you can still collect the reward for something you earned before deleting the project. Readable only by its own owner; there's no insert/update/delete policy at all - rows are only ever written by `claim_achievement()` (`security definer`), which looks up the achievement's metric/threshold/reward from `public.achievement_defs`, computes that metric for the caller via `achievement_metric()` (a small `case` over named metrics like `total_likes`/`follower_count`/`account_age_days`, each querying `projects`/`likes`/`comments`/`follows`/`profiles` directly rather than trusting a client-supplied stats object), and only then increments `profiles.points`. `achievement_defs` (id → metric, threshold, reward) is what makes adding a new achievement later just an `INSERT`, not a rewrite of `claim_achievement()` itself - it's publicly readable but only ever edited by hand in the SQL Editor.

Postgres table `public.owned_items`, one row per shop item a user has purchased:

| Column         | Type        | Notes                                    |
| -------------- | ----------- | ------------------------------------------ |
| `user_id`      | uuid        | References `auth.users(id)`                |
| `item_id`      | text        | One of the ids in `js/shop-items.js`       |
| `purchased_at` | timestamptz | Defaults to `now()`                        |

Primary key is `(user_id, item_id)`, so buying the same item twice is a no-op. Publicly readable (like `likes`/`follows`/`comments`) so the "Collector" achievement can be checked on anyone's profile, not just your own; there's no insert/update/delete policy - rows are only ever written by `purchase_item()` (`security definer`), which reads the price from `public.shop_item_defs` (id → price) and checks it against `profiles.points` before charging. Like `achievement_defs`, that table is what makes adding a shop item a one-line `INSERT` rather than a rewrite of `purchase_item()` - publicly readable, but only ever edited by hand in the SQL Editor.

## Legal / compliance

- **Age gate** - sign-up asks for a date of birth and sends it in the signup metadata, where `handle_new_user()` stores it in `account_ages` (never on the public `profiles`). Under 13 is refused by the database, not just the form. `consent_ok()` is what every write policy checks: an account with no date of birth cannot write until it gives one (`age.html` on the site, `BirthDateGate` in the app), and a 13-15 year old cannot write until a parent confirms. The date itself is self-reported - Supabase has no age verification to offer.
- **Parental consent** - the `parental-consent` Edge Function emails the parent a link to `consent.html` on the site, and only the button on that page confirms the account: mail scanners and link previews open links on their own, so opening one must not count. The request path allows one email per account every ten minutes and three a day. Deploy with `supabase functions deploy parental-consent --no-verify-jwt`, after setting `RESEND_API_KEY`, `CONSENT_FROM_EMAIL` and `PUBLIC_SITE_URL` (the site's address, e.g. `https://psekiewicz.github.io`) with `supabase secrets set`. Run `schema.sql` before deploying it - the function uses the `sends` columns it adds.
- **Terms, privacy policy, guidelines** - written once in `mobile/src/legal/documents.ts`, shown by the app's Legal screen and rendered into `legal/*.html` for the site by `node --experimental-strip-types tools/build-legal.mjs` (re-run it after changing the documents). The operator (Piotr Sękiewicz), the contact address and the governing law (Poland) are the three constants at the top of that file; the contact address is a personal one until XOXD has its own - change it there and rebuild. None of it was written by a lawyer: have it read by somebody qualified before relying on it.
- **Cookie notice** - `js/cookie-consent.js` shows a one-time banner (dismissal remembered in `localStorage`) describing what's stored: the Supabase auth session, and preferences like the dark-mode choice. No analytics or advertising cookies are set by this app.
- **⚠️ Oxygene 1 font licensing** - `fonts/oxygene-1.ttf` is © Jakob Fischer (pizzadude.dk) and its bundled license (`fonts/oxygene-1-LICENSE.txt`) says **non-commercial use only** and **"do not distribute without the author's permission"**. Serving it as a webfont from a public site is arguably distribution, so if this site is ever monetised - or if you want to be strictly safe - either email the author for permission or swap the `name-oxygene` shop item for an open-licensed display font. JetBrains Mono has no such restriction (SIL Open Font License).

## Notes

- **Keeping the free Supabase tier awake** - free-tier Supabase projects auto-pause after 7 days with no API activity. [`.github/workflows/supabase-keepalive.yml`](./.github/workflows/supabase-keepalive.yml) pings the REST API every 3 days via a scheduled GitHub Action (reads the URL/anon key straight from `js/supabase-config.js`, so it never needs editing) - set it and forget it. Also worth setting a spend cap in Supabase's billing settings so a traffic spike can never turn into a surprise bill.
- Since there's no backend, the in-app brute-force protection from the original Express version isn't present - Supabase Auth has its own built-in rate limiting instead.
- The one piece of server-side logic this app needs - banning/deleting accounts, which requires the `service_role` key - runs as a Supabase Edge Function (see "Real bans and account deletion" above) rather than a server you host. If you ever need more server-side logic (sending emails, webhooks, scheduled jobs), that's the same mechanism to reach for.
