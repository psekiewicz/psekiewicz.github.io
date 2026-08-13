import { onAuthChange, logoutUser, displayNameOf } from './auth.js';
import { getProfile } from './profiles-data.js';
import { isAdmin } from './admin-data.js';
import { escapeHtml, avatarHtml } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', () => links.classList.toggle('is-open'));
  }

  const path = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-link').forEach((link) => {
    if (link.getAttribute('href') === path) link.classList.add('active');
  });

  const actions = document.getElementById('nav-actions');
  if (!actions) return;

  onAuthChange((user) => renderNavActions(actions, user));
});

async function renderNavActions(container, user) {
  if (!user) {
    container.innerHTML = `
      <a class="btn btn-ghost btn-sm" href="/login.html">Log in</a>
      <a class="btn btn-primary btn-sm" href="/register.html">Get started</a>
    `;
    return;
  }

  const name = displayNameOf(user);
  let avatarUrl = '';
  try {
    const profile = await getProfile(user.id);
    if (profile) avatarUrl = profile.avatarUrl;
  } catch {
    // keep the initials fallback
  }

  container.innerHTML = `
    <a class="btn btn-ghost btn-sm" href="/dashboard.html">Dashboard</a>
    <a class="user-chip" href="/profile.html?user=${encodeURIComponent(user.id)}">
      ${avatarHtml(avatarUrl, name)}
      <span>${escapeHtml(name)}</span>
    </a>
    <button class="btn btn-secondary btn-sm" id="logout-btn" type="button">Log out</button>
  `;

  document.getElementById('logout-btn').addEventListener('click', async (e) => {
    e.target.disabled = true;
    await logoutUser();
    window.location.href = '/index.html';
  });

  const admin = await isAdmin(user.id).catch(() => false);
  const navLinks = document.querySelector('.nav-links');
  if (admin && navLinks && !navLinks.querySelector('[data-admin-link]')) {
    const link = document.createElement('a');
    link.className = 'nav-link';
    link.href = 'admin.html';
    link.textContent = 'Admin';
    link.setAttribute('data-admin-link', '');
    const path = window.location.pathname.split('/').pop() || 'index.html';
    if (path === 'admin.html') link.classList.add('active');
    navLinks.appendChild(link);
  }
}
