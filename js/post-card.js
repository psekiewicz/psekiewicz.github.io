import { escapeHtml, timeAgo, avatarHtml, safeUrl, PROJECT_TYPES } from './utils.js';
import { icon } from './icons.js';
import { levelChipHtml } from './levels.js';
import { parseMedia } from './media.js';
import { effectClass } from './shop-items.js';

// An entry drawn as a post: who, when, what, the picture, and the actions
// underneath - the shape every feed people already use is built from. Shared
// by the home feed and anything else that lists entries as posts.
//
// Rendering is a pure function of the data passed in; the Supabase-backed
// actions (like, save) are attached once per list by bindPostActions below,
// through event delegation, so a re-render never has to rebind anything.

const PLAYABLE = new Set(['music', 'video']);

// The picture a post shows: its own cover image, else a still from its media.
// YouTube publishes one at a predictable path; image links are their own
// still. Anything else falls back to the per-type gradient.
function coverFor(project) {
  const cover = safeUrl(project.imageUrl);
  if (cover) return cover;
  const media = parseMedia(project.mediaUrl, project.type);
  if (!media) return '';
  if (media.kind === 'image') return media.src;
  if (media.provider === 'YouTube') {
    const id = media.embedUrl.split('/').pop();
    return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  }
  return '';
}

export function postHtml(project, { author, level, likeCount = 0, commentCount = 0, liked = false, saved = false } = {}) {
  const href = `/project.html?id=${encodeURIComponent(project.id)}`;
  const profileHref = `/profile.html?user=${encodeURIComponent(project.uid)}`;
  const type = PROJECT_TYPES[project.type] ? project.type : 'other';
  const meta = PROJECT_TYPES[type];
  const name = (author && author.displayName) || project.authorName;
  const cover = coverFor(project);
  const text = project.summary || project.description.slice(0, 220);
  const tags = project.tags
    .slice(0, 4)
    .map((t) => `<a class="tag" href="/projects.html?tag=${encodeURIComponent(t)}">${escapeHtml(t)}</a>`)
    .join('');

  // The per-type gradient sits behind the image, so a cover that fails to load
  // simply removes itself and the placeholder is already there.
  const media = cover ? `<img src="${escapeHtml(cover)}" alt="" loading="lazy" onerror="this.remove()" />` : '';

  return `
    <article class="post" data-project-id="${escapeHtml(project.id)}">
      <header class="post-head">
        <a href="${profileHref}" aria-hidden="true" tabindex="-1">
          ${avatarHtml(author ? author.avatarUrl : '', name, author ? effectClass(author.equippedBorder) : '')}
        </a>
        <div class="post-byline">
          <span class="post-author">
            <a class="${author ? effectClass(author.equippedNameEffect) : ''}" href="${profileHref}">${escapeHtml(name)}</a>
            ${level ? levelChipHtml(level.level, 'sm') : ''}
          </span>
          <span class="post-meta">
            <time datetime="${escapeHtml(project.createdAt)}">${timeAgo(project.createdAt)}</time>
            <span aria-hidden="true">·</span>
            <span>${escapeHtml(meta.label)}</span>
          </span>
        </div>
      </header>
      <div class="post-body">
        <h3 class="post-title"><a href="${href}">${escapeHtml(project.title)}</a></h3>
        ${text ? `<p class="post-text">${escapeHtml(text)}</p>` : ''}
        ${tags ? `<div class="post-tags">${tags}</div>` : ''}
      </div>
      <a class="post-media" data-type="${type}" href="${href}" aria-label="Open ${escapeHtml(project.title)}">
        ${media}
        <span class="post-media-kind">${icon(meta.icon, { size: 13 })}${escapeHtml(meta.label)}</span>
        ${PLAYABLE.has(type) ? `<span class="post-media-play">${icon('play', { size: 22 })}</span>` : ''}
      </a>
      <footer class="post-actions">
        <button class="post-action" type="button" data-action="like" aria-pressed="${liked}" aria-label="Like">
          ${icon('heart', { size: 19 })}<span data-count>${likeCount}</span>
        </button>
        <a class="post-action" href="${href}#comments" aria-label="Comments">
          ${icon('message-circle', { size: 19 })}<span>${commentCount}</span>
        </a>
        <button class="post-action" type="button" data-action="share" aria-label="Share">
          ${icon('share', { size: 19 })}
        </button>
        <span class="post-action-spacer"></span>
        <button class="post-action" type="button" data-action="save" aria-pressed="${saved}" aria-label="${saved ? 'Saved' : 'Save'}">
          ${icon('bookmark', { size: 19 })}
        </button>
      </footer>
    </article>
  `;
}

// Wires like / save / share for every post inside `container`, now and
// later. `getUser` returns the signed-in user or null; signed-out visitors are
// sent to log in and come back to the same page.
export function bindPostActions(container, { getUser }) {
  container.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn || !container.contains(btn)) return;
    const post = btn.closest('.post');
    const projectId = post && post.dataset.projectId;
    if (!projectId) return;
    const action = btn.dataset.action;

    if (action === 'share') {
      const { shareLink } = await import('./share.js');
      const title = post.querySelector('.post-title a')?.textContent || 'Showcase';
      shareLink({ url: `/project.html?id=${encodeURIComponent(projectId)}`, title });
      return;
    }

    const user = getUser();
    if (!user) {
      window.location.href = '/login.html?next=' + encodeURIComponent(window.location.pathname + window.location.search);
      return;
    }

    if (btn.disabled) return;
    btn.disabled = true;
    const wasOn = btn.getAttribute('aria-pressed') === 'true';
    // Optimistic: the tap lands immediately and is undone if the server says no.
    const setState = (on) => {
      btn.setAttribute('aria-pressed', String(on));
      if (action === 'like') {
        const count = btn.querySelector('[data-count]');
        count.textContent = String(Math.max(0, Number(count.textContent) + (on ? 1 : -1)));
      } else {
        btn.setAttribute('aria-label', on ? 'Saved' : 'Save');
      }
    };
    setState(!wasOn);
    if (!wasOn) {
      btn.classList.remove('is-popping');
      void btn.offsetWidth;
      btn.classList.add('is-popping');
    }

    try {
      if (action === 'like') {
        const { likeProject, unlikeProject } = await import('./likes-data.js');
        await (wasOn ? unlikeProject(user.id, projectId) : likeProject(user.id, projectId));
      } else if (action === 'save') {
        const { saveProject, unsaveProject } = await import('./saves-data.js');
        await (wasOn ? unsaveProject(user.id, projectId) : saveProject(user.id, projectId));
      }
    } catch (err) {
      setState(wasOn);
      const { showToast } = await import('./toast.js');
      showToast({ title: 'That did not go through', body: err.message, iconName: 'x', variant: 'error' });
    } finally {
      btn.disabled = false;
    }
  });
}

// The compact form for grids (Explore, profiles): the picture carries it, with
// the title and who made it over the bottom and the counts in the corner.
export function tileHtml(project, { author, likeCount = 0, commentCount = 0 } = {}) {
  const href = `/project.html?id=${encodeURIComponent(project.id)}`;
  const type = PROJECT_TYPES[project.type] ? project.type : 'other';
  const meta = PROJECT_TYPES[type];
  const name = (author && author.displayName) || project.authorName;
  const cover = coverFor(project);
  return `
    <a class="tile" data-type="${type}" href="${href}">
      ${cover ? `<img src="${escapeHtml(cover)}" alt="" loading="lazy" onerror="this.remove()" />` : ''}
      <span class="post-media-kind">${icon(meta.icon, { size: 13 })}${escapeHtml(meta.label)}</span>
      ${PLAYABLE.has(type) ? `<span class="tile-play">${icon('play', { size: 16 })}</span>` : ''}
      <span class="tile-info">
        <span class="tile-title">${escapeHtml(project.title)}</span>
        <span class="tile-meta">
          ${avatarHtml(author ? author.avatarUrl : '', name, 'avatar-sm')}
          <span class="tile-author">${escapeHtml(name)}</span>
          <span class="tile-counts">${icon('heart', { size: 13 })}${likeCount} ${icon('message-circle', { size: 13 })}${commentCount}</span>
        </span>
      </span>
    </a>
  `;
}
