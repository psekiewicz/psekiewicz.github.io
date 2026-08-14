import { onAuthChange, logoutUser, displayNameOf } from './auth.js';
import { getProfile } from './profiles-data.js';
import { isAdmin } from './admin-data.js';
import { escapeHtml, avatarHtml } from './utils.js';
import { icon } from './icons.js';
import { getUserStats, getTopAchievement } from './achievements.js';
import { getAchievementRecords, EMPTY_ACHIEVEMENT_RECORDS } from './points-data.js';
import { effectClass } from './shop-items.js';
import { levelFromStats, levelChipHtml } from './levels.js';
import { watchProgress } from './progress-watch.js';

document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', () => {
      const isOpen = links.classList.toggle('is-open');
      toggle.classList.toggle('is-open', isOpen);
      toggle.setAttribute('aria-expanded', String(isOpen));
    });
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
  let borderClass = '';
  let nameEffectClass = '';
  try {
    const profile = await getProfile(user.id);
    if (profile) {
      avatarUrl = profile.avatarUrl;
      borderClass = effectClass(profile.equippedBorder);
      nameEffectClass = effectClass(profile.equippedNameEffect);
    }
  } catch {
    // keep the initials fallback, no effects
  }

  container.innerHTML = `
    <a class="btn btn-ghost btn-sm" href="/dashboard.html">Dashboard</a>
    <a class="user-chip" href="/profile.html?user=${encodeURIComponent(user.id)}">
      ${avatarHtml(avatarUrl, name, borderClass)}
      <span class="${nameEffectClass}">${escapeHtml(name)}</span>
    </a>
    <button class="btn btn-secondary btn-sm" id="nav-logout-btn" type="button">Log out</button>
  `;

  container.querySelector('#nav-logout-btn').addEventListener('click', async (e) => {
    e.target.disabled = true;
    await logoutUser();
    window.location.href = '/index.html';
  });

  // Progressive enhancement: the chip is already visible and usable above,
  // this just quietly adds the level and best-achievement badges afterwards
  // — no need to block the rest of the navbar on either.
  Promise.all([getUserStats(user.id), getAchievementRecords(user.id).catch(() => EMPTY_ACHIEVEMENT_RECORDS)])
    .then(([stats, records]) => {
      const chip = container.querySelector('.user-chip');
      if (chip) {
        if (!chip.querySelector('.level-chip')) {
          chip.insertAdjacentHTML('beforeend', levelChipHtml(levelFromStats(stats).level, 'sm'));
        }

        const top = getTopAchievement(stats, records.unlocked);
        if (top && !chip.querySelector('.name-badge')) {
          const badge = document.createElement('span');
          badge.className = 'name-badge';
          badge.title = `${top.label} — ${top.description}`;
          badge.innerHTML = icon(top.icon, { size: 12 });
          chip.appendChild(badge);
        }
      }

      // The navbar is the one thing that loads on every page while signed
      // in, so it's also where new rewards get noticed and toasted —
      // piggybacking on the stats it already had to fetch rather than
      // querying for them a second time somewhere else.
      watchProgress(user.id, stats, records);
    })
    .catch(() => {});

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
