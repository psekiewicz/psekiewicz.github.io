import { onAuthChange, logoutUser, displayNameOf } from './auth.js';
import { getProfile } from './profiles-data.js';
import { isAdmin } from './admin-data.js';
import { escapeHtml, avatarHtml } from './utils.js';
import { icon } from './icons.js';
import { getUserStats, getTopAchievement } from './achievements.js';
import { getAchievementRecords, EMPTY_ACHIEVEMENT_RECORDS } from './points-data.js';
import { effectClass } from './shop-items.js';
import { levelFromStats, levelChipHtml } from './levels.js';
import { watchProgress, PROGRESS_EVENT } from './progress-watch.js';
import { mountNotifications, unmountNotifications } from './notifications-ui.js';

// Tracked at module scope so the keyboard shortcut below can tell whether
// there is anyone to create a project as, without re-querying Supabase on
// every keystroke.
let signedInUser = null;

// Opening the quick-create sheet is the same gesture the phone's + tab makes,
// pointed at the same module - the sheet already has a desktop layout (it
// becomes a centred panel above 720px), it simply had no trigger up here.
async function openCreateSheet() {
  const sheet = await import('./create-sheet.js');
  sheet.openSheet();
}

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

  bindNewProjectShortcut();

  const actions = document.getElementById('nav-actions');
  if (!actions) return;

  onAuthChange((user) => renderNavActions(actions, user));
});

// A phone gets the + tab within thumb reach on every screen; the equivalent
// convenience on a keyboard is not having to reach for the mouse at all.
function bindNewProjectShortcut() {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'n' && e.key !== 'N') return;
    // Chorded presses belong to the browser and the OS, not to us.
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!signedInUser) return;

    // Typing an 'n' into any field must stay an 'n'. contentEditable covers
    // rich-text areas, where the target is a div rather than an input.
    const el = document.activeElement;
    if (el && (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName))) return;

    e.preventDefault();
    openCreateSheet();
  });
}

async function renderNavActions(container, user) {
  signedInUser = user;

  if (!user) {
    unmountNotifications();
    document.querySelectorAll('[data-mobile-logout]').forEach((el) => el.remove());
    container.innerHTML = `
      <a class="btn btn-ghost btn-sm" href="/login.html">Log in</a>
      <a class="btn btn-primary btn-sm" href="/register.html">Get started</a>
    `;
    return;
  }

  mountNotifications();

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

  // The + tab is the fastest thing about the phone app: publishing never
  // means navigating anywhere first. .nav-actions is hidden at exactly the
  // width the tab bar appears, so this button is its desktop counterpart
  // rather than a second copy of it.
  container.innerHTML = `
    <button class="btn btn-primary btn-sm nav-new-btn" id="nav-new-project" type="button" aria-haspopup="dialog" aria-label="New project" title="New project (press N)">
      ${icon('plus', { size: 15 })}<span>New project</span>
    </button>
    <a class="btn btn-ghost btn-sm" href="/dashboard.html">Dashboard</a>
    <a class="user-chip" href="/profile.html?user=${encodeURIComponent(user.id)}">
      ${avatarHtml(avatarUrl, name, borderClass)}
      <span class="${nameEffectClass}">${escapeHtml(name)}</span>
    </a>
    <button class="btn btn-secondary btn-sm" id="nav-logout-btn" type="button">Log out</button>
  `;

  container.querySelector('#nav-new-project').addEventListener('click', openCreateSheet);

  container.querySelector('#nav-logout-btn').addEventListener('click', async (e) => {
    e.target.disabled = true;
    await logoutUser();
    window.location.href = '/index.html';
  });

  // Progressive enhancement: the chip is already visible and usable above,
  // this just quietly adds the level and best-achievement badges afterwards
  // - no need to block the rest of the navbar on either.
  // Redrawn on every progress check, not just the first, so the level
  // reflects what you just did rather than what you had when the page
  // loaded.
  function paintChipBadges(stats, records) {
    const chip = container.querySelector('.user-chip');
    if (!chip) return;

    const level = levelFromStats(stats).level;
    const existingChip = chip.querySelector('.level-chip');
    if (!existingChip) {
      chip.insertAdjacentHTML('beforeend', levelChipHtml(level, 'sm'));
    } else if (existingChip.textContent !== `Lv ${level}`) {
      existingChip.outerHTML = levelChipHtml(level, 'sm');
    }

    const top = getTopAchievement(stats, records.unlocked);
    if (!top) return;
    let badge = chip.querySelector('.name-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'name-badge';
      chip.appendChild(badge);
    }
    badge.title = `${top.label} - ${top.description}`;
    badge.innerHTML = icon(top.icon, { size: 12 });
  }

  if (!container.dataset.progressBound) {
    container.dataset.progressBound = '1';
    document.addEventListener(PROGRESS_EVENT, (e) => paintChipBadges(e.detail.stats, e.detail.records));
  }

  Promise.all([getUserStats(user.id), getAchievementRecords(user.id).catch(() => EMPTY_ACHIEVEMENT_RECORDS)])
    .then(([stats, records]) => {
      paintChipBadges(stats, records);

      // The navbar is the one thing that loads on every page while signed
      // in, so it's also where new rewards get noticed and toasted -
      // piggybacking on the stats it already had to fetch rather than
      // querying for them a second time somewhere else.
      watchProgress(user.id, stats, records);
    })
    .catch(() => {});

  // On mobile .nav-actions (with its Log out button) is hidden in favour of
  // the bottom tab bar, which left the profile page as the only way to sign
  // out. The burger is where the rest of mobile navigation already lives,
  // so it goes here - hidden on desktop, where the navbar button remains.
  const navLinksEl = document.querySelector('.nav-links');
  if (navLinksEl && !navLinksEl.querySelector('[data-mobile-logout]')) {
    const logout = document.createElement('button');
    logout.type = 'button';
    logout.className = 'nav-link nav-link-logout';
    logout.setAttribute('data-mobile-logout', '');
    logout.textContent = 'Log out';
    logout.addEventListener('click', async () => {
      logout.disabled = true;
      await logoutUser();
      window.location.href = '/index.html';
    });
    navLinksEl.appendChild(logout);
  }

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
    // Before the logout item, which is always meant to sit last.
    navLinks.insertBefore(link, navLinks.querySelector('[data-mobile-logout]'));
  }
}
