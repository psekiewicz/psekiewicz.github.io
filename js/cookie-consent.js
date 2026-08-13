const STORAGE_KEY = 'cookie-consent';

document.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem(STORAGE_KEY)) return;

  const banner = document.createElement('div');
  banner.className = 'cookie-banner';
  banner.setAttribute('role', 'dialog');
  banner.setAttribute('aria-label', 'Cookie notice');
  banner.innerHTML = `
    <div class="cookie-banner-inner">
      <p>We use essential cookies and local storage to keep you signed in and remember your preferences, like dark mode. We don't use tracking or advertising cookies.</p>
      <button class="btn btn-primary" id="cookie-accept" type="button">Got it</button>
    </div>
  `;
  document.body.insertBefore(banner, document.body.firstChild);

  document.getElementById('cookie-accept').addEventListener('click', () => {
    localStorage.setItem(STORAGE_KEY, 'accepted');
    banner.remove();
  });
});
