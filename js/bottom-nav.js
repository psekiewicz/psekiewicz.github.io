import { icon } from './icons.js';
import { escapeHtml, initials, safeUrl } from './utils.js';

// Auth and profile data are pulled in dynamically, on purpose. Importing
// them at the top would chain this module to the Supabase client (and the
// CDN it comes from), so a slow or failed load would leave the bar missing
// entirely - the one piece of navigation that has to be there on mobile.
// Only icons and escaping are static, and both are local.

// The bar used to wait for the session to restore and the profile to come
// back over the network before it rendered anything, so tapping a tab made
// it blank out and rebuild on the next page - a visible flash on every
// navigation. It now paints instantly from a snapshot of whatever it showed
// last time and only re-renders if the fresh data actually differs, which
// makes it look like a persistent bar rather than part of the page.
const CACHE_KEY = 'showcase:bottom-nav';

function readSnapshot() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
  } catch {
    return null;
  }
}

function writeSnapshot(snapshot) {
  try {
    if (snapshot) localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    // Storage unavailable - the bar just goes back to rendering on load.
  }
}

function profileIconHtml(snapshot) {
  if (!snapshot) return icon('user', { size: 20 });
  const avatar = safeUrl(snapshot.avatarUrl);
  if (avatar) {
    return `<img src="${escapeHtml(avatar)}" alt="" class="bottom-nav-avatar" />`;
  }
  return `<span class="bottom-nav-avatar-fallback">${escapeHtml(initials(snapshot.displayName))}</span>`;
}

// Pure function of (snapshot, current URL) so the caller can compare the
// result against what's already on screen and skip a pointless repaint.
function navHtml(snapshot) {
  const path = window.location.pathname.split('/').pop() || 'index.html';
  const isActive = (file) => (path === file ? ' active' : '');

  const loginRedirect = '/login.html?next=' + encodeURIComponent('/' + path);
  const profileHref = snapshot ? `/profile.html?user=${encodeURIComponent(snapshot.userId)}` : loginRedirect;
  const dashboardHref = snapshot ? '/dashboard.html' : loginRedirect;
  const isOwnProfile =
    snapshot && path === 'profile.html' && new URLSearchParams(window.location.search).get('user') === snapshot.userId;

  return `
    <a class="bottom-nav-item${isActive('index.html')}" href="/index.html">
      <span class="bottom-nav-icon">${icon('home', { size: 20 })}</span>
      <span>Home</span>
    </a>
    <a class="bottom-nav-item${isActive('scrolls.html')}" href="/scrolls.html">
      <span class="bottom-nav-icon">${icon('film', { size: 20 })}</span>
      <span>Scrolls</span>
    </a>
    ${
      snapshot
        ? `<button class="bottom-nav-item bottom-nav-add" type="button" id="bottom-nav-add" aria-label="Add project" aria-expanded="false">
             <span class="bottom-nav-icon">${icon('plus', { size: 20 })}</span>
           </button>`
        : `<a class="bottom-nav-item bottom-nav-add" href="${loginRedirect}" aria-label="Add project">
             <span class="bottom-nav-icon">${icon('plus', { size: 20 })}</span>
           </a>`
    }
    <a class="bottom-nav-item${isActive('dashboard.html')}" href="${dashboardHref}">
      <span class="bottom-nav-icon">${icon('grid', { size: 20 })}</span>
      <span>Dashboard</span>
    </a>
    <a class="bottom-nav-item${isOwnProfile ? ' active' : ''}" href="${profileHref}">
      <span class="bottom-nav-icon">${profileIconHtml(snapshot)}</span>
      <span>Profile</span>
    </a>
  `;
}

async function syncWithAccount(nav) {
  let onAuthChange;
  let displayNameOf;
  let getProfile;
  try {
    [{ onAuthChange, displayNameOf }, { getProfile }] = await Promise.all([
      import('./auth.js'),
      import('./profiles-data.js'),
    ]);
  } catch {
    // Supabase unreachable - the cached bar stays exactly as painted.
    return;
  }

  onAuthChange(async (user) => {
    let snapshot = null;
    if (user) {
      snapshot = { userId: user.id, displayName: displayNameOf(user), avatarUrl: '' };
      try {
        const profile = await getProfile(user.id);
        if (profile) {
          snapshot.displayName = profile.displayName;
          snapshot.avatarUrl = profile.avatarUrl;
        }
      } catch {
        // keep the initials fallback
      }
    }

    writeSnapshot(snapshot);

    // Only touch the DOM when something actually changed - re-assigning
    // identical markup is exactly what made the bar flicker before.
    const html = navHtml(snapshot);
    if (nav.innerHTML !== html) {
      nav.innerHTML = html;
      wireAddButton(nav);
    }
  });
}

// The + is a button rather than a link when signed in: it opens the create
// sheet over the current page instead of navigating away. Re-bound after
// every render because the markup is replaced wholesale.
function wireAddButton(nav) {
  const addBtn = nav.querySelector('#bottom-nav-add');
  if (!addBtn || addBtn.dataset.wired) return;
  addBtn.dataset.wired = '1';
  addBtn.addEventListener('click', async () => {
    const sheet = await import('./create-sheet.js');
    sheet.onSheetToggle((open) => {
      nav.classList.toggle('is-sheet-open', open);
      const current = nav.querySelector('#bottom-nav-add');
      if (current) current.setAttribute('aria-expanded', String(open));
    });
    sheet.toggleSheet();
  });
}

function mount() {
  const nav = document.createElement('nav');
  nav.className = 'bottom-nav';
  nav.setAttribute('aria-label', 'Primary');
  // Painted before anything async runs, from the last known state.
  nav.innerHTML = navHtml(readSnapshot());
  document.body.appendChild(nav);
  document.body.classList.add('has-bottom-nav');
  wireAddButton(nav);

  syncWithAccount(nav);
}

// Module scripts are deferred, so <body> already exists by the time this
// runs; the guard is only for the case where it doesn't.
if (document.body) mount();
else document.addEventListener('DOMContentLoaded', mount);
