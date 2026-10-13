import { getActiveAnnouncement } from './announcements-data.js';
import { icon } from './icons.js';
import { renderMarkdown } from './markdown.js';
import { escapeHtml, safeUrl } from './utils.js';

// The admin's message as a popup, shown once per announcement in a browser:
// closing it records the id, and a newer announcement shows again. Runs on
// import (nav.js loads it, and nav.js is on every page) and again when the tab
// becomes visible, so a notice published while a page sat open still arrives.
const SEEN_KEY = 'announcement:lastSeen';

function seen(id) {
  try {
    return localStorage.getItem(SEEN_KEY) === id;
  } catch {
    return false;
  }
}

function remember(id) {
  try {
    localStorage.setItem(SEEN_KEY, id);
  } catch {
    // Worst case it is shown once more on the next page.
  }
}

let showing = false;

// The picture and the film sit above the text. Both addresses go through
// safeUrl, so only https links ever reach an attribute.
function mediaHtml(item) {
  const image = safeUrl(item.imageUrl);
  const video = safeUrl(item.videoUrl);
  return [
    image
      ? `<img class="announcement-media" src="${escapeHtml(image)}" alt="" onerror="this.remove()" />`
      : '',
    video
      ? `<video class="announcement-media" src="${escapeHtml(video)}" controls playsinline preload="metadata"></video>`
      : '',
  ].join('');
}

function show(item) {
  showing = true;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay announcement-overlay';
  overlay.innerHTML = `
    <div class="modal announcement" role="dialog" aria-modal="true" aria-labelledby="announcement-title">
      <div class="modal-head">
        <h2 id="announcement-title">${escapeHtml(item.title)}</h2>
        <button class="modal-close" type="button" aria-label="Close">${icon('x', { size: 18 })}</button>
      </div>
      ${mediaHtml(item)}
      <div class="announcement-body detail-body">${renderMarkdown(item.body)}</div>
      <div class="announcement-actions">
        <button class="btn btn-primary" type="button">Got it</button>
      </div>
    </div>
  `;

  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  const close = () => {
    remember(item.id);
    overlay.classList.remove('is-open');
    document.removeEventListener('keydown', onKey);
    // A film left playing would carry on behind the closed popup.
    overlay.querySelectorAll('video').forEach((v) => v.pause());
    setTimeout(() => {
      overlay.remove();
      showing = false;
    }, 250);
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelector('.modal-close').addEventListener('click', close);
  overlay.querySelector('.btn').addEventListener('click', close);
  document.addEventListener('keydown', onKey);

  document.body.appendChild(overlay);
  requestAnimationFrame(() => {
    overlay.classList.add('is-open');
    overlay.querySelector('.btn').focus();
  });
}

async function check() {
  if (showing) return;
  const latest = await getActiveAnnouncement();
  if (latest && !seen(latest.id) && !showing) show(latest);
}

check();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') check();
});
