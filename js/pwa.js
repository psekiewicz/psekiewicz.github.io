import { icon } from './icons.js';

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

function isRunningInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event;
  showInstallButton();
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  hideInstallButton();
});

function showInstallButton() {
  if (isRunningInstalled()) return;
  const navRight = document.querySelector('.nav-right');
  if (!navRight || document.getElementById('pwa-install-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'pwa-install-btn';
  btn.type = 'button';
  btn.className = 'btn btn-ghost btn-sm pwa-install-btn';
  btn.innerHTML = `${icon('download', { size: 16 })} Install app`;
  btn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    btn.disabled = true;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    hideInstallButton();
  });

  navRight.insertBefore(btn, navRight.firstChild);
}

function hideInstallButton() {
  const btn = document.getElementById('pwa-install-btn');
  if (btn) btn.remove();
}
