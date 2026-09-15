if ('serviceWorker' in navigator) {
  // True only if this load was already controlled by a previously-installed
  // service worker - i.e. a returning visitor, not someone's very first
  // load. Used below to tell "a new version just took over" apart from
  // "the very first install just claimed this page", which would otherwise
  // also fire controllerchange and reload a first-time visitor for no reason.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloadedForUpdate = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloadedForUpdate) return;
    reloadedForUpdate = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        // registration.update() bypasses the HTTP cache for the script
        // itself - that part is mandated by spec and reliable everywhere,
        // unlike relying on the browser to notice sw.js changed on its own.
        // This is what actually surfaces a new deploy promptly on browsers
        // (Firefox included) that otherwise cache more aggressively than
        // Chrome does.
        registration.update().catch(() => {});
      })
      .catch(() => {
        // Non-fatal - the site works fine without the service worker,
        // it just won't be installable/offline-resilient.
      });
  });
}

// There is deliberately no "Install app" button in the page - it was one
// control too many in the navigation. The browser's own install option (its
// menu or address bar) still works, because the manifest and service worker
// above are unchanged.
