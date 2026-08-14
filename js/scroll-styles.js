// Presets for how a project looks in the Scrolls feed. Kept here rather
// than inline so the dashboard editor, the quick-create sheet and the feed
// itself all offer and render exactly the same set — the ids are what's
// stored in projects.scroll_bg and are checked by a constraint in
// schema.sql, so adding one means editing both.
export const SCROLL_BACKGROUNDS = [
  { id: '', label: 'Automatic' },
  { id: 'dusk', label: 'Dusk' },
  { id: 'ocean', label: 'Ocean' },
  { id: 'forest', label: 'Forest' },
  { id: 'ember', label: 'Ember' },
  { id: 'violet', label: 'Violet' },
];

export function scrollBgClass(id) {
  return id && SCROLL_BACKGROUNDS.some((b) => b.id === id) ? `scroll-bg-${id}` : '';
}

// The image a Scrolls card should use: the project's dedicated Scrolls
// image if it set one, otherwise its normal thumbnail. An explicit gradient
// wins over both — that's the point of choosing one.
export function scrollImageFor(project) {
  if (project.scrollBg) return '';
  return project.scrollImageUrl || project.imageUrl || '';
}
