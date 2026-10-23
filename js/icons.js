// The interface icons. Each is an SVG file in assets/icons/ (Lucide, written by
// tools/gen-icons.mjs) that css/style.css draws as a mask: the file gives the
// shape, the element's own `color` gives the colour. So an icon follows light
// and dark mode, hover and accent colours like text does, and the markup stays
// one empty element.
//
// A few icons (heart, bookmark, star) also have a filled twin that the
// stylesheet swaps in for their "on" states - see --icon-filled.
export function icon(name, { size = 20, className = '' } = {}) {
  const safe = String(name).replace(/[^a-z0-9-]/g, '');
  return `<i class="icon${className ? ' ' + className : ''}" data-icon="${safe}" style="width:${size}px;height:${size}px" aria-hidden="true"></i>`;
}
