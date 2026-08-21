import { initials, safeUrl, escapeHtml } from './utils.js';
import { showToast } from './toast.js';

// A shareable "wrapped"-style PNG of one account's stats - same numbers
// already shown on their own profile (js/levels.js, js/achievements.js),
// packaged as an image instead of DOM so it can leave the site. Everything
// happens client-side on a <canvas>; there's no server to render it, and
// the numbers are re-read at share time so the image is always current.
const CARD_W = 1080;
const CARD_H = 1200;
const FONT = "'JetBrains Mono', monospace";

function themeColors() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name, fallback) => {
    const raw = cs.getPropertyValue(name).trim();
    return raw || fallback;
  };
  return {
    bg: v('--color-bg', '#f2efe9'),
    surface: v('--color-surface', '#fbf9f5'),
    border: v('--color-border', '#ddd7cb'),
    borderStrong: v('--color-border-strong', '#c3bcac'),
    text: v('--color-text', '#191713'),
    textMuted: v('--color-text-muted', '#5d594e'),
    textFaint: v('--color-text-faint', '#8b867a'),
    primary: v('--color-primary', '#c03a17'),
    accent: v('--color-accent', '#16645c'),
  };
}

// crossOrigin='anonymous' without a matching CORS header makes the image
// fail to load outright (onerror), rather than loading "tainted" - so a
// missing/misconfigured avatar host safely falls through instead of
// throwing when the canvas is later read as a blob.
function loadImageDirect(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// avatarUrl is any URL someone pastes into settings.html's plain text
// field - not a Supabase Storage upload - so it can point at a host that
// never sends CORS headers at all, which makes the direct load above fail
// even though the very same URL displays fine in an ordinary <img>
// elsewhere on the site. Re-fetching it through images.weserv.nl (a free,
// purpose-built image proxy that always adds permissive CORS headers)
// turns that into a real photo instead of a silent fallback to initials.
function corsProxyUrl(url) {
  return `https://images.weserv.nl/?url=${encodeURIComponent(url)}`;
}

async function loadImage(url) {
  const safe = safeUrl(url);
  if (!safe) return null;
  return (await loadImageDirect(safe)) || (await loadImageDirect(corsProxyUrl(safe)));
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCheck(ctx, cx, cy, size, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.16;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.32, cy);
  ctx.lineTo(cx - size * 0.06, cy + size * 0.3);
  ctx.lineTo(cx + size * 0.36, cy - size * 0.32);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------
// Shop cosmetics on the card.
//
// The shop's 58 items (js/shop-items.js) are CSS classes defined in
// css/style.css - gradients, tiled patterns, conic-gradient masks,
// pseudo-elements, keyframe animations, two image-based items. An earlier
// version tried rasterizing the real DOM (via an SVG <foreignObject>) into
// an image and drawing *that* onto the canvas - it turns out any <svg>
// containing a <foreignObject> permanently taints a canvas it's drawn onto,
// unconditionally, regardless of same-origin-ness or content (a deliberate
// browser restriction, not a bug to route around), which made
// canvas.toBlob()/toDataURL() throw for every card with a cosmetic.
//
// The background now goes through html2canvas instead (loaded lazily from
// esm.sh, the same no-build-step CDN pattern already used for
// @supabase/supabase-js in js/supabase-init.js): it walks the real DOM and
// paints it primitive-by-primitive rather than through an SVG image, so it
// never hits that tainting wall, and it covers tiled patterns and the one
// image-based background that no hand-written parser could. If it fails
// to load at all (offline, blocked CDN), the background falls back to the
// computed-style parser below, and only then to no cosmetic.
//
// Border and name effect stay on the computed-style parser, not
// html2canvas, for two different reasons found by actually testing it
// rather than assuming: html2canvas renders `background-clip: text`
// gradient text as a flat color (a long-standing, unfixable gap in the
// library), and it renders plain box-shadow rings - the technique 11 of
// the shop's 19 border items use - as a solid filled disc covering the
// whole avatar instead of a ring. Both would be real regressions from what
// the parser already gets right.
function withHiddenClone(html) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute;left:-99999px;top:-99999px;';
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  return wrap;
}

// Splits on top-level commas only - the ones separating gradient stops or
// box-shadow layers, not the ones inside a nested rgb(...)/hsl(...).
function splitTopLevel(str) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(str.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(str.slice(start).trim());
  return parts;
}

const COLOR_RE = /^(rgba?\([^)]+\)|hsla?\([^)]+\)|#[0-9a-f]{3,8})/i;

function parseColorToRgb(str) {
  if (!str) return null;
  const m = str.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  return m ? [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])] : null;
}

function luminance(rgb) {
  return (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
}

// Parses a *single* linear-/radial-gradient() (or its repeating- variant)
// computed value into { type, angleDeg, stops }. Multi-layer backgrounds
// (tiled dot patterns, layered textures) come back as more than one
// top-level function and are deliberately not handled here - the caller
// falls back to the element's flat background-color instead, which is
// usually a reasonable single-color stand-in for a busier pattern.
function parseSingleGradient(value) {
  if (!value || value === 'none') return null;
  const layers = splitTopLevel(value);
  if (layers.length !== 1) return null;
  const v = layers[0];
  const linear = v.match(/^(?:repeating-)?linear-gradient\((.+)\)$/s);
  const radial = v.match(/^(?:repeating-)?radial-gradient\((.+)\)$/s);
  if (!linear && !radial) return null;
  const args = splitTopLevel((linear || radial)[1]);
  let angleDeg = 180; // CSS default direction, "to bottom"
  let stopArgs = args;
  if (linear && /deg$/.test(args[0])) {
    angleDeg = parseFloat(args[0]);
    stopArgs = args.slice(1);
  } else if (radial && !COLOR_RE.test(args[0])) {
    stopArgs = args.slice(1); // drop the shape/position descriptor, e.g. "circle at 50% 50%"
  }
  const stops = [];
  for (let i = 0; i < stopArgs.length; i++) {
    const m = stopArgs[i].match(COLOR_RE);
    if (!m) return null; // a stop we can't read (e.g. a px offset) - bail rather than mis-render
    const rest = stopArgs[i].slice(m[0].length).trim();
    const pctMatch = rest.match(/^([\d.]+)%$/);
    if (!pctMatch && rest) return null; // px-based stops etc. - same bail
    const pct = pctMatch ? parseFloat(pctMatch[1]) : (i / Math.max(1, stopArgs.length - 1)) * 100;
    stops.push({ color: m[1], pct });
  }
  return stops.length >= 2 ? { type: linear ? 'linear' : 'radial', angleDeg, stops } : null;
}

function linearGradientForRect(ctx, angleDeg, stops, x, y, w, h) {
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const halfLen = 0.5 * (Math.abs(w * dx) + Math.abs(h * dy));
  const grad = ctx.createLinearGradient(cx - dx * halfLen, cy - dy * halfLen, cx + dx * halfLen, cy + dy * halfLen);
  stops.forEach((s) => grad.addColorStop(Math.min(1, Math.max(0, s.pct / 100)), s.color));
  return grad;
}

function radialGradientForCircle(ctx, stops, cx, cy, r) {
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  stops.forEach((s) => grad.addColorStop(Math.min(1, Math.max(0, s.pct / 100)), s.color));
  return grad;
}

function parseShadowLayers(value) {
  if (!value || value === 'none') return [];
  return splitTopLevel(value)
    .map((layer) => {
      const m = layer.match(COLOR_RE);
      if (!m) return null;
      const nums = layer
        .slice(m[0].length)
        .trim()
        .split(/\s+/)
        .map((n) => parseFloat(n) || 0);
      return { color: m[1], offsetX: nums[0] || 0, offsetY: nums[1] || 0, blur: nums[2] || 0, spread: nums[3] || 0 };
    })
    .filter(Boolean);
}

function parseConicColors(value) {
  if (!value || !/^conic-gradient\(/.test(value)) return null;
  const colors = value.match(/rgba?\([^)]+\)|hsla?\([^)]+\)|#[0-9a-f]{3,8}/gi);
  return colors && colors.length >= 2 ? colors : null;
}

// Lazy CDN import, fetched only the first time a card actually needs it -
// matches js/supabase-init.js's existing esm.sh pattern, so this stays
// true to "no build step, no npm install" while still pulling in real
// third-party code for the one thing a hand-written parser can't do.
let html2canvasPromise = null;
function loadHtml2Canvas() {
  if (!html2canvasPromise) {
    html2canvasPromise = import('https://esm.sh/html2canvas@1.4.1').then((m) => m.default);
  }
  return html2canvasPromise;
}

// Same-origin content only (no avatar photo, no cross-origin anything), so
// reading pixels back out never taints - used to decide legible text color
// against whatever html2canvas actually painted, the same way
// drawBgCosmetic()'s gradient-stop average does for the fallback path.
function sampleLuminance(canvas) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const grid = 6;
  let total = 0;
  let count = 0;
  for (let i = 0; i < grid; i++) {
    for (let j = 0; j < grid; j++) {
      const x = Math.min(w - 1, Math.floor((w * (i + 0.5)) / grid));
      const y = Math.min(h - 1, Math.floor((h * (j + 0.5)) / grid));
      const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
      total += (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      count++;
    }
  }
  return count ? total / count : null;
}

async function captureBgHtml2Canvas(bgClass, w, h) {
  if (!bgClass) return null;
  const wrap = withHiddenClone(`<div class="profile-header has-profile-bg ${bgClass}" style="width:${w}px;height:${h}px;"></div>`);
  try {
    const html2canvas = await loadHtml2Canvas();
    return await html2canvas(wrap.firstElementChild, { backgroundColor: null, logging: false });
  } catch {
    return null;
  } finally {
    wrap.remove();
  }
}

// Borders were tried through html2canvas too, but it renders plain
// box-shadow rings - the technique 11 of the shop's 19 border items use -
// as a solid filled disc covering the whole avatar instead of a thin ring,
// a real regression found by actually testing it rather than assuming.
// Conic-gradient and the image-based border render fine through it, but
// that's a minority; the computed-style parser below gets the common case
// right, so borders stay on that path entirely rather than a per-item
// split that would need maintaining forever.

// ---- Background ----

function readBgCosmetic(bgClass) {
  if (!bgClass) return null;
  const wrap = withHiddenClone(`<div class="profile-header has-profile-bg ${bgClass}" style="width:100px;height:100px;"></div>`);
  try {
    const cs = getComputedStyle(wrap.firstElementChild);
    return { gradient: parseSingleGradient(cs.backgroundImage), color: cs.backgroundColor };
  } finally {
    wrap.remove();
  }
}

// Returns the background's approximate luminance (0=dark, 1=light) so the
// caller can pick legible text over it, or null if nothing was drawn.
function drawBgCosmetic(ctx, cosmetic, x, y, w, h) {
  if (!cosmetic) return null;
  if (cosmetic.gradient) {
    ctx.fillStyle =
      cosmetic.gradient.type === 'linear'
        ? linearGradientForRect(ctx, cosmetic.gradient.angleDeg, cosmetic.gradient.stops, x, y, w, h)
        : radialGradientForCircle(ctx, cosmetic.gradient.stops, x + w / 2, y + h / 2, Math.max(w, h) / 2);
    ctx.fillRect(x, y, w, h);
    const lums = cosmetic.gradient.stops.map((s) => parseColorToRgb(s.color)).filter(Boolean).map(luminance);
    return lums.length ? lums.reduce((a, b) => a + b, 0) / lums.length : null;
  }
  const rgb = parseColorToRgb(cosmetic.color);
  if (rgb && cosmetic.color !== 'rgba(0, 0, 0, 0)') {
    ctx.fillStyle = cosmetic.color;
    ctx.fillRect(x, y, w, h);
    return luminance(rgb);
  }
  return null;
}

// ---- Avatar border ----

function readBorderCosmetic(borderClass) {
  if (!borderClass) return null;
  const wrap = withHiddenClone(
    `<div class="profile-avatar ${borderClass}" style="width:200px;height:200px;position:relative;"></div>`
  );
  try {
    const el = wrap.firstElementChild;
    const cs = getComputedStyle(el);
    const afterCs = getComputedStyle(el, '::after');
    return {
      shadowLayers: parseShadowLayers(cs.boxShadow),
      outlineStyle: cs.outlineStyle,
      outlineColor: cs.outlineColor,
      outlineWidth: parseFloat(cs.outlineWidth) || 0,
      conicColors: parseConicColors(afterCs.backgroundImage),
    };
  } finally {
    wrap.remove();
  }
}

function drawBorderCosmetic(ctx, cosmetic, cx, cy, avatarR) {
  if (!cosmetic) return false;

  const crisp = cosmetic.shadowLayers.filter((l) => l.blur === 0 && l.spread > 0);
  const glow = cosmetic.shadowLayers.filter((l) => l.blur > 0).sort((a, b) => b.blur - a.blur)[0];

  if (crisp.length) {
    crisp.forEach((layer) => {
      ctx.save();
      if (glow) {
        ctx.shadowColor = glow.color;
        ctx.shadowBlur = glow.blur;
      }
      ctx.lineWidth = Math.max(2, layer.spread * 2);
      ctx.strokeStyle = layer.color;
      ctx.beginPath();
      ctx.arc(cx, cy, avatarR + layer.spread / 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });
    return true;
  }

  if (cosmetic.outlineStyle === 'dashed' && cosmetic.outlineWidth > 0) {
    ctx.save();
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = cosmetic.outlineWidth;
    ctx.strokeStyle = cosmetic.outlineColor;
    ctx.beginPath();
    ctx.arc(cx, cy, avatarR + cosmetic.outlineWidth, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return true;
  }

  if (cosmetic.conicColors && typeof ctx.createConicGradient === 'function') {
    const grad = ctx.createConicGradient(0, cx, cy);
    cosmetic.conicColors.forEach((color, i) => grad.addColorStop(i / (cosmetic.conicColors.length - 1), color));
    ctx.save();
    ctx.lineWidth = 6;
    ctx.strokeStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, avatarR + 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return true;
  }

  return false; // e.g. the one image-based border (Blue Flame) - caller keeps the plain ring
}

// ---- Name effect ----

async function readNameCosmetic(nameClass, displayName) {
  if (!nameClass) return null;
  // The one cosmetic that swaps typefaces - give its font a chance to
  // actually finish loading before it's measured/drawn.
  if (nameClass === 'shop-name-oxygene') {
    await document.fonts.load("700 58px 'Oxygene 1'").catch(() => {});
  }
  const wrap = withHiddenClone(`<span class="${nameClass}">${escapeHtml(displayName)}</span>`);
  try {
    const cs = getComputedStyle(wrap.firstElementChild);
    return {
      color: cs.color,
      gradient: parseSingleGradient(cs.backgroundImage),
      shadow: parseShadowLayers(cs.textShadow)[0] || null,
      uppercase: cs.textTransform === 'uppercase',
      letterSpacing: cs.letterSpacing,
      strokeWidth: parseFloat(cs.webkitTextStrokeWidth) || 0,
      strokeColor: cs.webkitTextStrokeColor,
      fontFamily: cs.fontFamily,
      textDecoration: cs.textDecorationLine,
      decorationColor: cs.textDecorationColor,
    };
  } finally {
    wrap.remove();
  }
}

// Draws the name with as much of the cosmetic as canvas can express
// natively; returns false (caller falls back to plain themed text) only
// when there's truly nothing usable to draw with - e.g. gradient-clipped
// text whose specific gradient this parser didn't recognize.
function drawNameCosmetic(ctx, cosmetic, rawText, cx, y, fontPx) {
  if (!cosmetic) return false;
  const text = cosmetic.uppercase ? rawText.toUpperCase() : rawText;
  const isTransparent = /,\s*0\s*\)$/.test(cosmetic.color) || cosmetic.color === 'transparent';

  let fillStyle = null;
  if (isTransparent && cosmetic.gradient) {
    ctx.font = `700 ${fontPx}px ${cosmetic.fontFamily || FONT}`;
    const w = ctx.measureText(text).width;
    fillStyle =
      cosmetic.gradient.type === 'linear'
        ? linearGradientForRect(ctx, cosmetic.gradient.angleDeg, cosmetic.gradient.stops, cx - w / 2, y - fontPx, w, fontPx * 1.3)
        : radialGradientForCircle(ctx, cosmetic.gradient.stops, cx, y - fontPx * 0.35, w / 2);
  } else if (!isTransparent) {
    fillStyle = cosmetic.color;
  }
  if (!fillStyle && cosmetic.strokeWidth === 0) return false;

  ctx.save();
  ctx.font = `700 ${fontPx}px ${cosmetic.fontFamily || FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  if ('letterSpacing' in ctx && cosmetic.letterSpacing && parseFloat(cosmetic.letterSpacing)) {
    ctx.letterSpacing = cosmetic.letterSpacing;
  }
  if (cosmetic.shadow) {
    ctx.shadowColor = cosmetic.shadow.color;
    ctx.shadowBlur = cosmetic.shadow.blur;
    ctx.shadowOffsetX = cosmetic.shadow.offsetX;
    ctx.shadowOffsetY = cosmetic.shadow.offsetY;
  }
  if (fillStyle) {
    ctx.fillStyle = fillStyle;
    ctx.fillText(text, cx, y);
  }
  if (cosmetic.strokeWidth > 0) {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.lineWidth = cosmetic.strokeWidth;
    ctx.strokeStyle = cosmetic.strokeColor;
    ctx.strokeText(text, cx, y);
  }
  if (cosmetic.textDecoration === 'underline') {
    const w = ctx.measureText(text).width;
    ctx.strokeStyle = cosmetic.decorationColor || fillStyle || cosmetic.color;
    ctx.lineWidth = Math.max(2, fontPx * 0.05);
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, y + fontPx * 0.12);
    ctx.lineTo(cx + w / 2, y + fontPx * 0.12);
    ctx.stroke();
  }
  ctx.restore();
  return true;
}

export async function renderStatsCard({ profile, lvl, stats, topAchievement }) {
  // Custom fonts can still be loading the first time this runs; drawing
  // before they're ready would silently fall back to a system font.
  await document.fonts.ready.catch(() => {});

  const c = themeColors();
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');

  const pad = 56;
  const cx = CARD_W / 2;
  const avatarR = 100;
  const bgW = CARD_W - pad * 2;
  const bgH = CARD_H - pad * 2;

  const bgClassName = profile.equippedBg && profile.equippedBg !== 'none' ? `shop-${profile.equippedBg}` : '';
  const borderClassName = profile.equippedBorder && profile.equippedBorder !== 'none' ? `shop-${profile.equippedBorder}` : '';
  const nameClassName =
    profile.equippedNameEffect && profile.equippedNameEffect !== 'none' ? `shop-${profile.equippedNameEffect}` : '';

  // html2canvas is the primary path for the background (real fidelity -
  // tiled patterns, the one image-based background); the computed-style
  // parser is the fallback if it can't load at all, and only then does the
  // card fall back further to no cosmetic. Border and name never go
  // through html2canvas (see the comments above) - both are read directly.
  const [bgCanvas, borderCosmetic, nameCosmetic] = await Promise.all([
    captureBgHtml2Canvas(bgClassName, bgW, bgH),
    Promise.resolve(readBorderCosmetic(borderClassName)),
    readNameCosmetic(nameClassName, profile.displayName),
  ]);
  const bgCosmeticFallback = !bgCanvas && bgClassName ? readBgCosmetic(bgClassName) : null;

  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  roundRect(ctx, pad, pad, bgW, bgH, 14);
  ctx.fillStyle = c.surface;
  ctx.fill();
  ctx.save();
  roundRect(ctx, pad, pad, bgW, bgH, 14);
  ctx.clip();
  let bgLum = null;
  if (bgCanvas) {
    ctx.drawImage(bgCanvas, pad, pad, bgW, bgH);
    bgLum = sampleLuminance(bgCanvas);
  } else {
    bgLum = drawBgCosmetic(ctx, bgCosmeticFallback, pad, pad, bgW, bgH);
  }
  ctx.restore();
  ctx.lineWidth = 2;
  ctx.strokeStyle = c.border;
  ctx.stroke();

  // A cosmetic background can be any color, so text legibility is decided
  // from its actual measured brightness rather than a hardcoded id list -
  // this keeps working automatically for any background the shop adds later.
  const textScheme =
    bgLum === null
      ? { text: c.text, muted: c.textMuted, faint: c.textFaint, shadow: null }
      : bgLum > 0.55
      ? { text: '#191713', muted: 'rgba(25,23,19,.72)', faint: 'rgba(25,23,19,.72)', shadow: 'rgba(255,255,255,.55)' }
      : { text: '#ffffff', muted: 'rgba(255,255,255,.78)', faint: 'rgba(255,255,255,.78)', shadow: 'rgba(0,0,0,.35)' };

  function withTextShadow(fn) {
    if (textScheme.shadow) {
      ctx.shadowColor = textScheme.shadow;
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 1;
    }
    fn();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }

  let y = pad + 76;

  // Brand row
  const markSize = 40;
  roundRect(ctx, cx - 118, y - markSize / 2, markSize, markSize, 6);
  ctx.fillStyle = c.primary;
  ctx.fill();
  ctx.fillStyle = c.bg;
  ctx.font = `700 22px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('S', cx - 118 + markSize / 2, y + 1);

  withTextShadow(() => {
    ctx.fillStyle = textScheme.text;
    ctx.font = `700 26px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('SHOWCASE', cx - 118 + markSize + 14, y + 1);
  });

  y += 90;

  // Avatar photo - the only place a cross-origin image is ever loaded,
  // via the CORS-safe crossOrigin='anonymous' path (fails cleanly to the
  // initials fallback on a CORS miss, never taints).
  const img = await loadImage(profile.avatarUrl);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, y + avatarR, avatarR, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (img) {
    const scale = Math.max((avatarR * 2) / img.width, (avatarR * 2) / img.height);
    const iw = img.width * scale;
    const ih = img.height * scale;
    ctx.drawImage(img, cx - iw / 2, y + avatarR - ih / 2, iw, ih);
  } else {
    const grad = ctx.createLinearGradient(cx - avatarR, y, cx + avatarR, y + avatarR * 2);
    grad.addColorStop(0, c.primary);
    grad.addColorStop(1, c.accent);
    ctx.fillStyle = grad;
    ctx.fillRect(cx - avatarR, y, avatarR * 2, avatarR * 2);
    ctx.fillStyle = '#fff';
    ctx.font = `700 64px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials(profile.displayName), cx, y + avatarR + 4);
  }
  ctx.restore();

  const borderDrawn = drawBorderCosmetic(ctx, borderCosmetic, cx, y + avatarR, avatarR);
  if (!borderDrawn) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = c.borderStrong;
    ctx.beginPath();
    ctx.arc(cx, y + avatarR, avatarR, 0, Math.PI * 2);
    ctx.stroke();
  }

  y += avatarR * 2 + 56;

  // Name
  const nameDrawn = drawNameCosmetic(ctx, nameCosmetic, profile.displayName, cx, y, 58);
  if (!nameDrawn) {
    withTextShadow(() => {
      ctx.fillStyle = textScheme.text;
      ctx.font = `700 58px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(profile.displayName, cx, y);
    });
  }

  y += 52;

  // Level chip - drawn on the solid primary swatch, not the card
  // background, so it keeps its own fixed contrast regardless of textScheme.
  const levelLabel = `Lv ${lvl.level}`;
  ctx.font = `700 26px ${FONT}`;
  const levelW = ctx.measureText(levelLabel).width + 40;
  roundRect(ctx, cx - levelW / 2, y - 20, levelW, 40, 6);
  ctx.fillStyle = c.primary;
  ctx.fill();
  ctx.fillStyle = c.bg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(levelLabel, cx, y + 1);

  y += 56;

  withTextShadow(() => {
    ctx.fillStyle = textScheme.muted;
    ctx.font = `22px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`${lvl.xp.toLocaleString()} XP · ${lvl.xpToNextLevel.toLocaleString()} to Lv ${lvl.level + 1}`, cx, y);
  });

  y += 30;

  // XP progress bar - theme-colored, unchanged regardless of a background
  // cosmetic (the real profile page doesn't tint this under one either).
  const barW = CARD_W - pad * 2 - 160;
  const barX = cx - barW / 2;
  const barH = 14;
  roundRect(ctx, barX, y, barW, barH, 7);
  ctx.fillStyle = c.border;
  ctx.fill();
  roundRect(ctx, barX, y, Math.max(barH, barW * lvl.progress), barH, 7);
  ctx.fillStyle = c.primary;
  ctx.fill();

  y += 64;

  ctx.strokeStyle = c.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad + 48, y);
  ctx.lineTo(CARD_W - pad - 48, y);
  ctx.stroke();

  y += 64;

  // Stat grid - the same four numbers as the profile's own reach row.
  const statItems = [
    { value: stats.projectsPublished, label: 'PUBLISHED' },
    { value: stats.followerCount, label: 'FOLLOWERS' },
    { value: stats.totalLikes, label: 'LIKES' },
    { value: stats.uniqueViewers, label: 'VIEWERS' },
  ];
  const gridW = CARD_W - pad * 2 - 96;
  const colW = gridW / statItems.length;
  const gridX = cx - gridW / 2;
  statItems.forEach((item, i) => {
    const colCx = gridX + colW * i + colW / 2;
    withTextShadow(() => {
      ctx.fillStyle = textScheme.text;
      ctx.font = `700 46px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(item.value.toLocaleString(), colCx, y);
      ctx.fillStyle = textScheme.faint;
      ctx.font = `600 16px ${FONT}`;
      ctx.fillText(item.label, colCx, y + 30);
    });
    if (i > 0) {
      ctx.strokeStyle = c.border;
      ctx.beginPath();
      ctx.moveTo(gridX + colW * i, y - 46);
      ctx.lineTo(gridX + colW * i, y + 40);
      ctx.stroke();
    }
  });

  y += 96;

  if (topAchievement) {
    ctx.strokeStyle = c.border;
    ctx.beginPath();
    ctx.moveTo(pad + 48, y);
    ctx.lineTo(CARD_W - pad - 48, y);
    ctx.stroke();
    y += 56;

    drawCheck(ctx, cx - 150, y - 8, 26, c.primary);
    withTextShadow(() => {
      ctx.fillStyle = textScheme.faint;
      ctx.font = `600 16px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillText('TOP ACHIEVEMENT', cx - 118, y - 18);
      ctx.fillStyle = textScheme.text;
      ctx.font = `700 28px ${FONT}`;
      ctx.fillText(topAchievement.label, cx - 118, y + 14);
    });
  }

  // Footer
  withTextShadow(() => {
    ctx.fillStyle = textScheme.faint;
    ctx.textAlign = 'center';
    ctx.font = `20px ${FONT}`;
    ctx.fillText('Find things worth your time.', cx, CARD_H - pad - 70);
    ctx.font = `600 20px ${FONT}`;
    ctx.fillText('psekiewicz.github.io', cx, CARD_H - pad - 40);
  });

  return canvas;
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not generate image'))), 'image/png');
  });
}

// Shares the card through the native share sheet when it can carry a file
// (most phones); otherwise downloads the PNG, since a static site has
// nowhere to host the image for a URL-based share. Needs a user gesture -
// only ever call this from a click handler.
export async function shareStatsCard(opts) {
  const canvas = await renderStatsCard(opts);
  const blob = await canvasToBlob(canvas);

  const fileName = `showcase-${(opts.profile.displayName || 'stats').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
  const file = new File([blob], fileName, { type: 'image/png' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'My Showcase stats',
        text: `Lv ${opts.lvl.level} on Showcase - find things worth your time at psekiewicz.github.io`,
      });
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      // Any other failure (e.g. share sheet unavailable for this file
      // after all) falls through to the download below.
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast({ title: 'Stats card saved', body: 'Share it wherever you like.', iconName: 'award', duration: 3500 });
}
