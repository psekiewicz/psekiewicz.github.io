import { onAuthChange } from './auth.js';

document.addEventListener('DOMContentLoaded', () => {
  const nav = document.createElement('nav');
  nav.className = 'bottom-nav';
  nav.setAttribute('aria-label', 'Primary');
  document.body.appendChild(nav);
  document.body.classList.add('has-bottom-nav');

  onAuthChange((user) => render(nav, user));
});

function render(nav, user) {
  const path = window.location.pathname.split('/').pop() || 'index.html';
  const isActive = (file) => (path === file ? ' active' : '');

  const loginRedirect = '/login.html?next=' + encodeURIComponent('/' + path);
  const profileHref = user ? `/profile.html?user=${encodeURIComponent(user.id)}` : loginRedirect;
  const dashboardHref = user ? '/dashboard.html' : loginRedirect;
  const addHref = user ? '/dashboard.html?new=1' : loginRedirect;
  const isOwnProfile = user && path === 'profile.html' && new URLSearchParams(window.location.search).get('user') === user.id;

  nav.innerHTML = `
    <a class="bottom-nav-item${isActive('index.html')}" href="/index.html">
      <span class="bottom-nav-icon">🏠</span>
      <span>Home</span>
    </a>
    <a class="bottom-nav-item${isActive('rolls.html')}" href="/rolls.html">
      <span class="bottom-nav-icon">🎬</span>
      <span>Rolls</span>
    </a>
    <a class="bottom-nav-item bottom-nav-add" href="${addHref}" aria-label="Add project">
      <span class="bottom-nav-icon">+</span>
    </a>
    <a class="bottom-nav-item${isActive('dashboard.html')}" href="${dashboardHref}">
      <span class="bottom-nav-icon">📊</span>
      <span>Dashboard</span>
    </a>
    <a class="bottom-nav-item${isOwnProfile ? ' active' : ''}" href="${profileHref}">
      <span class="bottom-nav-icon">👤</span>
      <span>Profile</span>
    </a>
  `;
}
