import { onAuthChange, logoutUser, displayNameOf } from './auth.js';
import { escapeHtml, initials } from './utils.js';

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

function renderNavActions(container, user) {
  if (!user) {
    container.innerHTML = `
      <a class="btn btn-ghost btn-sm" href="/login.html">Log in</a>
      <a class="btn btn-primary btn-sm" href="/register.html">Get started</a>
    `;
    return;
  }

  const name = displayNameOf(user);
  container.innerHTML = `
    <a class="btn btn-ghost btn-sm" href="/dashboard.html">Dashboard</a>
    <div class="user-chip">
      <span class="avatar">${escapeHtml(initials(name))}</span>
      <span>${escapeHtml(name)}</span>
    </div>
    <button class="btn btn-secondary btn-sm" id="logout-btn" type="button">Log out</button>
  `;

  document.getElementById('logout-btn').addEventListener('click', async (e) => {
    e.target.disabled = true;
    await logoutUser();
    window.location.href = '/index.html';
  });
}
