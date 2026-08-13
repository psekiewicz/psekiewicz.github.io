import { onAuthChange } from './auth.js';
import { getProfile } from './profiles-data.js';
import { icon } from './icons.js';
import { escapeHtml, initials } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
  const nav = document.createElement('nav');
  nav.className = 'bottom-nav';
  nav.setAttribute('aria-label', 'Primary');
  document.body.appendChild(nav);
  document.body.classList.add('has-bottom-nav');

  onAuthChange((user) => render(nav, user));
});

async function profileIconFor(user) {
  if (!user) return icon('user', { size: 20 });
  try {
    const profile = await getProfile(user.id);
    if (profile && profile.avatarUrl) {
      return `<img src="${escapeHtml(profile.avatarUrl)}" alt="" class="bottom-nav-avatar" />`;
    }
    if (profile) {
      return `<span class="bottom-nav-avatar-fallback">${escapeHtml(initials(profile.displayName))}</span>`;
    }
  } catch {
    // fall through to the generic icon
  }
  return icon('user', { size: 20 });
}

async function render(nav, user) {
  const path = window.location.pathname.split('/').pop() || 'index.html';
  const isActive = (file) => (path === file ? ' active' : '');

  const loginRedirect = '/login.html?next=' + encodeURIComponent('/' + path);
  const profileHref = user ? `/profile.html?user=${encodeURIComponent(user.id)}` : loginRedirect;
  const dashboardHref = user ? '/dashboard.html' : loginRedirect;
  const addHref = user ? '/dashboard.html?new=1' : loginRedirect;
  const isOwnProfile = user && path === 'profile.html' && new URLSearchParams(window.location.search).get('user') === user.id;

  const profileIcon = await profileIconFor(user);

  nav.innerHTML = `
    <a class="bottom-nav-item${isActive('index.html')}" href="/index.html">
      <span class="bottom-nav-icon">${icon('home', { size: 20 })}</span>
      <span>Home</span>
    </a>
    <a class="bottom-nav-item${isActive('rolls.html')}" href="/rolls.html">
      <span class="bottom-nav-icon">${icon('film', { size: 20 })}</span>
      <span>Rolls</span>
    </a>
    <a class="bottom-nav-item bottom-nav-add" href="${addHref}" aria-label="Add project">
      <span class="bottom-nav-icon">${icon('plus', { size: 20 })}</span>
    </a>
    <a class="bottom-nav-item${isActive('dashboard.html')}" href="${dashboardHref}">
      <span class="bottom-nav-icon">${icon('grid', { size: 20 })}</span>
      <span>Dashboard</span>
    </a>
    <a class="bottom-nav-item${isOwnProfile ? ' active' : ''}" href="${profileHref}">
      <span class="bottom-nav-icon">${profileIcon}</span>
      <span>Profile</span>
    </a>
  `;
}
