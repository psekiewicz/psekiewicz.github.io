import { icon } from './icons.js';

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str ?? '');
  return div.innerHTML;
}

export function initials(name) {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join('');
}

// Renders a circular avatar: the user's photo when they have one, their
// initials on a gradient background otherwise. sizeClass is an optional
// extra class (e.g. "avatar-sm") layered on top of the base .avatar size.
export function avatarHtml(avatarUrl, name, sizeClass = '') {
  const cls = `avatar${sizeClass ? ' ' + sizeClass : ''}`;
  if (avatarUrl) {
    return `<span class="${cls} avatar-img"><img src="${escapeHtml(avatarUrl)}" alt="" /></span>`;
  }
  return `<span class="${cls}">${escapeHtml(initials(name))}</span>`;
}

// Project type: drives the badge shown on cards, the icon next to it, and
// the options in the dashboard's "type" select. `other` is the fallback
// for anything unrecognized (including projects created before this field
// existed, which default to it server-side too — see schema.sql).
export const PROJECT_TYPES = {
  website: { label: 'Website', icon: 'globe' },
  mobile_app: { label: 'Mobile App', icon: 'smartphone' },
  game: { label: 'Game', icon: 'gamepad' },
  design: { label: 'Design', icon: 'palette' },
  library: { label: 'Library / Tool', icon: 'package' },
  other: { label: 'Other', icon: 'folder' },
};

export const PROJECT_TYPE_OPTIONS = Object.entries(PROJECT_TYPES).map(([value, meta]) => ({
  value,
  label: meta.label,
}));

export function typeBadgeHtml(type) {
  const meta = PROJECT_TYPES[type] || PROJECT_TYPES.other;
  return `<span class="type-badge">${icon(meta.icon, { size: 13 })}${escapeHtml(meta.label)}</span>`;
}

export function timeAgo(isoDate) {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(isoDate).toLocaleDateString();
}
