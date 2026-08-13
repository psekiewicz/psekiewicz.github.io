import { icon } from './icons.js';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Non-fatal — the site works fine without the service worker,
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
