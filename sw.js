// Service worker for the installable PWA shell. Caches the static app shell
// (HTML/CSS/JS/icons) so the app opens instantly and works on a flaky
// connection - but never touches Supabase API/auth calls or any other
// cross-origin request, so account state and project data always stay live.
const CACHE_VERSION = 'showcase-shell-v31';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/projects.html',
  '/project.html',
  '/scrolls',
  '/profile.html',
  '/settings.html',
  '/admin.html',
  '/login.html',
  '/register.html',
  '/dashboard.html',
  '/shop',
  '/leaderboard.html',
  '/404.html',
  '/css/style.css',
  '/css/social.css',
  '/js/achievements.js',
  '/js/admin-data.js',
  '/js/auth.js',
  '/js/bottom-nav.js',
  '/js/comments-data.js',
  '/js/cookie-consent.js',
  '/js/create-sheet.js',
  '/js/feed-rank.js',
  '/js/follows-data.js',
  '/js/icons.js',
  '/js/levels.js',
  '/js/media.js',
  '/js/likes-data.js',
  '/js/nav.js',
  '/js/notifications-data.js',
  '/js/notifications-ui.js',
  '/js/points-data.js',
  '/js/profiles-data.js',
  '/js/progress-watch.js',
  '/js/projects-data.js',
  '/js/reputation-data.js',
  '/js/pwa.js',
  '/js/reports-data.js',
  '/js/saves-data.js',
  '/js/scroll-styles.js',
  '/js/share.js',
  '/js/shop-data.js',
  '/js/shop-items.js',
  '/js/supabase-config.js',
  '/js/supabase-init.js',
  '/js/theme.js',
  '/js/toast.js',
  '/js/utils.js',
  '/js/views-data.js',
  '/assets/shop/bg-blocks.webp',
  '/assets/shop/border-flame.png',
  '/fonts/jetbrains-mono-latin.woff2',
  '/fonts/jetbrains-mono-latin-ext.woff2',
  '/fonts/oxygene-1.ttf',
  '/manifest.webmanifest',
  '/icons/social-preview.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Only ever handle same-origin requests. Supabase's REST/Auth calls, the
  // esm.sh CDN, and any user-supplied avatar/image URLs all go straight to
  // the network untouched.
  if (url.origin !== self.location.origin) return;

  // Everything same-origin goes network-first (bypassing the HTTP cache, not
  // just the Cache Storage), with the cache only as the offline fallback.
  //
  // Stylesheets and scripts used to be stale-while-revalidate. Pages were
  // already network-first, so right after a deploy a visitor got the new HTML
  // with the previous CSS and JS - a new navbar drawn with the old styles -
  // until a second reload. Serving all of them from the network together is
  // the only way a page and its assets can't come from different deploys.
  event.respondWith(networkFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const shell = await cache.match('/index.html');
      if (shell) return shell;
    }
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}
