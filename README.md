# Showcase (psekiewicz.github.io)

A professional, multi-page website for publishing and discovering projects, with a full working authentication system — built to run entirely as static files on GitHub Pages.

Your previous personal site (home/blog/about/projects) has been preserved on the [`legacy-personal-site`](https://github.com/psekiewicz/psekiewicz.github.io/tree/legacy-personal-site) branch, in case you want to bring any of it back.

## Why Supabase

GitHub Pages only serves static files — there's no server to run session logic, hash passwords, or enforce "only the owner can edit their project." This site uses **Supabase Authentication** (real accounts, real password security, backed by Postgres) and **Supabase's Postgres database with Row Level Security (RLS)** so that authentication and authorization are still genuinely enforced — just by Supabase's servers instead of a server you'd have to run yourself.

## One-time setup (required before login will work)

The site is fully built, but it's pointed at a placeholder Supabase project. Until you complete these steps, register/login will fail.

1. **Create a Supabase project** — go to [supabase.com/dashboard](https://supabase.com/dashboard), click "New project" (the free tier is enough for this).
2. **Create the database table and security policies** — open the project's *SQL Editor*, paste in everything from [`schema.sql`](./schema.sql) in this repo, and click **Run**. This creates the `projects` table and the RLS policies that actually enforce ownership (only you can edit/delete your projects) and draft privacy (only you can see your unpublished projects) — it's not optional.
3. **Get your project's API values** — go to *Project Settings* (gear icon) → *API*. Copy the **Project URL** and the **`anon` `public`** key (never the `service_role` key — that one must never appear in client-side code).
4. **Paste your config** — put those two values into [`js/supabase-config.js`](./js/supabase-config.js), replacing the `REPLACE_WITH_...` placeholders. These values are safe to publish in client-side code — they identify your project, they aren't secret keys (the RLS policies in `schema.sql` are what actually protect your data).
5. **Commit and push** the updated `js/supabase-config.js`. GitHub Pages will redeploy automatically within a minute or two.

Email confirmation is enabled by default on new Supabase projects. If you'd rather let people log in immediately after registering (no confirmation email), go to *Authentication → Providers → Email* and turn off "Confirm email" — fine for a personal/demo site, worth keeping on for anything public-facing.

That's it — no server to host, no environment variables, no backend to keep running.

## Features

- **Real authentication** — Supabase Authentication handles registration, login, logout, and password reset ("Forgot your password?" on the login page).
- **Ownership-based authorization** — enforced server-side by Postgres Row Level Security policies, not just hidden in the UI: only a project's creator can edit, publish/unpublish, or delete it.
- **Multi-page frontend** — separate HTML documents for each view (home, project gallery, project detail, login, register, dashboard), not a single-page app.
- **Public gallery** — anyone can browse and search published projects by keyword or tag.
- **Personal dashboard** — logged-in users manage their own projects (create, edit, publish/unpublish, delete).

## Tech stack

- **Hosting:** GitHub Pages (static files only, served from the `main` branch root)
- **Auth + data:** Supabase Authentication + Postgres, called directly from the browser via the `@supabase/supabase-js` client (loaded from the esm.sh CDN, no build step, no `npm install` required to run the site)
- **Frontend:** plain HTML/CSS/vanilla JS (ES modules)

## Local development

No build step or server is required — any static file server works:

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

(Auth/data calls will fail locally too until `js/supabase-config.js` has your real project's values.)

## Project structure

```
index.html            Home page — hero + latest published projects
projects.html         Public gallery — search + tag filter over published projects
project.html           Single project detail (?id=<row uuid>)
login.html             Email/password login + "forgot password"
register.html          Account creation
dashboard.html         Protected — create/edit/publish/delete your own projects
404.html                GitHub Pages' custom not-found page
css/style.css          Shared design system
js/supabase-config.js  Your Supabase project's public URL + anon key — EDIT THIS
js/supabase-init.js     Initializes the Supabase client, exports `supabase`
js/auth.js               register/login/logout/reset-password, wraps Supabase Auth errors in plain-English messages
js/projects-data.js      All reads/writes for the `projects` table
js/nav.js                 Shared navbar: auth-aware links, mobile menu toggle
js/utils.js               escapeHtml / initials / timeAgo helpers
schema.sql              Table definition + Row Level Security policies — run in the Supabase SQL Editor (see setup above)
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
| `published`    | boolean              | Controls public visibility                          |
| `created_at`   | timestamptz          | Defaults to `now()`                                 |
| `updated_at`   | timestamptz          | Kept current by a trigger on every update           |

There's no separate "profiles" table — Supabase Auth already owns accounts (email, password, display name in `user_metadata`), and each project stores a snapshot of the author's display name so project cards don't need an extra lookup or a join against `auth.users` (which client code can't query directly anyway).

## Notes

- Since there's no backend, the in-app brute-force protection from the original Express version isn't present — Supabase Auth has its own built-in rate limiting instead.
- If you ever need real server-side logic again (e.g. sending emails, webhooks, scheduled jobs), Supabase Edge Functions is the natural next step and plugs into the same project without changing the frontend's data model.
