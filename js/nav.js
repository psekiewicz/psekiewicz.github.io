import { onAuthChange, logoutUser, displayNameOf } from './auth.js';
import { getProfile } from './profiles-data.js';
import { isAdmin } from './admin-data.js';
import { escapeHtml, avatarHtml, pageId } from './utils.js';
import { icon } from './icons.js';
import { getUserStats } from './achievements.js';
import { getAchievementRecords, EMPTY_ACHIEVEMENT_RECORDS } from './points-data.js';
import { effectClass } from './shop-items.js';
import { watchProgress } from './progress-watch.js';
import { mountNotifications, unmountNotifications } from './notifications-ui.js';
// Runs on import: sends a signed-in account with no date of birth to the
// page that asks for one. Here rather than in each page's own script so a
// new page is covered without anybody remembering to add it.
import './age-gate.js';

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

  const current = pageId(window.location.pathname);
  document.querySelectorAll('.nav-link').forEach((link) => {
    if (pageId(link.getAttribute('href')) === current) link.classList.add('active');
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
    container.innerHTML = `
      <a class="btn btn-primary nav-login-btn" href="/login.html" title="Log in" aria-label="Log in">${icon('user', { size: 18 })}<span>Log in</span></a>
      <a class="btn btn-secondary nav-signup-btn" href="/register.html">Create account</a>
    `;
    return;
  }

  mountNotifications();

  const name = displayNameOf(user);
  let avatarUrl = '';
  let borderClass = '';
  try {
    const profile = await getProfile(user.id);
    if (profile) {
      avatarUrl = profile.avatarUrl;
      borderClass = effectClass(profile.equippedBorder);
    }
  } catch {
    // keep the initials fallback, no effects
  }

  // The + tab is the fastest thing about the phone app: publishing never
  // means navigating anywhere first. On phones the post button is hidden in
  // favour of that tab; the avatar and its menu show everywhere.
  const profileHref = `/profile.html?user=${encodeURIComponent(user.id)}`;
  container.innerHTML = `
    <button class="btn btn-primary nav-new-btn" id="nav-new-project" type="button" aria-haspopup="dialog" aria-label="New post" title="New post (press N)">
      ${icon('plus', { size: 18 })}<span>New post</span>
    </button>
    <div class="account-menu">
      <button class="user-chip" id="account-btn" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="account-pop" aria-label="Account menu" title="${escapeHtml(name)}">
        ${avatarHtml(avatarUrl, name, borderClass)}
      </button>
      <div class="account-pop" id="account-pop" role="menu" hidden>
        <div class="account-pop-head">${avatarHtml(avatarUrl, name, 'avatar-sm')}<span>${escapeHtml(name)}</span></div>
        <a class="account-pop-item" role="menuitem" href="${profileHref}">${icon('user', { size: 18 })} Your profile</a>
        <a class="account-pop-item" role="menuitem" href="/settings.html">${icon('settings', { size: 18 })} Settings</a>
        <button class="account-pop-item" role="menuitem" type="button" id="nav-logout-btn">${icon('log-out', { size: 18 })} Log out</button>
      </div>
    </div>
  `;

  container.querySelector('#nav-new-project').addEventListener('click', openCreateSheet);
  bindAccountMenu(container);

  Promise.all([getUserStats(user.id), getAchievementRecords(user.id).catch(() => EMPTY_ACHIEVEMENT_RECORDS)])
    .then(([stats, records]) => {
      // The navbar is the one thing that loads on every page while signed
      // in, so it's also where new rewards get noticed and toasted -
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
    link.href = '/admin.html';
    link.innerHTML = `${icon('shield', { size: 22 })}<span>Admin</span>`;
    link.setAttribute('data-admin-link', '');
    if (pageId(window.location.pathname) === 'admin') link.classList.add('active');
    navLinks.appendChild(link);
  }
}

// Log out lives in the avatar's menu - one place on every screen size, rather
// than a separate button in each layout.
function bindAccountMenu(container) {
  const btn = container.querySelector('#account-btn');
  const pop = container.querySelector('#account-pop');
  if (!btn || !pop) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    setAccountMenuOpen(pop.hidden);
  });

  const logout = pop.querySelector('#nav-logout-btn');
  logout.addEventListener('click', async () => {
    logout.disabled = true;
    await logoutUser();
    window.location.href = '/index.html';
  });

  // Page-wide listeners are added once, however often the navbar re-renders,
  // and look the menu up when they fire so they never hold on to stale nodes.
  if (accountMenuListening) return;
  accountMenuListening = true;
  document.addEventListener('click', (e) => {
    const current = document.getElementById('account-pop');
    if (current && !current.hidden && !current.contains(e.target)) setAccountMenuOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    const current = document.getElementById('account-pop');
    if (e.key === 'Escape' && current && !current.hidden) {
      setAccountMenuOpen(false);
      document.getElementById('account-btn')?.focus();
    }
  });
}

let accountMenuListening = false;

function setAccountMenuOpen(open) {
  const btn = document.getElementById('account-btn');
  const pop = document.getElementById('account-pop');
  if (!btn || !pop) return;
  pop.hidden = !open;
  btn.setAttribute('aria-expanded', String(open));
  if (open) pop.querySelector('.account-pop-item')?.focus();
}
