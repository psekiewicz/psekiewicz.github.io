// The one-time notice that the site keeps only essential data in the browser
// (the sign-in session and preferences such as dark mode). Dismissing it is
// remembered in localStorage; there are no tracking cookies to consent to.
const STORAGE_KEY = 'cookie-consent';

document.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem(STORAGE_KEY)) return;

  const banner = document.createElement('div');
  banner.className = 'cookie-banner';
  banner.setAttribute('role', 'dialog');
  banner.setAttribute('aria-label', 'Cookie notice');
  banner.innerHTML = `
    <div class="cookie-banner-inner">
      <p>We use essential cookies and local storage to keep you signed in and remember your preferences, like dark mode. XOXD sets no tracking or advertising cookies, though players embedded from YouTube and similar services may set their own. <a href="/legal/privacy">Privacy Policy</a></p>
      <button class="btn btn-primary" id="cookie-accept" type="button">Got it</button>
    </div>
  `;
  document.body.insertBefore(banner, document.body.firstChild);

  document.getElementById('cookie-accept').addEventListener('click', () => {
    localStorage.setItem(STORAGE_KEY, 'accepted');
    banner.remove();
  });
});
