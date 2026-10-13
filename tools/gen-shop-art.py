#!/usr/bin/env python3
"""Renders the shop's cosmetic artwork into assets/shop/.

    python3 tools/gen-shop-art.py            # everything
    python3 tools/gen-shop-art.py bg-aurora  # just the named items

Needs numpy and Pillow. Output is deterministic (every random source is
seeded), so re-running it produces the same files.

Not everything in the shop is made here: bg-blocks (assets/shop/bg-blocks.webp)
and border-flame (assets/shop/border-flame.png) are hand-made art, and
name-oxygene is a typeface (fonts/oxygene-1.ttf), not a picture.

Three kinds of file come out, all WebP (animated where the item moves):

  assets/shop/bg/<id>.webp      800x240  profile backgrounds, drawn edge to edge
  assets/shop/border/<id>.webp  240x240  avatar frames, transparent, see FRAME
  assets/shop/name/<id>.webp    256x64   nickname fills, stretched over the text

Animated items also get <id>.still.webp (first frame), which the stylesheet
swaps in under prefers-reduced-motion.

FRAME geometry: the frame image is 4/3 the size of the avatar it surrounds.
The transparent hole is HOLE/SIZE = 75% of the image, so the frame is
positioned at -16.667% / 133.333% of the avatar (css/style.css and
mobile/src/components/ui.tsx both use those numbers).
"""
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = Path(__file__).resolve().parent.parent / 'assets' / 'shop'
BG_W, BG_H = 800, 240
FR = 240          # frame image size in px
HOLE = 0.75       # transparent hole, as a fraction of FR
NAME_W, NAME_H = 256, 64
TAU = 2 * math.pi


# ---------------------------------------------------------------- helpers

def hexc(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32) / 255.0


def ramp(stops, t):
    """Colour ramp: stops = [(pos, '#hex'), ...], t = array in 0..1 -> (...,3)."""
    pos = [p for p, _ in stops]
    cols = np.stack([hexc(c) for _, c in stops])
    t = np.clip(t, 0, 1)
    return np.stack([np.interp(t, pos, cols[:, i]) for i in range(3)], axis=-1)


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def to_img(arr, alpha=None):
    rgb = (np.clip(arr, 0, 1) * 255).astype(np.uint8)
    if alpha is None:
        return Image.fromarray(rgb, 'RGB')
    a = (np.clip(alpha, 0, 1) * 255).astype(np.uint8)
    return Image.fromarray(np.dstack([rgb, a]), 'RGBA')


def blur(arr, radius):
    """Gaussian blur on a float HxW or HxWx3 array."""
    if arr.ndim == 2:
        im = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8))
        return np.asarray(im.filter(ImageFilter.GaussianBlur(radius)), dtype=np.float32) / 255
    return np.stack([blur(arr[..., i], radius) for i in range(arr.shape[-1])], axis=-1)


def grid(w, h):
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    return x / w, y / h


def over(base, color, a):
    """Alpha-composite a flat/array colour onto base (RGB), a = HxW coverage."""
    a = a[..., None]
    return base * (1 - a) + np.asarray(color, dtype=np.float32) * a


def save(name, kind, frames, duration=100, quality=72):
    """frames: list of PIL images. Static items pass a single frame."""
    d = OUT / kind
    d.mkdir(parents=True, exist_ok=True)
    path = d / f'{name}.webp'
    opts = dict(quality=quality, method=6)
    if frames[0].mode == 'RGBA':
        opts['alpha_quality'] = 90
    if len(frames) == 1:
        frames[0].save(path, 'WEBP', **opts)
        still = path.with_suffix('.still.webp')
        if still.exists():
            still.unlink()
    else:
        frames[0].save(path, 'WEBP', save_all=True, append_images=frames[1:],
                       duration=duration, loop=0, **opts)
        frames[0].save(path.with_suffix('.still.webp'), 'WEBP', **opts)
    print(f'{kind}/{name}: {len(frames)} frame(s), {path.stat().st_size // 1024} KB')


# ------------------------------------------------------------ backgrounds

def bg_paper():
    rng = np.random.default_rng(1)
    x, y = grid(BG_W, BG_H)
    base = ramp([(0, '#f6f0e2'), (1, '#ebe2cd')], y * 0.6 + x * 0.4)
    fibres = blur(rng.random((BG_H, BG_W)).astype(np.float32), 1.1)
    base = base * (0.965 + 0.06 * fibres[..., None])
    # Faint ruled lines, like the notebook the site is dressed as.
    rule = (np.arange(BG_H)[:, None] % 40 == 0).astype(np.float32) * np.ones((1, BG_W), np.float32)
    base = over(base, hexc('#a89b7c'), rule * 0.13)
    vig = smooth(0.35, 1.2, np.hypot(x - 0.5, (y - 0.5) * 1.6))
    base *= 1 - 0.1 * vig[..., None]
    return [to_img(base)]


def bg_sunset():
    x, y = grid(BG_W, BG_H)
    sky = ramp([(0, '#3b1c5a'), (0.35, '#c2417a'), (0.62, '#ff8a3d'), (1, '#ffd36b')], y * 1.15)
    # Sun, half-sunk behind the first ridge.
    sun = smooth(0.105, 0.095, np.hypot((x - 0.68) * 3.33, y - 0.62))
    sky = over(sky, hexc('#fff1c2'), sun)
    glow = blur(sun, 18)
    sky = np.clip(sky + glow[..., None] * np.array([0.5, 0.25, 0.05]), 0, 1)
    for i, (col, base_y, amp, ph) in enumerate([('#5b2a63', 0.70, 0.045, 0.4),
                                                 ('#3b1d4f', 0.80, 0.05, 2.1),
                                                 ('#1f1033', 0.90, 0.04, 4.0)]):
        ridge = base_y + amp * np.sin(x * TAU * (1.3 + i * 0.5) + ph) + amp * 0.5 * np.sin(x * TAU * 3.7 + ph * 2)
        sky = over(sky, hexc(col), (y > ridge).astype(np.float32))
    return [to_img(sky)]


def bg_aurora():
    frames = []
    x, y = grid(BG_W, BG_H)
    rng = np.random.default_rng(7)
    stars = (rng.random((BG_H, BG_W)) > 0.9985).astype(np.float32)
    stars = blur(stars, 0.7) * 3
    n = 16
    for f in range(n):
        t = f / n * TAU
        sky = ramp([(0, '#050b1f'), (1, '#10264a')], y)
        sky = np.clip(sky + stars[..., None] * 0.8 * smooth(0.55, 0.0, y)[..., None], 0, 1)
        total = np.zeros_like(sky)
        for k, (col, y0, ph, fr) in enumerate([('#2dffb0', 0.38, 0.0, 2.0),
                                                ('#4ac8ff', 0.46, 1.7, 3.0),
                                                ('#b46bff', 0.30, 3.4, 2.0)]):
            wave = (y0 + 0.09 * np.sin(x * TAU * fr + ph + t) + 0.04 * np.sin(x * TAU * (fr * 2.1) + t * 2 + ph)
                    + 0.03 * np.sin(x * TAU * 0.7 - t))
            d = (y - wave)
            band = np.exp(-(np.where(d < 0, d * 4.5, d * 11)) ** 2 * 18)
            curtain = band * (0.55 + 0.45 * np.sin(x * TAU * (fr * 5) + t * (1 + k) + ph))
            total += curtain[..., None] * hexc(col)
        sky = 1 - (1 - sky) * (1 - np.clip(total * 0.75, 0, 1))
        frames.append(to_img(sky))
    return frames


def bg_paws():
    rng = np.random.default_rng(11)
    x, y = grid(BG_W, BG_H)
    base = ramp([(0, '#f2dcc0'), (1, '#e6c39a')], x * 0.5 + y * 0.5)
    img = to_img(base).convert('RGBA')
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    def paw(cx, cy, s, ang, col):
        c, sn = math.cos(ang), math.sin(ang)

        def pt(ox, oy):
            return cx + (ox * c - oy * sn) * s, cy + (ox * sn + oy * c) * s

        def blob(ox, oy, rx, ry):
            px, py = pt(ox, oy)
            d.ellipse([px - rx * s, py - ry * s, px + rx * s, py + ry * s], fill=col)
        blob(0, 0.35, 0.55, 0.45)
        for ox, oy in [(-0.75, -0.2), (-0.28, -0.7), (0.28, -0.7), (0.75, -0.2)]:
            blob(ox, oy, 0.2, 0.27)

    # A trail wandering left to right, alternating feet.
    for i in range(11):
        cx = 40 + i * 74 + rng.uniform(-6, 6)
        cy = 120 + 38 * math.sin(i * 0.9) + (-24 if i % 2 else 24)
        paw(cx, cy, 15 + rng.uniform(-1, 1), math.radians(80 + 12 * math.sin(i)), (122, 80, 48, 170))
    img = Image.alpha_composite(img, layer)
    arr = np.asarray(img.convert('RGB'), dtype=np.float32) / 255
    arr *= 1 - 0.07 * smooth(0.4, 1.2, np.hypot(x - 0.5, (y - 0.5) * 1.6))[..., None]
    return [to_img(arr)]


def bg_beach():
    frames = []
    x, y = grid(BG_W, BG_H)
    n = 16
    for f in range(n):
        t = f / n * TAU
        img = ramp([(0, '#5fc1ff'), (0.42, '#c9ecff')], y / 0.42)
        horizon = 0.44
        sun = smooth(0.09, 0.07, np.hypot((x - 0.78) * 3.33, (y - 0.2)))
        img = over(img, hexc('#fff6c8'), sun)
        img = np.clip(img + blur(sun, 14)[..., None] * np.array([0.5, 0.4, 0.1]), 0, 1)
        sea = ramp([(0, '#1b9ad6'), (1, '#0a5b9e')], (y - horizon) / (0.78 - horizon))
        wave = np.sin((x * 14 + (y - horizon) * 9) * 1.0 + t) * 0.5 + 0.5
        sea = np.clip(sea + (wave[..., None] ** 8) * 0.22, 0, 1)
        img = np.where(((y > horizon) & (y < 0.78))[..., None], sea, img)
        # Foam line that rolls up and down the beach.
        shore = 0.76 + 0.025 * np.sin(x * TAU * 2.0 + t) + 0.012 * np.sin(x * TAU * 6 - t * 2)
        sand = ramp([(0, '#f4dfaa'), (1, '#e3c27c')], (y - 0.76) / 0.24)
        img = np.where((y > shore)[..., None], sand, img)
        foam = np.exp(-((y - shore) * 90) ** 2) * 0.9 + np.exp(-((y - shore + 0.03) * 60) ** 2) * 0.35
        img = over(img, hexc('#ffffff'), np.clip(foam, 0, 1) * (y < shore + 0.04))
        frames.append(to_img(img))
    return frames


def bg_snow():
    frames = []
    x, y = grid(BG_W, BG_H)
    rng = np.random.default_rng(5)
    flakes = []
    for _ in range(90):
        flakes.append((rng.uniform(0, BG_W), rng.uniform(0, BG_H), rng.integers(1, 4),
                       rng.uniform(1.2, 3.2), rng.uniform(0, TAU)))
    n = 24
    bgc = ramp([(0, '#16233a'), (1, '#2c4466')], y + x * 0.2)
    for f in range(n):
        layer = Image.new('L', (BG_W, BG_H), 0)
        d = ImageDraw.Draw(layer)
        for fx, fy, speed, r, ph in flakes:
            py = (fy + BG_H * speed * f / n) % BG_H
            px = fx + 8 * math.sin(f / n * TAU * speed + ph)
            d.ellipse([px - r, py - r, px + r, py + r], fill=int(120 + 40 * r))
        flake = np.asarray(layer.filter(ImageFilter.GaussianBlur(0.9)), dtype=np.float32) / 255
        img = np.clip(bgc + flake[..., None] * 1.1, 0, 1)
        # Drifts along the bottom.
        drift = 0.86 + 0.04 * np.sin(x * TAU * 1.5 + 1) + 0.02 * np.sin(x * TAU * 4)
        img = over(img, hexc('#e8f1fb'), (y > drift).astype(np.float32))
        frames.append(to_img(img))
    return frames


def bg_terminal():
    frames = []
    x, y = grid(BG_W, BG_H)
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', 13)
    rng = np.random.default_rng(3)
    cols = BG_W // 9
    rows = BG_H // 15
    chars = rng.choice(list('01{}<>/=;$#'), size=(rows, cols))
    keep = rng.random((rows, cols)) > 0.7
    text = Image.new('L', (BG_W, BG_H), 0)
    d = ImageDraw.Draw(text)
    for r in range(rows):
        for c in range(cols):
            if keep[r, c]:
                d.text((c * 9 + 2, r * 15 + 1), str(chars[r, c]), font=font, fill=int(40 + 50 * rng.random()))
    text = np.asarray(text, dtype=np.float32) / 255
    n = 16
    scan = (np.arange(BG_H)[:, None] % 3 == 0).astype(np.float32) * np.ones((1, BG_W), np.float32)
    for f in range(n):
        t = f / n
        img = ramp([(0, '#04120a'), (1, '#0a2414')], y)
        img = np.clip(img + text[..., None] * np.array([0.1, 0.9, 0.3]) * 0.55, 0, 1)
        roll = np.exp(-(((y - t) % 1.0) * 7) ** 2)
        img = np.clip(img + roll[..., None] * np.array([0.0, 0.1, 0.04]), 0, 1)
        img *= (1 - 0.22 * scan)[..., None]
        # Blinking block cursor in the lower-left.
        if f % 8 < 5:
            img[BG_H - 40:BG_H - 22, 24:34] = hexc('#39ff88')
        img *= 1 - 0.35 * smooth(0.4, 1.2, np.hypot(x - 0.5, (y - 0.5) * 1.6))[..., None]
        frames.append(to_img(img))
    return frames


def bg_vhs():
    frames = []
    x, y = grid(BG_W, BG_H)
    rng = np.random.default_rng(9)
    bars = ['#c9c9c9', '#c9c900', '#00c9c9', '#00c900', '#c900c9', '#c90000', '#0000c9']
    idx = np.minimum((x * 7).astype(int), 6)
    palette = np.stack([hexc(c) for c in bars])
    n = 16
    for f in range(n):
        t = f / n
        img = palette[idx] * 0.55
        # Tracking error: a band that crawls up the picture and tears the bars sideways.
        band_c = 1 - t
        dist = ((y - band_c + 0.5) % 1.0) - 0.5
        tear = np.exp(-(dist * 14) ** 2)
        shift = (tear * 16).astype(int)
        rows = np.arange(BG_H)
        sx = (np.arange(BG_W)[None, :] + shift[:, 0][:, None]) % BG_W
        img = img[rows[:, None], sx]
        noise = rng.random((BG_H, BG_W)).astype(np.float32)
        img = np.clip(img + (noise[..., None] - 0.5) * (0.06 + 0.35 * tear[..., None]), 0, 1)
        # Chroma bleed: red and blue channels slip apart.
        img[..., 0] = np.roll(img[..., 0], 4, axis=1)
        img[..., 2] = np.roll(img[..., 2], -4, axis=1)
        img *= (1 - 0.2 * (np.arange(BG_H)[:, None] % 2))[..., None]
        img = img * 0.8 + np.array([0.09, 0.0, 0.16]) * 0.9
        frames.append(to_img(img))
    return frames


BGS = {
    'bg-paper': (bg_paper, 100),
    'bg-sunset': (bg_sunset, 100),
    'bg-aurora': (bg_aurora, 130),
    'bg-paws': (bg_paws, 100),
    'bg-beach': (bg_beach, 120),
    'bg-snow': (bg_snow, 90),
    'bg-terminal': (bg_terminal, 110),
    'bg-vhs': (bg_vhs, 90),
}


# ----------------------------------------------------------------- frames
# Drawn at 4x and downscaled for clean edges. Coordinates are in 0..1 of the
# frame; the hole has radius HOLE/2 = 0.375.

SS = 4


def fgrid():
    n = FR * SS
    y, x = np.mgrid[0:n, 0:n].astype(np.float32)
    return (x + 0.5) / n - 0.5, (y + 0.5) / n - 0.5   # centred, -0.5..0.5


def finish(rgb, alpha):
    img = to_img(rgb, alpha)
    return img.resize((FR, FR), Image.LANCZOS)


def ring_mask(r, a, b):
    """1 inside [a, b] radii with a soft 1-sample edge at 4x."""
    e = 1.0 / (FR * SS)
    return smooth(a - e, a + e, r) * smooth(b + e, b - e, r)


def fr_ink():
    x, y = fgrid()
    r = np.hypot(x, y)
    m = ring_mask(r, 0.372, 0.405)
    rgb = np.broadcast_to(hexc('#191713'), x.shape + (3,)).copy()
    hl = smooth(0.0, 0.5, -(y + x) / (r + 1e-6)) * m
    rgb = np.clip(rgb + hl[..., None] * 0.18, 0, 1)
    return [finish(rgb, m)]


def fr_double():
    x, y = fgrid()
    r = np.hypot(x, y)
    m = np.maximum(ring_mask(r, 0.372, 0.384), ring_mask(r, 0.404, 0.416))
    rgb = np.broadcast_to(hexc('#5d594e'), x.shape + (3,)).copy()
    return [finish(rgb, m)]


def fr_gold():
    frames = []
    x, y = fgrid()
    r = np.hypot(x, y)
    ang = np.arctan2(y, x)
    m = ring_mask(r, 0.368, 0.425)
    n = 16
    for f in range(n):
        t = f / n
        base = ramp([(0, '#8a5a12'), (0.3, '#f7d56a'), (0.5, '#fff2b0'), (0.7, '#d9a23b'), (1, '#8a5a12')],
                    (np.sin(ang * 2 + 0.6) * 0.5 + 0.5) * 0.8 + (r - 0.368) / 0.057 * 0.2)
        shine = np.exp(-((((ang / TAU) - t + 0.5) % 1.0 - 0.5) * 9) ** 2)
        rgb = np.clip(base + shine[..., None] * 0.55, 0, 1)
        # Inner and outer bevel lines.
        bevel = np.maximum(ring_mask(r, 0.368, 0.374), ring_mask(r, 0.419, 0.425))
        rgb = rgb * (1 - 0.35 * bevel[..., None])
        frames.append(finish(rgb, m))
    return frames


def fr_collar():
    x, y = fgrid()
    r = np.hypot(x, y)
    ang = np.arctan2(y, x)
    m = ring_mask(r, 0.366, 0.43)
    leather = ramp([(0, '#7d0f19'), (0.5, '#c1121f'), (1, '#8a111c')], (r - 0.366) / 0.064)
    stitch = (np.sin(ang * 70) > 0.2) * ring_mask(r, 0.395, 0.401)
    rgb = over(leather, hexc('#f7e4b4'), stitch.astype(np.float32) * 0.9)
    rgb = rgb * (1 - 0.3 * np.maximum(ring_mask(r, 0.366, 0.372), ring_mask(r, 0.424, 0.43)))[..., None]
    # Gold name tag hanging off the bottom of the collar.
    d = np.hypot(x, y - 0.455)
    tag = smooth(0.054, 0.048, d)
    ring_hook = ring_mask(np.hypot(x, y - 0.41), 0.012, 0.022)
    tagcol = ramp([(0, '#b07a1d'), (0.5, '#ffe08a'), (1, '#b07a1d')], (x + y) * 2 + 0.5)
    rgb = over(rgb, tagcol, tag)
    rgb = over(rgb, hexc('#8a5a12'), smooth(0.02, 0.012, np.hypot(x, y - 0.455)) * 0.8)
    rgb = over(rgb, hexc('#d9a23b'), ring_hook)
    alpha = np.maximum(np.maximum(m, tag), ring_hook)
    return [finish(rgb, alpha)]


def fr_sun():
    frames = []
    x, y = grid(FR * SS, FR * SS)
    x -= 0.5
    y -= 0.5
    r = np.hypot(x, y)
    ang = np.arctan2(y, x)
    rays = 16
    n = 12
    for f in range(n):
        rot = f / n * (TAU / rays)
        tri = np.abs(((ang + rot) / (TAU / rays)) % 1.0 - 0.5) * 2     # 0 at ray centre, 1 between rays
        ray_len = 0.468
        ray = smooth(0.55, 0.3, tri + (r - 0.41) * 4.5) * ring_mask(r, 0.4, ray_len)
        ring = ring_mask(r, 0.372, 0.41)
        a = np.maximum(ray, ring)
        col = ramp([(0, '#ffcf3a'), (1, '#ff9d1a')], (r - 0.37) / 0.1)
        col = np.where((ring > 0.5)[..., None], ramp([(0, '#ffe58a'), (1, '#f5a512')], (r - 0.372) / 0.04), col)
        frames.append(finish(col, a))
    return frames


def fr_frost():
    frames = []
    x, y = fgrid()
    r = np.hypot(x, y)
    ang = np.arctan2(y, x)
    rng = np.random.default_rng(21)
    base_m = ring_mask(r, 0.372, 0.4)
    # Ice crystals: irregular spikes that grow off the ring.
    spikes = 14
    seed_len = rng.uniform(0.02, 0.07, spikes)
    spike = np.zeros_like(r)
    for i in range(spikes):
        a0 = i / spikes * TAU
        da = ((ang - a0 + math.pi) % TAU) - math.pi
        width = 0.035 * smooth(0.0, 1.0, np.clip((0.4 + seed_len[i] - r) / seed_len[i], 0, 1))
        spike = np.maximum(spike, smooth(width, 0.0, np.abs(da) * r) * ring_mask(r, 0.395, 0.4 + seed_len[i]))
    a = np.maximum(base_m, spike)
    col = ramp([(0, '#3f93c9'), (0.5, '#d4f1ff'), (1, '#68b8e2')], (np.sin(ang * 5) * 0.5 + 0.5) * 0.5 + (r - 0.37) / 0.2)
    sp = [(rng.uniform(0, TAU), rng.uniform(0.375, 0.46), rng.uniform(0, TAU)) for _ in range(9)]
    n = 12
    for f in range(n):
        t = f / n * TAU
        rgb = col.copy()
        for k, (pa, pr, ph) in enumerate(sp):
            px, py = math.cos(pa) * pr, math.sin(pa) * pr
            tw = max(0.0, math.sin(t + ph)) ** 2
            glint = np.exp(-(np.hypot(x - px, y - py) / (0.012 + 0.01 * tw)) ** 2) * tw
            cross = np.exp(-(np.minimum(np.abs(x - px), np.abs(y - py)) / 0.003) ** 2) * (np.hypot(x - px, y - py) < 0.04) * tw
            rgb = np.clip(rgb + (glint + cross)[..., None] * 0.9, 0, 1)
        frames.append(finish(rgb, a))
    return frames


def fr_glitch():
    frames = []
    x, y = fgrid()
    r = np.hypot(x, y)
    m = ring_mask(r, 0.372, 0.41)
    n = 12
    rng = np.random.default_rng(33)
    size = FR * SS
    for f in range(n):
        out = np.zeros((size, size, 3), np.float32)
        alpha = np.zeros((size, size), np.float32)
        # Three colour channels of the ring, nudged apart sideways.
        for shift, col in [(-0.018, '#00f0ff'), (0.018, '#ff2bd6'), (0.0, '#ffffff')]:
            s = int(shift * size * (1.0 if f % 3 == 0 else 0.35))
            mm = np.roll(m, s, axis=1)
            weight = 0.55 if col != '#ffffff' else 0.9
            out = np.clip(out + mm[..., None] * hexc(col) * weight, 0, 1)
            alpha = np.maximum(alpha, mm)
        # A few horizontal slices torn sideways.
        for _ in range(rng.integers(2, 5)):
            y0 = int(rng.uniform(0.1, 0.9) * size)
            h = int(rng.uniform(0.012, 0.05) * size)
            dx = int(rng.uniform(-0.06, 0.06) * size)
            out[y0:y0 + h] = np.roll(out[y0:y0 + h], dx, axis=1)
            alpha[y0:y0 + h] = np.roll(alpha[y0:y0 + h], dx, axis=1)
        frames.append(finish(out, alpha))
    return frames


FRAMES = {
    'border-ink': (fr_ink, 100),
    'border-double': (fr_double, 100),
    'border-gold': (fr_gold, 110),
    'border-collar': (fr_collar, 100),
    'border-sun': (fr_sun, 120),
    'border-frost': (fr_frost, 150),
    'border-glitch': (fr_glitch, 110),
}


# ------------------------------------------------------------------ names
# Fills for the nickname text. Stretched over the text's box, so they are
# painted for the aspect of a short name and kept readable at any width.

def ngrid():
    return grid(NAME_W, NAME_H)


def nm_caps():
    x, y = ngrid()
    return [to_img(ramp([(0, '#171410'), (1, '#3a342a')], y))]


def nm_caps_dark():
    # Small Caps is ink on paper; on the dark theme it is paper on ink.
    x, y = ngrid()
    return [to_img(ramp([(0, '#f4ecd9'), (1, '#cfc6b0')], y))]


def nm_gradient():
    x, y = ngrid()
    return [to_img(ramp([(0, '#c67139'), (0.55, '#b0763f'), (1, '#4d7a56')], x))]


def nm_terminal():
    frames = []
    x, y = ngrid()
    n = 8
    for f in range(n):
        t = f / n
        band = np.exp(-(((y - t) % 1.0) * 5) ** 2)
        scan = 1 - 0.25 * (np.arange(NAME_H)[:, None] % 3 == 0) * np.ones((1, NAME_W))
        img = ramp([(0, '#1fdc6a'), (1, '#7dffb0')], band * 0.8 + 0.1)
        frames.append(to_img(img * scan[..., None]))
    return frames


def nm_woof():
    x, y = ngrid()
    base = ramp([(0, '#6e3b12'), (0.5, '#b5651d'), (1, '#8a4a16')], x * 0.7 + y * 0.3)
    spots = (np.sin(x * 40) * np.sin(y * 30 + x * 6) > 0.8).astype(np.float32)
    base = over(base, hexc('#f1c27d'), blur(spots, 1.3) * 0.7)
    return [to_img(base)]


def nm_tropic():
    frames = []
    x, y = ngrid()
    n = 12
    for f in range(n):
        t = f / n * TAU
        u = (np.sin(x * TAU + t) * 0.5 + 0.5) * 0.5 + (np.sin(x * TAU * 2 - t) * 0.5 + 0.5) * 0.3 + y * 0.2
        frames.append(to_img(ramp([(0, '#00b894'), (0.5, '#8ee34f'), (1, '#ffd93d')], u)))
    return frames


def nm_ice():
    frames = []
    x, y = ngrid()
    n = 12
    for f in range(n):
        t = f / n
        sweep = np.exp(-(((x - t * 1.6 + 0.3) * 4)) ** 2)
        img = ramp([(0, '#1569b0'), (0.5, '#2f9fe0'), (1, '#6cc8f2')], 1 - y * 0.8)
        img = np.clip(img + sweep[..., None] * 0.4, 0, 1)
        frames.append(to_img(img))
    return frames


def nm_gold():
    frames = []
    x, y = ngrid()
    n = 12
    for f in range(n):
        t = f / n
        sweep = np.exp(-((x - t * 1.6 + 0.3) * 5) ** 2)
        img = ramp([(0, '#7a4a08'), (0.35, '#d9a21f'), (0.55, '#f6d460'), (0.8, '#b97f1c'), (1, '#6e4207')], y)
        img = np.clip(img + sweep[..., None] * 0.35, 0, 1)
        frames.append(to_img(img))
    return frames


def nm_glitch():
    frames = []
    x, y = ngrid()
    rng = np.random.default_rng(41)
    n = 10
    for f in range(n):
        img = ramp([(0, '#ff2bd6'), (0.5, '#b04aff'), (1, '#00f0ff')], x)
        for _ in range(rng.integers(2, 5)):
            y0 = int(rng.uniform(0, 1) * NAME_H)
            h = int(rng.uniform(0.06, 0.25) * NAME_H)
            img[y0:y0 + h] = np.roll(img[y0:y0 + h], int(rng.uniform(-60, 60)), axis=1)
        if f % 3 == 0:
            img[::2] = np.clip(img[::2] * 1.2 + 0.1, 0, 1)
        frames.append(to_img(img))
    return frames


NAMES = {
    'name-caps': (nm_caps, 100),
    'name-caps-dark': (nm_caps_dark, 100),
    'name-gradient': (nm_gradient, 100),
    'name-terminal': (nm_terminal, 110),
    'name-woof': (nm_woof, 100),
    'name-tropic': (nm_tropic, 110),
    'name-ice': (nm_ice, 110),
    'name-gold': (nm_gold, 110),
    'name-glitch': (nm_glitch, 90),
}


def main(argv):
    only = set(argv)
    for table, kind in ((BGS, 'bg'), (FRAMES, 'border'), (NAMES, 'name')):
        for name, (fn, dur) in table.items():
            if only and name not in only:
                continue
            save(name, kind, fn(), duration=dur, quality=75 if kind != 'name' else 85)


if __name__ == '__main__':
    main(sys.argv[1:])
