// Service worker for the installable PWA shell. Caches the static app shell
// (HTML/CSS/JS/icons) so the app opens instantly and works on a flaky
// connection — but never touches Supabase API/auth calls or any other
// cross-origin request, so account state and project data always stay live.
const CACHE_VERSION = 'showcase-shell-v10';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/projects.html',
  '/project.html',
  '/scrolls.html',
  '/profile.html',
  '/settings.html',
  '/admin.html',
  '/login.html',
  '/register.html',
  '/dashboard.html',
  '/shop.html',
  '/leaderboard.html',
  '/404.html',
  '/css/style.css',
  '/js/achievements.js',
  '/js/admin-data.js',
  '/js/auth.js',
  '/js/bottom-nav.js',
  '/js/comments-data.js',
  '/js/cookie-consent.js',
  '/js/feed-rank.js',
  '/js/follows-data.js',
  '/js/icons.js',
  '/js/levels.js',
  '/js/likes-data.js',
  '/js/nav.js',
  '/js/notifications-data.js',
  '/js/notifications-ui.js',
  '/js/points-data.js',
  '/js/profiles-data.js',
  '/js/progress-watch.js',
  '/js/projects-data.js',
  '/js/pwa.js',
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

  // Page navigations always go network-first (bypassing the HTTP cache, not
  // just the Cache Storage): serving a possibly-stale cached shell first is
  // exactly what made deploys look like they "didn't update" — worse on
  // Firefox, which caches plain fetch() responses more aggressively than
  // Chrome does for this kind of request, so a stale copy could keep
  // re-confirming itself as "fresh" indefinitely.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
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
    const shell = await cache.match('/index.html');
    if (shell) return shell;
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);

  // cache: 'no-store' forces this past the browser's own HTTP cache, not
  // just the service worker's Cache Storage — without it, this "network"
  // fetch could itself be satisfied from a stale HTTP cache entry and we'd
  // just re-confirm the same old bytes into Cache Storage forever.
  const networkFetch = fetch(request, { cache: 'no-store' })
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  // Serve the cached asset instantly if we have it, and let the network
  // response quietly refresh the cache for next time. Only wait on the
  // network when there's nothing cached yet.
  if (cached) {
    networkFetch;
    return cached;
  }

  const networkResponse = await networkFetch;
  if (networkResponse) return networkResponse;
  return new Response('Offline', { status: 503, statusText: 'Offline' });
}
