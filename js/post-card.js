import { escapeHtml, avatarHtml, safeUrl, PROJECT_TYPES } from './utils.js';
import { icon } from './icons.js';
import { parseMedia } from './media.js';
import { firstImage } from './markdown.js';

// A demo drawn as a grid tile, for a person's profile. (This file also used to
// draw the general feed's timeline posts; XOXD is only demos now, and the
// demos themselves are the full-screen cards on the home page.)

const PLAYABLE = new Set(['music', 'video']);

// The picture a post shows: its own cover image, else a still from its media.
// YouTube publishes one at a predictable path; image links are their own
// still. Anything else falls back to the per-type gradient.
function coverFor(project) {
  const cover = safeUrl(project.imageUrl);
  if (cover) return cover;
  const media = parseMedia(project.mediaUrl, project.type);
  if (media && media.kind === 'image') return media.src;
  if (media && media.provider === 'YouTube') {
    const id = media.embedUrl.split('/').pop();
    return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  }
  // A text post whose pictures are all inside the article still gets one.
  return safeUrl(firstImage(project.description));
}

// The compact form for a profile's grid: the picture carries it, with
// the title and who made it over the bottom and the counts in the corner.
export function tileHtml(project, { author, likeCount = 0, commentCount = 0 } = {}) {
  const href = `/project?id=${encodeURIComponent(project.id)}`;
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
