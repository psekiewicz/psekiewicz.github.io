// Minimal outline ("no-fill") icon set — stroke-only, currentColor, 24x24
// viewBox. Keeps the whole app's iconography consistent without pulling in
// an icon font or library.
const PATHS = {
  home: '<path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 15h18M8 4v16M16 4v16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  user: '<circle cx="12" cy="8" r="3.5"/><path d="M4.5 20c1.4-3.6 4.4-5.5 7.5-5.5s6.1 1.9 7.5 5.5"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  shield: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z"/>',
  'shield-check': '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z"/><path d="M9 12l2 2 4-4"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 4 5.7 4 9s-1.5 6.5-4 9c-2.5-2.5-4-5.7-4-9s1.5-6.5 4-9Z"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M2.8 19c1.2-3.2 3.6-5 6.2-5s5 1.8 6.2 5"/><circle cx="17.5" cy="9" r="2.6"/><path d="M15 14c2.3.2 4.3 1.8 5.2 5"/>',
  'external-link': '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/>',
  'arrow-left': '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/><path d="M10 11v6M14 11v6"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  pencil: '<path d="M4 20l4-1 11-11-3-3L5 16l-1 4Z"/><path d="M14 5l3 3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  smartphone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  gamepad: '<rect x="2" y="7" width="20" height="10" rx="5"/><path d="M7 10v4M5 12h4"/><circle cx="16" cy="11" r="1"/><circle cx="18" cy="13" r="1"/>',
  palette:
    '<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2 0-.6-.3-1-.6-1.4-.3-.4-.4-.9 0-1.3.4-.4 1-.3 1.6-.3H17a3 3 0 0 0 3-3c0-5.5-3.6-10-8-10Z"/><circle cx="7.5" cy="10.5" r="1"/><circle cx="9" cy="7" r="1"/><circle cx="14" cy="6.5" r="1"/><circle cx="16.5" cy="9.5" r="1"/>',
  package:
    '<path d="M21 8v8a1 1 0 0 1-.5.87l-8 4.5a1 1 0 0 1-1 0l-8-4.5A1 1 0 0 1 3 16V8a1 1 0 0 1 .5-.87l8-4.5a1 1 0 0 1 1 0l8 4.5A1 1 0 0 1 21 8Z"/><path d="M3.3 7.3 12 12l8.7-4.7M12 12v9"/>',
  'message-circle':
    '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"/>',
  send: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7Z"/>',
  heart: '<path d="M12 21s-7.5-4.6-10-9.5C.3 7.7 2.3 4 6 4c2 0 3.6 1.1 4.6 2.4C11.6 5.1 13.2 4 15.2 4c3.7 0 5.7 3.7 4 7.5C19.5 16.4 12 21 12 21Z"/>',
  code: '<path d="M8 6 2 12l6 6"/><path d="M16 6l6 6-6 6"/>',
  'bar-chart': '<path d="M4 20V10"/><path d="M12 20V4"/><path d="M20 20v-7"/>',
  download: '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/>',
  rocket:
    '<path d="M12 2c3 1.5 5 5 5 9 0 2-.5 3.5-1.2 4.7L12 19l-3.8-3.3C7.5 14.5 7 13 7 11c0-4 2-7.5 5-9Z"/><circle cx="12" cy="10" r="1.6"/><path d="M8.5 15.5 6 18M15.5 15.5 18 18M9 20l1-2M15 20l-1-2"/>',
  flame:
    '<path d="M12 2c1 3-3 4-3 8a3 3 0 0 0 6 0c0-1.2-.6-2-1.2-2.8.9.2 3.2 1.8 3.2 5.3a5 5 0 0 1-10 0c0-4.5 3-5.8 5-10.5Z"/>',
  star: '<path d="M12 3.5l2.5 5.4 5.9.7-4.4 4.1 1.2 5.8L12 16.7l-5.2 2.8 1.2-5.8-4.4-4.1 5.9-.7L12 3.5Z"/>',
  award:
    '<circle cx="12" cy="9" r="6"/><path d="M8.5 14.2 7 21l5-3 5 3-1.5-6.8"/>',
  'shopping-bag': '<path d="M6 8V6a6 6 0 0 1 12 0v2"/><rect x="3" y="8" width="18" height="13" rx="2"/>',
  lock: '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  bell: '<path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6"/><path d="M10.5 20a1.8 1.8 0 0 0 3 0"/>',
};

export function icon(name, { size = 20, strokeWidth = 1.8, className = '' } = {}) {
  const body = PATHS[name] || '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" class="icon${className ? ' ' + className : ''}" aria-hidden="true">${body}</svg>`;
}
