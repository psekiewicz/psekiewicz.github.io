# Showcase (psekiewicz.github.io)

A professional, multi-page website for publishing and discovering projects, with a full working authentication system — built to run entirely as static files on GitHub Pages.

Your previous personal site (home/blog/about/projects) has been preserved on the [`legacy-personal-site`](https://github.com/psekiewicz/psekiewicz.github.io/tree/legacy-personal-site) branch, in case you want to bring any of it back.

## Why Firebase

GitHub Pages only serves static files — there's no server to run session logic, hash passwords, or enforce "only the owner can edit their project." This site uses **Firebase Authentication** (real accounts, real password security, handled by Google's infrastructure) and **Firestore** (a hosted database with its own server-side security rules) so that authentication and authorization are still genuinely enforced — just by Firebase's servers instead of a server you'd have to run yourself.

## One-time setup (required before login will work)

The site is fully built, but it's pointed at a placeholder Firebase project. Until you complete these steps, register/login will fail.

1. **Create a Firebase project** — go to [console.firebase.google.com](https://console.firebase.google.com), click "Add project" (the free Spark plan is enough for this).
2. **Enable email/password sign-in** — in the project, go to *Build → Authentication → Get started*, then enable the **Email/Password** provider.
3. **Create a Firestore database** — go to *Build → Firestore Database → Create database*. Choose **Production mode** and any nearby region.
4. **Apply the security rules** — open the *Rules* tab in Firestore, replace the contents with everything in [`firestore.rules`](./firestore.rules) from this repo, and click **Publish**. This is what actually enforces ownership (only you can edit/delete your projects) and draft privacy (only you can see your unpublished projects) — it's not optional.
5. **Register a web app** — in *Project settings* (gear icon) → *General* → "Your apps", click the web icon (`</>`) to add a web app. Firebase will show you a `firebaseConfig` object.
6. **Paste your config** — copy those values into [`js/firebase-config.js`](./js/firebase-config.js), replacing the `REPLACE_WITH_...` placeholders. These values are safe to publish in client-side code — they identify your project, they aren't secret keys (the Firestore rules are what actually protect your data).
7. **Commit and push** the updated `js/firebase-config.js`. GitHub Pages will redeploy automatically within a minute or two.

That's it — no server to host, no environment variables, no backend to keep running.

## Features

- **Real authentication** — Firebase Authentication handles registration, login, logout, and password reset ("Forgot your password?" on the login page).
- **Ownership-based authorization** — enforced server-side by Firestore security rules, not just hidden in the UI: only a project's creator can edit, publish/unpublish, or delete it.
- **Multi-page frontend** — separate HTML documents for each view (home, project gallery, project detail, login, register, dashboard), not a single-page app.
- **Public gallery** — anyone can browse and search published projects by keyword or tag.
- **Personal dashboard** — logged-in users manage their own projects (create, edit, publish/unpublish, delete).

## Tech stack

- **Hosting:** GitHub Pages (static files only, served from the `main` branch root)
- **Auth + data:** Firebase Authentication + Cloud Firestore, called directly from the browser via the Firebase JS SDK (loaded from Google's CDN, no build step, no `npm install` required to run the site)
- **Frontend:** plain HTML/CSS/vanilla JS (ES modules)

## Local development

No build step or server is required — any static file server works:

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

(Auth/data calls will fail locally too until `js/firebase-config.js` has your real project's values — Firebase project config isn't tied to a specific domain for read/write, only Auth's authorized-domains list matters, and `localhost` is allowed by default.)

## Project structure

```
index.html            Home page — hero + latest published projects
projects.html         Public gallery — search + tag filter over published projects
project.html           Single project detail (?id=<firestoreDocId>)
login.html             Email/password login + "forgot password"
register.html          Account creation
dashboard.html         Protected — create/edit/publish/delete your own projects
404.html                GitHub Pages' custom not-found page
css/style.css          Shared design system
js/firebase-config.js  Your Firebase project's public config — EDIT THIS
js/firebase-init.js     Initializes the Firebase app, exports `auth` and `db`
js/auth.js               register/login/logout/reset-password, wraps Firebase Auth errors in plain-English messages
js/projects-data.js      All Firestore reads/writes for the "projects" collection
js/nav.js                 Shared navbar: auth-aware links, mobile menu toggle
js/utils.js               escapeHtml / initials / timeAgo helpers
firestore.rules         Firestore security rules — paste into the Firebase console (see setup above)
```

## Data model

Firestore collection `projects`, one document per project:

| Field         | Type                | Notes                                             |
| ------------- | ------------------- | -------------------------------------------------- |
| `uid`         | string               | Owner's Firebase Auth UID — set once, never changed |
| `authorName`  | string               | Display name snapshot at creation time             |
| `title`       | string (3–100 chars) |                                                     |
| `summary`     | string               | Short one-liner shown on cards                     |
| `description` | string               | Full write-up shown on the detail page             |
| `imageUrl`, `repoUrl`, `liveUrl` | string  | All optional                                       |
| `tags`        | string[]             | Up to 10                                            |
| `published`   | boolean              | Controls public visibility                          |
| `createdAt`, `updatedAt` | Firestore Timestamp | Set via `serverTimestamp()`                 |

There's no separate "users" collection — Firebase Auth already owns accounts (email, password, display name), and each project stores a snapshot of the author's display name so project cards don't need an extra lookup.

## Notes

- Since there's no backend, `js/auth.js`'s in-app brute-force protection from the original Express version isn't present — Firebase Authentication has its own built-in rate limiting instead.
- If you ever need real server-side logic again (e.g. sending emails, webhooks), Firebase Cloud Functions is the natural next step and plugs into the same project without changing the frontend's data model.
