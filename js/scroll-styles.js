// How a project looks in the Scrolls feed.
//
// This used to also offer gradient presets for a text-only card. They were
// dropped: a feed whose whole purpose is showing you something is not
// served by a card with nothing on it - an empty gradient is a placeholder
// pretending to be content.
//
// What's left is the part that earns its place: a project can supply a
// portrait image just for Scrolls, because the full-screen vertical card
// crops a wide thumbnail badly.
export function scrollImageFor(project) {
  return project.scrollImageUrl || project.imageUrl || '';
}
