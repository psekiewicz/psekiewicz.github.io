// Writes the interface icons as SVG files in assets/icons/, plus the stylesheet
// block that draws them.
//
//   node tools/gen-icons.mjs
//
// The icons come from Lucide (ISC licence, assets/icons/LICENSE-lucide.txt),
// pinned to VERSION so the files only change when this number does. Each is
// saved as a black stroke on transparent, because the site draws them as a CSS
// mask (css/style.css, between the icons:start and icons:end markers): the
// file supplies the shape and the element's own `color` supplies the colour, so
// one file serves light mode, dark mode, hover and every accent.
//
// To try another set, change SOURCE below (and NAMES where the names differ),
// and re-run.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'assets', 'icons');

const VERSION = '1.56.0';
const SOURCE = (name) => `https://cdn.jsdelivr.net/npm/lucide-static@${VERSION}/icons/${name}.svg`;
const LICENSE = `https://cdn.jsdelivr.net/npm/lucide-static@${VERSION}/LICENSE`;

// Our name -> the set's name.
const NAMES = {
  home: 'house',
  film: 'film',
  plus: 'plus',
  grid: 'layout-grid',
  user: 'user',
  moon: 'moon',
  sun: 'sun',
  x: 'x',
  shield: 'shield',
  'shield-check': 'shield-check',
  folder: 'folder',
  globe: 'globe',
  users: 'users',
  'external-link': 'external-link',
  'arrow-left': 'arrow-left',
  trash: 'trash-2',
  eye: 'eye',
  pencil: 'pencil',
  search: 'search',
  smartphone: 'smartphone',
  gamepad: 'gamepad-2',
  palette: 'palette',
  package: 'package',
  'message-circle': 'message-circle',
  send: 'send',
  heart: 'heart',
  code: 'code',
  'bar-chart': 'chart-column',
  download: 'download',
  rocket: 'rocket',
  flame: 'flame',
  star: 'star',
  award: 'award',
  'shopping-bag': 'shopping-bag',
  coin: 'coins',
  lock: 'lock',
  check: 'check',
  music: 'music',
  image: 'image',
  play: 'play',
  settings: 'settings',
  'log-out': 'log-out',
  bell: 'bell',
  bookmark: 'bookmark',
  flag: 'flag',
  share: 'share-2',
  pause: 'pause',
  'volume-2': 'volume-2',
  'volume-x': 'volume-x',
};

// Icons that have an "on" look: the like heart, the saved bookmark, a starred
// item. Each also gets <name>-filled.svg, which the stylesheet swaps in.
const FILLED = ['heart', 'bookmark', 'star'];

// Where the set's own drawing needs a touch. The lock gets the small keyhole
// dot the other icons' details are drawn with (a zero-length round-capped line).
const EXTRA = {
  lock: '<path d="M12 16h.01"/>',
};

const wrap = (inner, fill) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${fill}" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>\n`;

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res.text();
}

mkdirSync(OUT, { recursive: true });

for (const [name, source] of Object.entries(NAMES)) {
  const svg = await get(SOURCE(source));
  const inner = svg
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>[\s\S]*$/, '')
    .replace(/\s+/g, ' ')
    .replace(/> </g, '><')
    .trim() + (EXTRA[name] || '');
  writeFileSync(join(OUT, `${name}.svg`), wrap(inner, 'none'));
  if (FILLED.includes(name)) writeFileSync(join(OUT, `${name}-filled.svg`), wrap(inner, '#000'));
}
writeFileSync(join(OUT, 'LICENSE-lucide.txt'), await get(LICENSE));

// The stylesheet block: one rule per icon sets the shape; .icon itself paints it.
const rules = Object.keys(NAMES)
  .map((name) => {
    const own = `--icon-outline: url('/assets/icons/${name}.svg');`;
    const filled = FILLED.includes(name) ? ` --icon-filled: url('/assets/icons/${name}-filled.svg');` : '';
    return `.icon[data-icon='${name}'] { ${own}${filled} --icon: var(--icon-outline); }`;
  })
  .join('\n');
const block = `/* icons:start - written by tools/gen-icons.mjs, do not edit by hand */\n${rules}\n/* icons:end */`;

const cssPath = join(root, 'css', 'style.css');
const raw = readFileSync(cssPath, 'utf8');
const crlf = raw.includes('\r\n');
const css = raw.replace(/\r\n/g, '\n');
const next = /\/\* icons:start[\s\S]*?\/\* icons:end \*\//.test(css)
  ? css.replace(/\/\* icons:start[\s\S]*?\/\* icons:end \*\//, block)
  : css.replace('/* ---------- Icon animations ---------- */', `${block}\n\n/* ---------- Icon animations ---------- */`);
writeFileSync(cssPath, crlf ? next.replace(/\n/g, '\r\n') : next);

// The app draws the same Lucide shapes (mobile/src/components/icons.tsx), so the
// site and the app cannot drift apart. They are written as data, element by
// element, because react-native-svg wants components rather than markup. The
// app keeps its own, heavier stroke weight (set in icons.tsx).
const APP_ICONS = {
  refresh: 'rotate-cw',
  bell: 'bell',
  search: 'search',
  play: 'play',
  heart: 'heart',
  comment: 'message-circle',
  external: 'external-link',
  bookmark: 'bookmark',
  sun: 'sun',
  settings: 'settings-2',
  home: 'house',
  scrolls: 'film',
  plus: 'plus',
  back: 'arrow-left',
  'chevron-down': 'chevron-down',
  chart: 'chart-no-axes-column',
  user: 'user',
  star: 'star',
  trophy: 'trophy',
  share: 'share-2',
  pencil: 'pencil',
  lock: 'lock',
  music: 'music',
  image: 'image',
};

function shapesOf(inner) {
  const shapes = [];
  for (const m of inner.matchAll(/<(path|circle|rect|line|polyline|polygon|ellipse)\b([^>]*?)\/?>/g)) {
    const attrs = {};
    for (const a of m[2].matchAll(/([a-zA-Z0-9-]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
    shapes.push([m[1], attrs]);
  }
  return shapes;
}

const appShapes = {};
for (const [appName, source] of Object.entries(APP_ICONS)) {
  const svg = await get(SOURCE(source));
  const inner = svg.replace(/<!--[\s\S]*?-->/g, '').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>[\s\S]*$/, '');
  const shapes = shapesOf(inner);
  if (EXTRA[appName]) shapes.push(...shapesOf(EXTRA[appName]));
  appShapes[appName] = shapes;
}
const appFile =
  '// Written by tools/gen-icons.mjs from Lucide ' + VERSION + ' (ISC) - do not edit by hand.\n' +
  '// Each icon is a list of [element, attributes] pairs for icons.tsx to draw.\n\n' +
  'export type Shape = [\n  element: \'path\' | \'circle\' | \'rect\' | \'line\' | \'polyline\' | \'polygon\' | \'ellipse\',\n  attributes: Record<string, string>,\n];\n\n' +
  'export const SHAPES: Record<string, Shape[]> = ' + JSON.stringify(appShapes, null, 2) + ';\n';
writeFileSync(join(root, 'mobile', 'src', 'components', 'iconShapes.ts'), appFile);

console.log(`${Object.keys(NAMES).length} icons (+${FILLED.length} filled) written to assets/icons/, stylesheet updated; ${Object.keys(APP_ICONS).length} shapes for the app`);
