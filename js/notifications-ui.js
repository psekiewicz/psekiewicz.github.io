import { getNotifications, getUnreadCount, markAllRead } from './notifications-data.js';
import { getProfilesByIds } from './profiles-data.js';
import { getProjectTitles } from './projects-data.js';
import { escapeHtml, avatarHtml, timeAgo } from './utils.js';
import { icon } from './icons.js';

// The bell is injected rather than written into all twelve pages, and it
// goes in .nav-right beside the theme toggle — not inside .nav-actions,
// which is hidden on mobile in favour of the bottom tab bar.
let mounted = false;

const VERB = {
  follow: 'started following you',
  like: 'liked',
  comment: 'commented on',
};

function notificationHref(notification) {
  if (notification.type === 'follow') {
    return `/profile.html?user=${encodeURIComponent(notification.actorId)}`;
  }
  return notification.projectId ? `/project.html?id=${encodeURIComponent(notification.projectId)}` : '#';
}

function itemHtml(notification, profiles, titles) {
  const actor = profiles.get(notification.actorId);
  const name = actor ? actor.displayName : 'Someone';
  const subject = notification.type === 'follow' ? '' : titles.get(notification.projectId) || 'a project';

  return `
    <a class="notif-item${notification.read ? '' : ' is-unread'}" href="${notificationHref(notification)}">
      ${avatarHtml(actor ? actor.avatarUrl : '', name, 'avatar-sm')}
      <span class="notif-text">
        <span><strong>${escapeHtml(name)}</strong> ${VERB[notification.type]}${
          subject ? ` <strong>${escapeHtml(subject)}</strong>` : ''
        }</span>
        <span class="notif-time">${timeAgo(notification.createdAt)}</span>
      </span>
    </a>
  `;
}

export function mountNotifications() {
  const navRight = document.querySelector('.nav-right');
  if (!navRight || mounted) return;
  mounted = true;

  const wrap = document.createElement('div');
  wrap.className = 'notif-wrap';
  wrap.innerHTML = `
    <button class="notif-bell" id="notif-bell" type="button" aria-label="Notifications" aria-expanded="false">
      ${icon('bell', { size: 18 })}
      <span class="notif-badge" id="notif-badge" hidden></span>
    </button>
    <div class="notif-panel" id="notif-panel" hidden>
      <div class="notif-panel-head"><strong>Notifications</strong></div>
      <div class="notif-list" id="notif-list"><p class="hint">Loading…</p></div>
    </div>
  `;
  navRight.insertBefore(wrap, navRight.firstChild);

  const bell = wrap.querySelector('#notif-bell');
  const badge = wrap.querySelector('#notif-badge');
  const panel = wrap.querySelector('#notif-panel');
  const list = wrap.querySelector('#notif-list');

  async function refreshBadge() {
    try {
      const unread = await getUnreadCount();
      badge.hidden = unread === 0;
      badge.textContent = unread > 9 ? '9+' : String(unread);
    } catch {
      // Notifications not set up yet (the SQL hasn't been run) — leave the
      // bell quiet rather than showing an error in the navbar.
      badge.hidden = true;
    }
  }

  async function openPanel() {
    panel.hidden = false;
    bell.setAttribute('aria-expanded', 'true');
    list.innerHTML = '<p class="hint">Loading…</p>';

    let notifications;
    try {
      notifications = await getNotifications();
    } catch {
      list.innerHTML = '<p class="hint">Could not load notifications.</p>';
      return;
    }

    if (notifications.length === 0) {
      list.innerHTML = '<p class="hint">Nothing yet — likes, comments and new followers show up here.</p>';
      return;
    }

    const [profiles, titles] = await Promise.all([
      getProfilesByIds(notifications.map((n) => n.actorId)).catch(() => new Map()),
      getProjectTitles(notifications.map((n) => n.projectId)).catch(() => new Map()),
    ]);
    list.innerHTML = notifications.map((n) => itemHtml(n, profiles, titles)).join('');

    // Opening the panel is the read receipt; the badge clears immediately
    // rather than waiting for the round trip to come back.
    badge.hidden = true;
    markAllRead().catch(() => {});
  }

  function closePanel() {
    panel.hidden = true;
    bell.setAttribute('aria-expanded', 'false');
  }

  bell.addEventListener('click', (e) => {
    e.stopPropagation();
    if (panel.hidden) openPanel();
    else closePanel();
  });

  document.addEventListener('click', (e) => {
    if (!panel.hidden && !wrap.contains(e.target)) closePanel();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) closePanel();
  });

  refreshBadge();
}

export function unmountNotifications() {
  const wrap = document.querySelector('.notif-wrap');
  if (wrap) wrap.remove();
  mounted = false;
}
