import { initials, safeUrl } from './utils.js';
import { showToast } from './toast.js';

// A shareable "wrapped"-style PNG of one account's stats — same numbers
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
// fail to load outright (onerror), rather than loading "tainted" — so a
// missing/misconfigured avatar host safely falls through to the initials
// fallback below instead of throwing when the canvas is later read as a
// blob.
function loadImage(url) {
  return new Promise((resolve) => {
    const safe = safeUrl(url);
    if (!safe) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = safe;
  });
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

export async function renderStatsCard({ profile, lvl, stats, topAchievement }) {
  // Custom fonts can still be loading the first time this runs; drawing
  // before they're ready would silently fall back to a system font.
  await document.fonts.ready.catch(() => {});

  const c = themeColors();
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const pad = 56;
  roundRect(ctx, pad, pad, CARD_W - pad * 2, CARD_H - pad * 2, 14);
  ctx.fillStyle = c.surface;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = c.border;
  ctx.stroke();

  const cx = CARD_W / 2;
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

  ctx.fillStyle = c.text;
  ctx.font = `700 26px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText('SHOWCASE', cx - 118 + markSize + 14, y + 1);

  y += 90;

  // Avatar
  const avatarR = 100;
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
  ctx.lineWidth = 3;
  ctx.strokeStyle = c.borderStrong;
  ctx.beginPath();
  ctx.arc(cx, y + avatarR, avatarR, 0, Math.PI * 2);
  ctx.stroke();

  y += avatarR * 2 + 56;

  // Name
  ctx.fillStyle = c.text;
  ctx.font = `700 58px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(profile.displayName, cx, y);

  y += 52;

  // Level chip
  const levelLabel = `Lv ${lvl.level}`;
  ctx.font = `700 26px ${FONT}`;
  const levelW = ctx.measureText(levelLabel).width + 40;
  roundRect(ctx, cx - levelW / 2, y - 20, levelW, 40, 6);
  ctx.fillStyle = c.primary;
  ctx.fill();
  ctx.fillStyle = c.bg;
  ctx.textBaseline = 'middle';
  ctx.fillText(levelLabel, cx, y + 1);

  y += 56;

  ctx.fillStyle = c.textMuted;
  ctx.font = `22px ${FONT}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`${lvl.xp.toLocaleString()} XP · ${lvl.xpToNextLevel.toLocaleString()} to Lv ${lvl.level + 1}`, cx, y);

  y += 30;

  // XP progress bar
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

  // Stat grid — the same four numbers as the profile's own reach row.
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
    ctx.fillStyle = c.text;
    ctx.font = `700 46px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(item.value.toLocaleString(), colCx, y);
    ctx.fillStyle = c.textFaint;
    ctx.font = `600 16px ${FONT}`;
    ctx.fillText(item.label, colCx, y + 30);
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
    ctx.fillStyle = c.textFaint;
    ctx.font = `600 16px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText('TOP ACHIEVEMENT', cx - 118, y - 18);
    ctx.fillStyle = c.text;
    ctx.font = `700 28px ${FONT}`;
    ctx.fillText(topAchievement.label, cx - 118, y + 14);
  }

  // Footer
  ctx.fillStyle = c.textFaint;
  ctx.textAlign = 'center';
  ctx.font = `20px ${FONT}`;
  ctx.fillText('Find things worth your time.', cx, CARD_H - pad - 70);
  ctx.font = `600 20px ${FONT}`;
  ctx.fillText('psekiewicz.github.io', cx, CARD_H - pad - 40);

  return canvas;
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not generate image'))), 'image/png');
  });
}

// Shares the card through the native share sheet when it can carry a file
// (most phones); otherwise downloads the PNG, since a static site has
// nowhere to host the image for a URL-based share. Needs a user gesture —
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
        text: `Lv ${opts.lvl.level} on Showcase — find things worth your time at psekiewicz.github.io`,
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
