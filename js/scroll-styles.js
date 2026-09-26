import { firstImage } from './markdown.js';

// How a project looks in the Scrolls feed.
//
// This used to also offer gradient presets for a text-only card. They were
// dropped: a feed whose whole purpose is showing you something is not
// served by a card with nothing on it - an empty gradient is a placeholder
// pretending to be content.
//
// What's left is the part that earns its place: a project can supply a
// portrait image just for Scrolls, because the full-screen vertical card
// crops a wide thumbnail badly. Failing both, the first picture inside the
// post itself - the same fallback the home feed uses, so a post whose only
// images are in its body does not show a picture on one and initials on the
// other.
export function scrollImageFor(project) {
  return project.scrollImageUrl || project.imageUrl || firstImage(project.description) || '';
}
