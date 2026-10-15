#!/usr/bin/env python3
"""Renders the shop's cosmetic artwork into assets/shop/.

    python3 tools/gen-shop-art.py            # everything
    python3 tools/gen-shop-art.py bg-aurora  # just the named items

Needs numpy and Pillow. Output is deterministic (every random source is
seeded, and the only typeface used is the repo's own JetBrains Mono), so
re-running it produces the same files.

Not everything in the shop is made here: bg-blocks (assets/shop/bg-blocks.webp)
and border-flame (assets/shop/border-flame.png) are hand-made art, and
name-oxygene is a typeface (fonts/oxygene-1.ttf), not a picture.

Three kinds of file come out, all WebP (animated where the item moves):

  assets/shop/bg/<id>.webp      800x240  profile backgrounds, drawn edge to edge
  assets/shop/border/<id>.webp  240x240  avatar frames, transparent, see FRAME
  assets/shop/name/<id>.webp    256x64   nickname fills, stretched over the text

Animated items also get <id>.still.webp (first frame), which the stylesheet
swaps in under prefers-reduced-motion. Which items move is fixed by that
stylesheet: keep an item animated or still when redrawing it, or update the
reduced-motion block in css/style.css to match.

Backgrounds sit behind white text (the profile header's name and stats), so
every one keeps its tones in the middle and darker range - no pale paper.

FRAME geometry: the frame image is 4/3 the size of the avatar it surrounds.
The transparent hole is HOLE/SIZE = 75% of the image, so the frame is
positioned at -16.667% / 133.333% of the avatar (css/style.css and
mobile/src/components/ui.tsx both use those numbers).
"""
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'shop'
FONT = ROOT / 'fonts' / 'jetbrains-mono-latin.woff2'
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
    return np.stack([np.interp(t, pos, cols[:, i]) for i in range(3)], axis=-1).astype(np.float32)


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def to_img(arr, alpha=None):
    rgb = (np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8)
    if alpha is None:
        return Image.fromarray(rgb, 'RGB')
    a = (np.clip(alpha, 0, 1) * 255 + 0.5).astype(np.uint8)
    return Image.fromarray(np.dstack([rgb, a]), 'RGBA')


def blur(arr, radius):
    """Gaussian blur on a float HxW or HxWx3 array."""
    if arr.ndim == 3:
        return np.stack([blur(arr[..., i], radius) for i in range(arr.shape[-1])], axis=-1)
    # Separable Gaussian in float, so faint glows don't band the way an
    # 8-bit PIL blur would.
    k = np.arange(-int(radius * 3) - 1, int(radius * 3) + 2, dtype=np.float32)
    k = np.exp(-0.5 * (k / max(radius, 1e-3)) ** 2)
    k /= k.sum()
    pad = len(k) // 2
    out = np.asarray(arr, np.float32)
    for axis in (0, 1):
        p = [(0, 0), (0, 0)]
        p[axis] = (pad, pad)
        padded = np.pad(out, p, mode='edge')
        out = sum(k[i] * np.take(padded, range(i, i + out.shape[axis]), axis=axis) for i in range(len(k)))
    return out.astype(np.float32)


def grid(w, h):
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    return (x + 0.5) / w, (y + 0.5) / h


def over(base, color, a):
    """Alpha-composite a flat/array colour onto base (RGB), a = HxW coverage."""
    a = np.clip(a, 0, 1)[..., None]
    return base * (1 - a) + np.asarray(color, dtype=np.float32) * a


def screen(base, light):
    return 1 - (1 - base) * (1 - np.clip(light, 0, 1))


def wrap(a):
    """Angle difference folded into -pi..pi."""
    return (a + math.pi) % TAU - math.pi


def vnoise(x, y, z, g):
    """Smooth value noise on lattice g (depth, rows, cols), wrapping on every axis."""
    gz, gy, gx = g.shape
    x, y, z = np.broadcast_arrays(np.asarray(x, np.float32), np.asarray(y, np.float32),
                                  np.asarray(z, np.float32))
    x0, y0, z0 = np.floor(x), np.floor(y), np.floor(z)
    u, v, w = x - x0, y - y0, z - z0
    u, v, w = u * u * (3 - 2 * u), v * v * (3 - 2 * v), w * w * (3 - 2 * w)
    xi, yi, zi = x0.astype(np.int64) % gx, y0.astype(np.int64) % gy, z0.astype(np.int64) % gz
    xj, yj, zj = (xi + 1) % gx, (yi + 1) % gy, (zi + 1) % gz

    def plane(zz):
        top = g[zz, yi, xi] + (g[zz, yi, xj] - g[zz, yi, xi]) * u
        bot = g[zz, yj, xi] + (g[zz, yj, xj] - g[zz, yj, xi]) * u
        return top + (bot - top) * v
    a = plane(zi)
    return a + (plane(zj) - a) * w


def fbm(x, y, z=0.0, seed=0, octaves=4, period=(64, 64, 4), gain=0.5):
    """Fractal value noise, roughly 0.2..0.8. x/y are in lattice cells; the
    result repeats every period[0] cells in x, period[1] in y and period[2]
    in z, so z = t * period[2] over t in 0..1 makes a seamless loop."""
    px, py, pz = period
    total, amp, norm = 0.0, 1.0, 0.0
    for o in range(octaves):
        g = np.random.default_rng(seed * 101 + o).random((pz, py, px)).astype(np.float32)
        f = 2 ** o
        # Each octave sits at its own z offset so they don't all pass a
        # lattice plane (where the motion eases to a stop) at the same time.
        total = total + amp * vnoise(np.asarray(x) * f, np.asarray(y) * f, np.asarray(z) + o * 0.37, g)
        norm += amp
        amp *= gain
    return total / norm


def voronoi(px, py, sx, sy):
    """Nearest and second-nearest seed distance, and the nearest seed's index."""
    d1 = np.full(px.shape, np.inf, np.float32)
    d2 = d1.copy()
    idx = np.zeros(px.shape, np.int32)
    for i, (a, b) in enumerate(zip(sx, sy)):
        d = np.hypot(px - a, py - b)
        closer = d < d1
        d2 = np.where(closer, d1, np.minimum(d2, d))
        idx = np.where(closer, i, idx)
        d1 = np.where(closer, d, d1)
    return d1, d2, idx


def sketch(w, h, draw, ss=3):
    """Coverage mask (h x w, 0..1) from PIL drawing done at ss x scale.
    draw(d, s) receives an ImageDraw and the scale to multiply coordinates by."""
    im = Image.new('L', (w * ss, h * ss), 0)
    draw(ImageDraw.Draw(im), ss)
    return np.asarray(im.resize((w, h), Image.LANCZOS), dtype=np.float32) / 255


def mono(size):
    return ImageFont.truetype(str(FONT), size)


def text_mask(w, h, items):
    """items: [(x, y, text, size, level)] -> HxW mask."""
    im = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(im)
    for x, y, s, size, level in items:
        d.text((x, y), s, font=mono(size), fill=int(255 * level))
    return np.asarray(im, dtype=np.float32) / 255


def ridge_line(xs, seed, cells, base, amp, octaves=5, sharp=True):
    """A skyline: y (0..1) for every x (0..1). sharp makes ridged peaks."""
    n = fbm(xs * cells, np.full_like(xs, 0.5), 0, seed, octaves, period=(cells, 4, 1))
    if sharp:
        n = 1 - np.abs(n * 2 - 1)
    return base - amp * (n - 0.5) * 2


def fill_below(line, y, px):
    """Antialiased coverage of everything below a skyline."""
    return smooth(-0.6 * px, 0.6 * px, y - line[None, :])


def pine(d, cx, base, h, w, fill, cap=None, tiers=4):
    """A layered pine tree, apex at base - h. cap paints snow on each tier."""
    for i in range(tiers):
        top = base - h + h * i / (tiers + 0.6)
        bot = top + h * 0.48
        half = w * (0.35 + 0.65 * (i + 1) / tiers) / 2
        d.polygon([(cx, top), (cx - half, bot), (cx + half, bot)], fill=fill)
        if cap is not None:
            k = 0.38
            d.polygon([(cx, top), (cx - half * k, top + (bot - top) * k),
                       (cx + half * k, top + (bot - top) * k)], fill=cap)
    d.rectangle([cx - w * 0.06, base - h * 0.12, cx + w * 0.06, base], fill=fill)


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

PX1 = 1.0 / BG_H   # one pixel, in y units


def bg_paper():
    # Kraft paper: brown enough to carry white text, with the notebook
    # dressing the site wears - a strip of washi tape and a coffee ring.
    rng = np.random.default_rng(1)
    x, y = grid(BG_W, BG_H)
    PX, PY = x * BG_W, y * BG_H
    img = ramp([(0, '#b08250'), (0.5, '#a17346'), (1, '#8d623a')], x * 0.55 + y * 0.45)
    mottle = fbm(PX / 70, PY / 70, 0, 1, 5)
    img *= (0.86 + 0.28 * mottle)[..., None]
    grain = fbm(PX / 2.5, PY / 9, 0, 2, 2, period=(400, 64, 1))
    img *= (0.95 + 0.1 * grain)[..., None]

    # Loose fibres caught in the pulp.
    light = Image.new('L', (BG_W * 2, BG_H * 2), 0)
    dark = Image.new('L', (BG_W * 2, BG_H * 2), 0)
    dl, dd = ImageDraw.Draw(light), ImageDraw.Draw(dark)
    for i in range(520):
        cx, cy = rng.uniform(0, BG_W * 2), rng.uniform(0, BG_H * 2)
        a = rng.uniform(0, math.pi)
        ln = rng.uniform(6, 26)
        bend = rng.uniform(-0.5, 0.5)
        pts = [(cx + math.cos(a + bend * k) * ln * k, cy + math.sin(a + bend * k) * ln * k)
               for k in np.linspace(-0.5, 0.5, 5)]
        (dl if i % 3 else dd).line(pts, fill=int(rng.uniform(60, 140)), width=1)
    fl = np.asarray(light.resize((BG_W, BG_H), Image.LANCZOS), np.float32) / 255
    fd = np.asarray(dark.resize((BG_W, BG_H), Image.LANCZOS), np.float32) / 255
    img = over(img, hexc('#d9b98c'), fl * 0.5)
    img = over(img, hexc('#5e3d1e'), fd * 0.35)

    # Coffee ring, lower right: a dried rim, darker where the cup sat longest.
    cx, cy, rr = 705, 168, 50
    d = np.hypot(PX - cx, PY - cy)
    ang = np.arctan2(PY - cy, PX - cx)
    brk = fbm(np.cos(ang) * 3 + 3, np.sin(ang) * 3 + 3, 0, 4, 3)
    rim = np.exp(-((d - rr - 2 * (brk - 0.5) * 6) / 2.2) ** 2) * smooth(0.35, 0.6, brk)
    pool = smooth(rr, rr - 6, d) * 0.12 * fbm(PX / 18, PY / 18, 0, 5, 3)
    img *= (1 - (rim * 0.4 + pool)[..., None] * np.array([0.55, 0.75, 0.95]))

    # Washi tape across the top-right corner, with torn ends.
    def tape(dr, s):
        c, sn = math.cos(math.radians(-11)), math.sin(math.radians(-11))
        ox, oy, L, W = 618, 42, 150, 32

        def pt(u, v):
            return ((ox + u * c - v * sn) * s, (oy + u * sn + v * c) * s)
        teeth = 9
        left = [pt(-4 + 4 * (k % 2), W * k / teeth) for k in range(teeth + 1)]
        right = [pt(L + 4 * (k % 2), W * (teeth - k) / teeth) for k in range(teeth + 1)]
        dr.polygon(left + right, fill=255)
    tm = sketch(BG_W, BG_H, tape)
    shadow = np.roll(np.roll(blur(tm, 2.5), 3, axis=0), 2, axis=1)
    img *= (1 - 0.28 * shadow * (1 - tm))[..., None]
    stripes = smooth(-0.3, 0.3, np.sin((PX * 0.97 + PY * 0.25) / 5.5))
    tcol = over(np.broadcast_to(hexc('#86cdb6'), img.shape).copy(), hexc('#f2efe4'), stripes * 0.55)
    img = over(img, tcol, tm * 0.72)

    vig = smooth(0.45, 1.25, np.hypot(x - 0.5, (y - 0.5) * 1.5))
    img *= (1 - 0.35 * vig)[..., None]
    return [to_img(img)]


def bg_sunset():
    x, y = grid(BG_W, BG_H)
    PX, PY = x * BG_W, y * BG_H
    xs = (np.arange(BG_W) + 0.5) / BG_W
    hor = 0.7
    img = ramp([(0, '#1b1038'), (0.32, '#532066'), (0.6, '#b83a6c'), (0.82, '#f2703f'), (1, '#ffbd63')],
               y / hor)
    sx, sy, sr = 0.66 * BG_W, 0.62 * BG_H, 30
    d = np.hypot(PX - sx, PY - sy)
    img = np.clip(img + (np.exp(-(d / 150) ** 2) * 0.35 + np.exp(-(d / 50) ** 2) * 0.35)[..., None]
                  * hexc('#ffb064'), 0, 1)
    img = over(img, ramp([(0, '#fff7d6'), (1, '#ffcf73')], (PY - sy + sr) / (2 * sr)),
               smooth(sr + 1, sr - 1, d))

    # Long streaks of cloud, lit from underneath by the low sun.
    n = fbm(PX / 70, PY / 13, 0, 3, 5, period=(64, 64, 1))
    dens = smooth(0.5, 0.66, n) * smooth(0.02, 0.18, y) * smooth(0.62, 0.42, y)
    rim = np.clip(dens - np.roll(dens, -3, axis=0), 0, 1)
    near = np.exp(-(np.hypot(PX - sx, (PY - sy) * 2.5) / 260) ** 2)
    ccol = ramp([(0, '#3b1a4f'), (1, '#9c3a68')], y / 0.55)
    ccol = over(ccol, hexc('#ff9f6e'), np.clip(rim * 2.2 + near * 0.5, 0, 1))
    img = over(img, ccol, dens * 0.9)

    # Ranges fading into the haze, nearest darkest.
    layers = [(0.64, 0.09, '#a24d77', 11), (0.72, 0.08, '#6c2c62', 12),
              (0.82, 0.07, '#3d1a4a', 13), (0.93, 0.05, '#1a0b27', 14)]
    for base, amp, col, seed in layers:
        line = ridge_line(xs, seed, 6, base, amp, sharp=seed % 2 == 1)
        cov = fill_below(line, y, PX1)
        lit = smooth(line[None, :] + 0.06, line[None, :], y) * 0.18
        img = over(img, hexc(col) * (1 + lit[..., None]), cov)

    def birds(dr, s):
        for bx, by, bs in [(250, 62, 7), (272, 52, 5), (292, 70, 6), (318, 58, 4), (232, 80, 4)]:
            pts = [(bx - bs, by - 0.3 * bs), (bx - 0.45 * bs, by - 0.55 * bs), (bx, by),
                   (bx + 0.45 * bs, by - 0.55 * bs), (bx + bs, by - 0.3 * bs)]
            dr.line([(px * s, py * s) for px, py in pts], fill=255, width=int(1.6 * s), joint='curve')
    img = over(img, hexc('#24112f'), sketch(BG_W, BG_H, birds))
    return [to_img(img)]


def bg_aurora():
    rng = np.random.default_rng(7)
    x, y = grid(BG_W, BG_H)
    PX, PY = x * BG_W, y * BG_H
    xs = (np.arange(BG_W) + 0.5) / BG_W
    sky = ramp([(0, '#02040f'), (0.55, '#06162c'), (0.85, '#0c2c48'), (1, '#12405e')], y)

    stars = []
    for _ in range(260):
        stars.append((rng.uniform(0, BG_W), rng.uniform(0, BG_H * 0.8), rng.uniform(0.3, 1.0) ** 2,
                      rng.random() < 0.15, rng.uniform(0, TAU), int(rng.integers(1, 3))))

    ridge = ridge_line(xs, 21, 5, 0.82, 0.05)

    def trees(dr, s):
        tx = -4.0
        while tx < BG_W + 10:
            h = rng.uniform(14, 44)
            base = BG_H * (0.95 + 0.03 * math.sin(tx / 70))
            pine(dr, tx * s, base * s, h * s, h * 0.55 * s, 255)
            tx += rng.uniform(5, 13)
        dr.rectangle([0, int(BG_H * 0.94 * s), BG_W * s, BG_H * s], fill=255)
    tmask = sketch(BG_W, BG_H, trees)

    curtains = [  # base height, fade height, seed, strength
        (0.52, 0.42, 31, 1.0),
        (0.38, 0.32, 37, 0.7),
    ]
    frames = []
    n = 20
    for f in range(n):
        t = f / n
        z = t * 3
        layer = Image.new('L', (BG_W, BG_H), 0)
        dr = ImageDraw.Draw(layer)
        for sx_, sy_, b, tw, ph, k in stars:
            lv = b * (0.45 + 0.55 * math.sin(TAU * k * t + ph) ** 2 if tw else 1)
            r = 1.1 if b > 0.6 else 0.6
            dr.ellipse([sx_ - r, sy_ - r, sx_ + r, sy_ + r], fill=int(255 * lv))
        st = blur(np.asarray(layer, np.float32) / 255, 0.5) * 1.6
        img = np.clip(sky + st[..., None] * np.array([0.85, 0.9, 1.0]), 0, 1)

        light = np.zeros_like(img)
        for y0, h, seed, strength in curtains:
            base = y0 + 0.17 * (fbm(xs * 5, np.full_like(xs, 2.0), z, seed, 3, period=(5, 8, 3)) - 0.5) * 2
            rays = smooth(0.32, 0.72, fbm(xs * 70, np.full_like(xs, 1.0), z, seed + 1, 2, period=(70, 8, 3)))
            swell = smooth(0.3, 0.62, fbm(xs * 3, np.full_like(xs, 3.0), z, seed + 2, 2, period=(3, 8, 3)))
            dy = base[None, :] - y
            inten = np.where(dy >= 0, np.exp(-dy / (h * 0.45)), np.exp(-(dy / 0.014) ** 2))
            inten = inten * (0.3 + 0.7 * rays[None, :]) * swell[None, :] * strength
            col = ramp([(0, '#c8ffe4'), (0.06, '#48ff9e'), (0.4, '#17c784'), (0.75, '#5a48e8'), (1, '#b14cff')],
                       np.clip(dy / h, 0, 1))
            light += inten[..., None] * col
        light = light * 0.85 + blur(light, 7) * 0.6
        img = screen(img, light)

        hills = fill_below(ridge, y, PX1)
        img = over(img, hexc('#071324'), hills)
        img = over(img, hexc('#01040a'), tmask)
        frames.append(to_img(img))
    return frames


def bg_paws():
    rng = np.random.default_rng(11)
    x, y = grid(BG_W, BG_H)
    PX, PY = x * BG_W, y * BG_H
    img = ramp([(0, '#c48d58'), (0.6, '#b07942'), (1, '#966235')], x * 0.35 + y * 0.65)
    warp = fbm(PX / 110, PY / 110, 0, 12, 3)
    ripple = np.sin((PX * 0.3 + PY) / 7.5 + warp * 9)
    img *= (1 + 0.045 * ripple)[..., None]
    img *= (0.93 + 0.14 * fbm(PX / 1.6, PY / 1.6, 0, 13, 2, period=(512, 160, 1)))[..., None]

    # One paw print, toes up, drawn big so it rotates cleanly.
    P = 120

    def paw_img():
        im = Image.new('L', (P, P), 0)
        d = ImageDraw.Draw(im)
        c = P / 2
        s = P / 4.2

        def ell(ox, oy, rx, ry):
            d.ellipse([c + (ox - rx) * s, c + (oy - ry) * s, c + (ox + rx) * s, c + (oy + ry) * s], fill=255)
        ell(0, 0.5, 0.6, 0.42)
        ell(-0.4, 0.72, 0.34, 0.28)
        ell(0.4, 0.72, 0.34, 0.28)
        for ox, oy in [(-1.0, -0.42), (-0.38, -0.98), (0.38, -0.98), (1.0, -0.42)]:
            ell(ox, oy, 0.25, 0.32)
        return im
    paw = paw_img()
    canvas = Image.new('L', (BG_W * 2, BG_H * 2), 0)
    step = 82
    for i in range(11):
        px = 30 + i * step + rng.uniform(-4, 4)
        path = 122 + 42 * math.sin(px / 155 + 0.6)
        slope = 42 / 155 * math.cos(px / 155 + 0.6)
        side = 1 if i % 2 else -1
        nx, ny = -slope, 1.0
        nl = math.hypot(nx, ny)
        cx = px + side * 19 * nx / nl
        cy = path + side * 19 * ny / nl
        ang = -90 - math.degrees(math.atan(slope)) + rng.uniform(-7, 7)
        sz = int(2 * (40 if i % 4 < 2 else 36))
        p = paw.resize((sz, sz), Image.LANCZOS).rotate(ang, Image.BICUBIC, expand=True)
        layer = Image.new('L', canvas.size, 0)
        layer.paste(p, (int(cx * 2 - p.width / 2), int(cy * 2 - p.height / 2)))
        canvas = ImageChops.lighter(canvas, layer)
    M = np.asarray(canvas.resize((BG_W, BG_H), Image.LANCZOS), np.float32) / 255

    # Pressed into the sand: dark floor, shadowed far wall, lit near wall.
    Mb = blur(M, 1.0)
    gy, gx = np.gradient(Mb)
    light = -(gx + gy) * 3.2
    img *= (1 - 0.3 * M)[..., None]
    img *= (1 + np.clip(light, -0.45, 0.45))[..., None]
    img = over(img, hexc('#6f4521'), blur(M, 0.8) * 0.18)

    vig = smooth(0.4, 1.2, np.hypot(x - 0.5, (y - 0.5) * 1.5))
    img *= (1 - 0.25 * vig)[..., None]
    return [to_img(img)]


def bg_beach():
    x, y = grid(BG_W, BG_H)
    PX, PY = x * BG_W, y * BG_H
    xs = (np.arange(BG_W) + 0.5) / BG_W
    hor = 0.47
    sunx, suny = 0.6 * BG_W, 0.17 * BG_H
    dsun = np.hypot(PX - sunx, PY - suny)
    sand = ramp([(0, '#e9c98a'), (1, '#c99d5d')], (y - 0.72) / 0.28)
    sand *= (0.94 + 0.12 * fbm(PX / 1.8, PY / 1.8, 0, 51, 2, period=(448, 140, 1)))[..., None]
    jag = fbm(xs * 9, np.full_like(xs, 1.0), 0, 52, 3, period=(9, 4, 1))

    def palm(dr, s, sway):
        # Trunk: a leaning, tapering curve of overlapping discs with ring marks.
        base, top = (792, 250), (716, 62)
        for k in range(60):
            u = k / 59
            cx = base[0] + (top[0] - base[0]) * u + 26 * math.sin(u * math.pi) * 0.8
            cy = base[1] + (top[1] - base[1]) * u
            r = 9.5 - 4 * u
            dr.ellipse([(cx - r) * s, (cy - r) * s, (cx + r) * s, (cy + r) * s], fill=(92, 62, 36, 255))
            if k % 5 == 0:
                dr.line([((cx - r) * s, cy * s), ((cx + r) * s, (cy - 2) * s)], fill=(58, 38, 22, 255),
                        width=int(1.4 * s))
        # Fronds: arcs out of the crown with serrated leaflets.
        crown = (top[0], top[1])
        for j, (a, ln) in enumerate([(-170, 92), (-135, 80), (-100, 62), (-55, 74), (-15, 86),
                                     (20, 70), (160, 70), (200, 66)]):
            a = math.radians(a + sway * (1 + j % 3) * 0.6)
            pts_up, pts_dn = [], []
            for k in range(14):
                u = k / 13
                droop = 34 * u * u
                px = crown[0] + math.cos(a) * ln * u
                py = crown[1] + math.sin(a) * ln * u + droop
                w = 15 * math.sin(math.pi * min(1.0, u * 1.15)) * (1.0 if k % 2 else 0.55)
                nx, ny = -math.sin(a), math.cos(a)
                pts_up.append(((px + nx * w) * s, (py + ny * w * 0.6 - w * 0.4) * s))
                pts_dn.append(((px - nx * w * 0.5) * s, (py - ny * w * 0.3 + w * 0.5) * s))
            col = (31, 92, 52, 255) if j % 2 else (24, 74, 42, 255)
            dr.polygon(pts_up + pts_dn[::-1], fill=col)
            dr.line([(crown[0] * s, crown[1] * s)] + pts_dn[::2], fill=(18, 56, 32, 255), width=int(1.2 * s))
        for cx, cy in [(712, 70), (722, 72), (717, 78)]:
            dr.ellipse([(cx - 5) * s, (cy - 5) * s, (cx + 5) * s, (cy + 5) * s], fill=(74, 50, 24, 255))

    frames = []
    n = 16
    for f in range(n):
        t = f / n
        img = ramp([(0, '#1a6fc0'), (0.65, '#4aa3e2'), (1, '#93d3f2')], y / hor)
        img = np.clip(img + (np.exp(-(dsun / 120) ** 2) * 0.35 + np.exp(-(dsun / 40) ** 2) * 0.4)[..., None]
                      * hexc('#fff1c4'), 0, 1)
        img = over(img, hexc('#fffbe8'), smooth(19, 17, dsun))
        # Clouds drift one full width per loop, on noise that wraps at the edges.
        cn = fbm((x + t) * 8, PY / 34, 0, 41, 5, period=(8, 16, 1))
        dens = smooth(0.5, 0.68, cn) * smooth(hor - 0.02, hor - 0.22, y)
        under = np.clip(dens - np.roll(dens, -5, axis=0), 0, 1)
        img = over(img, hexc('#ffffff'), dens * 0.92)
        img = over(img, hexc('#9fbfdc'), under * 0.6)

        # Sea, deepening toward the horizon, with swells rolling in.
        shore = (0.735 + 0.024 * math.sin(TAU * t) + 0.01 * np.sin(xs * TAU * 2 + TAU * t)
                 + 0.02 * (jag - 0.5))
        depth = np.clip((y - hor) / (shore[None, :] - hor), 0, 1)
        sea = ramp([(0, '#08498a'), (0.45, '#0f7fb8'), (0.8, '#1db2c2'), (1, '#64dccb')], depth)
        q = 10 * np.sqrt(depth) + 0.8 * fbm(PX / 60, PY / 10, 0, 43, 2)
        swell = np.sin(TAU * (q - 2 * t))
        sea = np.clip(sea + (smooth(0.6, 1.0, swell) * 0.16 - smooth(-0.4, -1.0, swell) * 0.06)[..., None]
                      * (0.4 + depth[..., None]), 0, 1)
        glit = fbm(PX / 2.5, PY / 1.6, t * 3, 44, 2, period=(320, 150, 3))
        sparkle = smooth(0.66, 0.74, glit) * np.exp(-((PX - sunx) / 150) ** 2)
        sea = np.clip(sea + sparkle[..., None] * 0.8, 0, 1)
        in_sea = smooth(hor - 0.5 * PX1, hor + 0.5 * PX1, y)
        img = over(img, sea, in_sea)

        # Beach: wet band where the wave just was, foam lace at the edge.
        on_sand = smooth(-0.6 * PX1, 0.6 * PX1, y - shore[None, :])
        wet = smooth(0.06, 0.0, y - shore[None, :])
        beach = over(sand, hexc('#b38652'), wet * 0.6)
        beach = np.clip(beach + wet[..., None] * 0.08 * np.exp(-((PX - sunx) / 160) ** 2)[..., None], 0, 1)
        img = over(img, beach, on_sand)
        lace = fbm(PX / 9, PY / 3.5, t * 2, 45, 3, period=(90, 70, 2))
        edge = np.exp(-((y - shore[None, :]) / 0.007) ** 2)
        band = smooth(-0.07, -0.01, y - shore[None, :]) * smooth(0.004, -0.004, y - shore[None, :])
        foam = np.clip(edge * 0.95 + smooth(0.5, 0.62, lace) * band * 0.85, 0, 1)
        img = over(img, hexc('#f6fbff'), foam)

        layer = Image.new('RGBA', (BG_W * 3, BG_H * 3), (0, 0, 0, 0))
        palm(ImageDraw.Draw(layer), 3, 2.5 * math.sin(TAU * t))
        pl = np.asarray(layer.resize((BG_W, BG_H), Image.LANCZOS), np.float32) / 255
        img = over(img, pl[..., :3] / np.maximum(pl[..., 3:], 1e-4), pl[..., 3])
        frames.append(to_img(img))
    return frames


def bg_snow():
    rng = np.random.default_rng(5)
    x, y = grid(BG_W, BG_H)
    PX, PY = x * BG_W, y * BG_H
    xs = (np.arange(BG_W) + 0.5) / BG_W
    scene = ramp([(0, '#0a1326'), (0.55, '#1a2f55'), (1, '#36578a')], y / 0.72)
    mx, my = 0.86 * BG_W, 0.22 * BG_H
    dm = np.hypot(PX - mx, PY - my)
    scene = np.clip(scene + (np.exp(-(dm / 70) ** 2) * 0.25)[..., None] * hexc('#c9d8ff'), 0, 1)
    moon = smooth(15, 13.5, dm)
    crater = fbm(PX / 5, PY / 5, 0, 61, 2)
    scene = over(scene, hexc('#f3f0df') * (0.9 + 0.12 * crater[..., None]), moon)

    far = ridge_line(xs, 62, 5, 0.66, 0.09)
    cov = fill_below(far, y, PX1)
    scene = over(scene, ramp([(0, '#8aa4cc'), (1, '#4d6894')], (y - far[None, :]) / 0.2), cov)
    mid = ridge_line(xs, 63, 4, 0.78, 0.05, sharp=False)
    cov = fill_below(mid, y, PX1)
    shade = fbm(PX / 40, PY / 20, 0, 64, 3)
    scene = over(scene, ramp([(0, '#d6e3f4'), (1, '#97aed2')], (y - mid[None, :]) / 0.15 + shade - 0.5), cov)

    def treeline(dr, s):
        tx = 0.0
        while tx < BG_W:
            h = rng.uniform(22, 50)
            if not 520 < tx < 600:
                base = (mid[min(int(tx), BG_W - 1)] * BG_H + 4)
                pine(dr, tx * s, base * s, h * s, h * 0.55 * s, (18, 34, 60, 255), cap=(226, 236, 248, 255))
            tx += rng.uniform(12, 40)
    layer = Image.new('RGBA', (BG_W * 3, BG_H * 3), (0, 0, 0, 0))
    treeline(ImageDraw.Draw(layer), 3)
    # A cabin with a lit window, sitting in the gap in the trees.
    dr = ImageDraw.Draw(layer)
    cbx, cby = 560, mid[560] * BG_H + 2
    s = 3
    dr.rectangle([(cbx - 22) * s, (cby - 22) * s, (cbx + 22) * s, cby * s], fill=(70, 44, 34, 255))
    dr.polygon([((cbx - 28) * s, (cby - 21) * s), (cbx * s, (cby - 40) * s), ((cbx + 28) * s, (cby - 21) * s)],
               fill=(40, 26, 22, 255))
    dr.polygon([((cbx - 30) * s, (cby - 20) * s), (cbx * s, (cby - 42) * s), ((cbx + 30) * s, (cby - 20) * s),
                ((cbx + 26) * s, (cby - 25) * s), (cbx * s, (cby - 37) * s), ((cbx - 26) * s, (cby - 25) * s)],
               fill=(236, 242, 250, 255))
    dr.rectangle([(cbx + 10) * s, (cby - 44) * s, (cbx + 16) * s, (cby - 32) * s], fill=(40, 26, 22, 255))
    dr.rectangle([(cbx - 14) * s, (cby - 15) * s, (cbx - 4) * s, (cby - 6) * s], fill=(255, 196, 92, 255))
    dr.rectangle([(cbx + 4) * s, (cby - 15) * s, (cbx + 14) * s, (cby - 6) * s], fill=(255, 196, 92, 255))
    tl = np.asarray(layer.resize((BG_W, BG_H), Image.LANCZOS), np.float32) / 255
    scene = over(scene, tl[..., :3] / np.maximum(tl[..., 3:], 1e-4), tl[..., 3])
    win = np.exp(-(np.hypot(PX - cbx, (PY - cby + 10) * 1.6) / 34) ** 2)
    scene = np.clip(scene + win[..., None] * hexc('#ff9a3c') * 0.35, 0, 1)

    near = ridge_line(xs, 65, 3, 0.9, 0.035, sharp=False)
    cov = fill_below(near, y, PX1)
    drift = ramp([(0, '#f2f7fd'), (1, '#b9cbe6')], (y - near[None, :]) / 0.1 + 0.6 * (fbm(PX / 30, PY / 12, 0, 66, 3) - 0.5))
    scene = over(scene, drift, cov)

    layers = [  # count, radius, blur, speed (heights per loop), sway, brightness
        (110, 0.7, 0.4, 1, 3, 0.55),
        (55, 1.4, 0.7, 2, 6, 0.85),
        (14, 3.2, 1.8, 3, 10, 0.75),
    ]
    flakes = [[(rng.uniform(0, BG_W), rng.uniform(0, BG_H), rng.uniform(0, TAU)) for _ in range(c)]
              for c, *_ in layers]
    frames = []
    n = 24
    for f in range(n):
        t = f / n
        img = scene.copy()
        for (count, r, bl, speed, sway, lv), fl in zip(layers, flakes):
            m = Image.new('L', (BG_W, BG_H), 0)
            d = ImageDraw.Draw(m)
            for fx, fy, ph in fl:
                py = (fy + BG_H * speed * t) % (BG_H + 8) - 4
                px = fx + sway * math.sin(TAU * t * speed + ph)
                d.ellipse([px - r, py - r, px + r, py + r], fill=255)
            a = blur(np.asarray(m, np.float32) / 255, bl) * lv
            img = over(img, hexc('#f4f8ff'), np.clip(a * 1.3, 0, 1))
        frames.append(to_img(img))
    return frames


def bg_terminal():
    rng = np.random.default_rng(3)
    x, y = grid(BG_W, BG_H)
    PX, PY = x * BG_W, y * BG_H
    cw, ch = 12, 14
    cols, rows = BG_W // cw + 1, BG_H // ch + 1
    glyphs = list('0123456789ABCDEF<>{}[]=+*#$%&/\\|')
    G = Image.new('L', (cols * cw, rows * ch), 0)
    d = ImageDraw.Draw(G)
    font = mono(11)
    for r in range(rows):
        for c in range(cols):
            d.text((c * cw + 2, r * ch), str(rng.choice(glyphs)), font=font, fill=255)
    G = np.asarray(G, np.float32)[:BG_H, :BG_W] / 255

    R = rows + 9   # a column's rain cycles through this many rows
    speed = rng.integers(1, 3, cols)
    phase = rng.uniform(0, R, cols)
    trail = rng.uniform(4, 11, cols)
    active = rng.random(cols) < 0.7
    scan = 1 - 0.22 * ((np.arange(BG_H) % 3) == 0).astype(np.float32)[:, None]
    vig = smooth(0.35, 0.95, np.hypot(x - 0.5, (y - 0.5) * 1.1)) ** 1.5

    lines = ['$ ./ship --prod', '  build ........ ok', '  tests ........ ok', '  deploy  ']
    frames = []
    n = 16
    for f in range(n):
        t = f / n
        head = (phase + speed * R * t) % R
        rr = np.arange(rows)[:, None]
        dist = (head[None, :] - rr) % R
        B = np.clip(1 - dist / trail[None, :], 0, 1) ** 1.6 * active[None, :]
        H = (dist < 1) * active[None, :]
        Bp = np.repeat(np.repeat(B, ch, 0), cw, 1)[:BG_H, :BG_W]
        Hp = np.repeat(np.repeat(H, ch, 0), cw, 1)[:BG_H, :BG_W]
        rain = G * Bp * 0.5
        heads = G * Hp * 0.9

        k = min(10, int(f * 11 / (n - 4)))
        bar = '[' + '#' * k + '.' * (10 - k) + ']' + (' ok' if k == 10 else '')
        cursor = '_' if f % 8 < 5 else ' '
        fg = text_mask(BG_W, BG_H, [(470, 52 + i * 26, s, 15, 1.0) for i, s in
                                    enumerate(lines[:3] + [lines[3] + bar, '$ ' + cursor])])

        img = ramp([(0, '#020d07'), (1, '#062012')], y)
        img = img + rain[..., None] * np.array([0.1, 0.75, 0.32]) + heads[..., None] * np.array([0.6, 1.0, 0.7])
        img = img + fg[..., None] * np.array([0.55, 1.0, 0.68]) * 0.95
        glow = blur(fg * 0.9 + rain * 0.6 + heads, 4)
        img = img + glow[..., None] * np.array([0.05, 0.45, 0.18])
        roll = np.exp(-((((y - t) % 1.0) - 0.5) * 6) ** 2)
        img = img + roll[..., None] * np.array([0.0, 0.05, 0.02])
        img = img * scan[..., None] * (1 - 0.75 * vig)[..., None]
        frames.append(to_img(img))
    return frames


def bg_vhs():
    rng = np.random.default_rng(9)
    x, y = grid(BG_W, BG_H)
    PX, PY = x * BG_W, y * BG_H
    xs = (np.arange(BG_W) + 0.5) / BG_W
    hor = 0.6
    sky = ramp([(0, '#08011c'), (0.45, '#2b0b52'), (0.82, '#a01f78'), (1, '#ff4f86')], y / hor)
    for _ in range(70):
        sx_, sy_ = rng.uniform(0, BG_W), rng.uniform(0, BG_H * 0.4)
        sky[int(sy_), int(sx_)] = np.minimum(1, sky[int(sy_), int(sx_)] + rng.uniform(0.3, 0.8))

    # Striped retro sun, sliced more and more toward the horizon.
    scx, scy, sr = 0.64 * BG_W, hor * BG_H - 6, 64
    ds = np.hypot(PX - scx, PY - scy)
    s = (PY - scy) / sr
    gaps = (s > -0.25) & (((s + 0.25) * 5.5) % 1.0 < 0.1 + 0.45 * np.clip(s + 0.25, 0, 1.3))
    sun = smooth(sr + 1, sr - 1, ds) * (~gaps)
    sky = np.clip(sky + (np.exp(-(ds / 140) ** 2) * 0.35)[..., None] * hexc('#ff4fa0'), 0, 1)
    sky = over(sky, ramp([(0, '#ffe96b'), (0.55, '#ff9b4a'), (1, '#ff3d8f')], (PY - scy + sr) / (1.3 * sr)), sun)

    mt = ridge_line(xs, 71, 7, hor - 0.01, 0.07)
    mcov = fill_below(mt, y, PX1)
    mrim = np.exp(-((y - mt[None, :]) / (1.2 * PX1)) ** 2) * (y < hor)
    sky = over(sky, hexc('#170436'), mcov)
    sky = over(sky, hexc('#38e8ff'), mrim * 0.7)

    v = np.clip((y - hor) / (1 - hor), 1e-3, 1)
    z = 1 / v
    fog = smooth(0.0, 0.35, v)
    dz = 1.0 / (v * v * (1 - hor) * BG_H)          # depth change per pixel down
    ux = (x - 0.64) * z * 7
    vline = np.abs(((ux + 0.5) % 1.0) - 0.5)
    vline = np.exp(-(vline / (z * 7 / BG_W * 1.1)) ** 2)

    def osd(f):
        im = Image.new('L', (BG_W, BG_H), 0)
        d = ImageDraw.Draw(im)
        font = mono(17)
        d.text((660, 16), 'PLAY', font=font, fill=255)
        d.polygon([(714, 21), (714, 35), (727, 28)], fill=255)
        d.text((650, 40), f'SP 0:04:{12 + f // 8:02d}', font=mono(13), fill=230)
        return np.asarray(im, np.float32) / 255

    frames = []
    n = 16
    for f in range(n):
        t = f / n
        hz = np.abs((((z * 1.1 + t) % 1.0) + 0.5) % 1.0 - 0.5)
        hline = np.exp(-(hz / (1.1 * dz * 1.1)) ** 2) * smooth(0.45, 0.15, 1.1 * dz)
        gridc = np.clip(hline + vline, 0, 1) * fog
        floor = ramp([(0, '#2a0a4a'), (1, '#0c0220')], v)
        floor = np.clip(floor + blur(gridc, 2.5)[..., None] * hexc('#ff2fbf') * 0.6, 0, 1)
        floor = over(floor, ramp([(0, '#ff5ad1'), (1, '#36e2ff')], v), gridc)
        img = np.where((y > hor)[..., None], floor, sky)

        # Tape: soft horizontal resolution, a tracking band crawling up the
        # picture and tearing it sideways, noise, slipped colour channels.
        img = np.stack([blur(img[..., i], 1.0) for i in range(3)], axis=-1)
        frng = np.random.default_rng(100 + f)
        bc = (1 - t) % 1.0
        dist = ((y[:, 0] - bc + 0.5) % 1.0) - 0.5
        tear = np.exp(-(dist * 16) ** 2)
        jitter = frng.normal(0, 0.6, BG_H)
        shift = np.round(tear * 14 * (0.6 + 0.4 * np.sin(np.arange(BG_H) * 0.7)) + jitter).astype(int)
        idx = (np.arange(BG_W)[None, :] - shift[:, None]) % BG_W
        img = img[np.arange(BG_H)[:, None], idx]
        noise = frng.random((BG_H, BG_W)).astype(np.float32)
        img = np.clip(img + (noise[..., None] - 0.5) * (0.035 + 0.5 * tear[:, None, None]), 0, 1)
        streak = (frng.random((BG_H, 1)) > 0.985) * frng.uniform(0.2, 0.5, (BG_H, 1))
        img = np.clip(img + (streak * (noise > 0.4))[..., None], 0, 1)
        img[..., 0] = np.roll(img[..., 0], 3, axis=1)
        img[..., 2] = np.roll(img[..., 2], -3, axis=1)
        img *= (1 - 0.18 * (np.arange(BG_H) % 2))[:, None, None]
        img = over(img, hexc('#ffffff'), blur(osd(f), 0.5) * 0.92)
        frames.append(to_img(img))
    return frames


BGS = {
    'bg-paper': (bg_paper, 100),
    'bg-sunset': (bg_sunset, 100),
    'bg-aurora': (bg_aurora, 120),
    'bg-paws': (bg_paws, 100),
    'bg-beach': (bg_beach, 130, 56),
    'bg-snow': (bg_snow, 90, 58),
    'bg-terminal': (bg_terminal, 110),
    'bg-vhs': (bg_vhs, 90, 55),
}


# ----------------------------------------------------------------- frames
# Drawn at 4x and downscaled for clean edges. Coordinates are centred, in
# -0.5..0.5 of the frame; the hole has radius HOLE/2 = 0.375, and rings start
# a hair inside it (0.366-0.372) so no sliver of photo shows past them.

SS = 4
N4 = FR * SS
LIGHT = np.array([-0.5, -0.62, 0.6], np.float32)
LIGHT /= np.linalg.norm(LIGHT)
HALF = LIGHT + np.array([0, 0, 1], np.float32)
HALF /= np.linalg.norm(HALF)


def fgrid():
    y, x = np.mgrid[0:N4, 0:N4].astype(np.float32)
    x, y = (x + 0.5) / N4 - 0.5, (y + 0.5) / N4 - 0.5
    return x, y, np.hypot(x, y), np.arctan2(y, x)


def finish(rgb, alpha):
    return to_img(rgb, alpha).resize((FR, FR), Image.LANCZOS)


def ring_mask(r, a, b):
    """1 inside [a, b] radii with a soft 1-sample edge at 4x."""
    e = 1.0 / N4
    return smooth(a - e, a + e, r) * smooth(b + e, b - e, r)


def tube(r, ang, a, b):
    """Lighting of a rounded band between radii a and b: (diffuse, specular)."""
    c = np.clip((r - a) / (b - a), 0, 1) * 2 - 1
    nz = np.sqrt(np.clip(1 - c * c, 0, 1))
    nx, ny = c * np.cos(ang), c * np.sin(ang)
    diff = np.clip(nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2], 0, 1)
    spec = np.clip(nx * HALF[0] + ny * HALF[1] + nz * HALF[2], 0, 1) ** 36
    return diff, spec, (nx, ny, nz)


def beads(x, y, ang, radius, count, size, skip=None):
    """A ring of domes: (coverage, diffuse, specular)."""
    k = np.round(ang / (TAU / count))
    ca = k * (TAU / count)
    dx, dy = x - radius * np.cos(ca), y - radius * np.sin(ca)
    d = np.hypot(dx, dy) / size
    cov = smooth(1 + 1.5 / (N4 * size), 1 - 1.5 / (N4 * size), d)
    if skip is not None:
        cov = cov * (~skip(ca))
    nz = np.sqrt(np.clip(1 - d * d, 0, 1))
    nx, ny = dx / size, dy / size
    diff = np.clip(nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2], 0, 1)
    spec = np.clip(nx * HALF[0] + ny * HALF[1] + nz * HALF[2], 0, 1) ** 40
    return cov, diff, spec


def fr_ink():
    # A single brush stroke, heavy where it lands, thinning and splitting
    # into dry bristle marks where it lifts off over its own start.
    x, y, r, ang = fgrid()
    rng = np.random.default_rng(17)
    start = math.radians(-118)
    p = ((ang - start) % TAU) / TAU          # 0 where the stroke lands, 1 a full turn later
    wob = fbm(np.cos(ang) * 2.5 + 3, np.sin(ang) * 2.5 + 3, 0, 18, 3)
    width = 0.021 + 0.012 * (wob - 0.5) * 2 + 0.006 * np.sin(p * math.pi)
    centre = 0.392 + 0.004 * (wob - 0.5)
    body = smooth(width + 1.2 / N4, width - 1.2 / N4, np.abs(r - centre))
    land = smooth(0.0, 0.03, p)
    body = body * (0.35 + 0.65 * land)
    # The overlapping tail: a thinner second pass over the first 40 degrees.
    q = p + 1
    tail_t = np.clip((q - 1.0) / 0.12, 0, 1)
    tw = 0.017 * (1 - tail_t) ** 0.8
    tail = smooth(tw + 1.2 / N4, tw - 1.2 / N4, np.abs(r - (centre + 0.009 + 0.004 * tail_t))) * (p < 0.12)
    bristle = smooth(0.35, 0.6, fbm(r * 900, ang * 3, 0, 19, 2, period=(400, 20, 1)))
    tail = tail * (1 - tail_t * (1 - bristle))
    alpha = np.maximum(body, tail)
    for _ in range(9):
        a = rng.uniform(0, TAU)
        rr = rng.uniform(0.42, 0.47)
        sz = rng.uniform(0.003, 0.008)
        alpha = np.maximum(alpha, smooth(sz + 1 / N4, sz - 1 / N4, np.hypot(x - rr * math.cos(a), y - rr * math.sin(a))))
    sheen = smooth(0.0, 0.8, -(x + y) / (r + 1e-6)) * np.exp(-((r - centre + width * 0.4) / (width * 0.35 + 1e-4)) ** 2)
    rgb = np.broadcast_to(hexc('#14110d'), x.shape + (3,)).copy()
    rgb = np.clip(rgb + sheen[..., None] * 0.16, 0, 1)
    return [finish(rgb, alpha)]


def fr_double():
    # Two polished steel rings with a row of tiny rivets between them.
    x, y, r, ang = fgrid()
    rgb = np.zeros(x.shape + (3,), np.float32)
    alpha = np.zeros(x.shape, np.float32)
    steel = [(0, '#3b3f47'), (0.45, '#8b919c'), (0.8, '#d5d9e0'), (1, '#ffffff')]
    for a, b in [(0.368, 0.387), (0.426, 0.445)]:
        m = ring_mask(r, a, b)
        diff, spec, _ = tube(r, ang, a, b)
        col = np.clip(ramp(steel, diff * 0.9) + spec[..., None] * 0.7, 0, 1)
        rgb = over(rgb, col, m)
        alpha = np.maximum(alpha, m)
    cov, diff, spec = beads(x, y, ang, 0.4065, 40, 0.0065)
    col = np.clip(ramp(steel, diff * 0.85) + spec[..., None] * 0.8, 0, 1)
    rgb = over(rgb, col, cov)
    alpha = np.maximum(alpha, cov)
    return [finish(rgb, alpha)]


GOLD = [(0, '#4a2c05'), (0.3, '#9a6513'), (0.55, '#d9a531'), (0.78, '#f6d77a'), (1, '#fff6cf')]


def fr_gold():
    x, y, r, ang = fgrid()
    band = ring_mask(r, 0.367, 0.414)
    diff, spec, (nx, ny, nz) = tube(r, ang, 0.367, 0.414)
    env = 0.5 + 0.5 * np.sin(nx * 4 + ny * 2.5 + 1.2)
    groove = np.exp(-((r - 0.3905) / 0.0016) ** 2)
    bcov, bdiff, bspec = beads(x, y, ang, 0.43, 36, 0.0115)
    frames = []
    n = 16
    for f in range(n):
        t = f / n
        glint = np.exp(-(wrap(ang - (-2.2 + TAU * t)) / 0.22) ** 2)
        col = ramp(GOLD, diff * 0.7 + env * 0.25 + glint * 0.25) + spec[..., None] * 0.6
        col = col * (1 - 0.45 * groove)[..., None]
        bcol = ramp(GOLD, bdiff * 0.85 + glint * 0.2) + bspec[..., None] * 0.9
        rgb = over(np.clip(col, 0, 1), np.clip(bcol, 0, 1), bcov)
        sparkle = glint * np.maximum(spec, bspec * bcov)
        rgb = np.clip(rgb + sparkle[..., None] * 0.8, 0, 1)
        frames.append(finish(rgb, np.maximum(band, bcov)))
    return frames


def fr_collar():
    x, y, r, ang = fgrid()
    a, b = 0.366, 0.432
    m = ring_mask(r, a, b)
    diff, spec, _ = tube(r, ang, a, b)
    grain = fbm(x * 260 + 200, y * 260 + 200, 0, 23, 3, period=(512, 512, 1))
    leather = ramp([(0, '#4a060d'), (0.45, '#9e101d'), (0.8, '#d42a33'), (1, '#f0646a')],
                   diff * 0.75 + (grain - 0.5) * 0.25)
    leather = np.clip(leather + spec[..., None] * 0.18, 0, 1)
    dash = np.sin(ang * 90) > 0.1
    for sr in (0.373, 0.425):
        st = ring_mask(r, sr - 0.0018, sr + 0.0018) * dash
        leather = over(leather, hexc('#f4dfae'), st * 0.95)
    bottom = lambda ca: np.abs(wrap(ca - math.pi / 2)) < 0.42
    scov, sdiff, sspec = beads(x, y, ang, 0.399, 14, 0.0135, skip=bottom)
    silver = np.clip(ramp([(0, '#4b4f57'), (0.6, '#b9bec8'), (1, '#ffffff')], sdiff) + sspec[..., None], 0, 1)
    rgb = over(leather, silver, scov)
    alpha = m

    # D-ring and a bone-shaped gold tag hanging from it.
    dring = ring_mask(np.hypot(x, (y - 0.432) * 1.15), 0.016, 0.023) * (y > 0.425)
    rgb = over(rgb, ramp([(0, '#6d4a12'), (1, '#f0cd6a')], 0.5 - x * 20), dring)
    alpha = np.maximum(alpha, dring)
    tx, ty = x, y - 0.466
    bone = np.maximum(smooth(0.016, 0.012, np.hypot(np.abs(tx) - 0.05, np.abs(ty) - 0.011)),
                      (np.abs(tx) < 0.05) * smooth(0.016, 0.012, np.abs(ty)))
    bdiff = np.clip(0.55 - tx * 6 - ty * 10, 0, 1)
    tag = ramp(GOLD, bdiff * 0.8 + 0.15)
    engr = (np.abs(tx) < 0.032) * (np.abs(np.abs(ty) - 0.0) < 0.0016)
    tag = tag * (1 - 0.4 * engr)[..., None]
    rgb = over(rgb, tag, bone)
    alpha = np.maximum(alpha, bone)
    return [finish(rgb, alpha)]


def fr_sun():
    x, y, r, ang = fgrid()
    ring = ring_mask(r, 0.369, 0.405)
    diff, spec, _ = tube(r, ang, 0.369, 0.405)
    rcol = np.clip(ramp([(0, '#c2540a'), (0.5, '#ffb627'), (1, '#fff1a8')], diff) + spec[..., None] * 0.5, 0, 1)
    period = TAU / 12
    frames = []
    n = 12
    for f in range(n):
        t = f / n
        rot = t * period
        wav = 0.035 * np.sin(r * 55 - TAU * t) * smooth(0.4, 0.49, r)
        u = ((ang - rot + wav) / period) % 1.0      # long ray at 0, short ray at 0.5
        long_d = np.abs(u - 0.0)
        long_d = np.minimum(long_d, 1 - long_d)
        short_d = np.abs(u - 0.5)
        reach_l = (r - 0.4) / (0.49 - 0.4)
        reach_s = (r - 0.4) / (0.455 - 0.4)
        ray_l = smooth(0.0, 1.0 / (period * N4 * r + 1e-6) * 2, 0.17 * (1 - reach_l) - long_d) * (reach_l < 1)
        ray_s = smooth(0.0, 1.0 / (period * N4 * r + 1e-6) * 2, 0.12 * (1 - reach_s) - short_d) * (reach_s < 1)
        rays = np.clip(np.maximum(ray_l, ray_s), 0, 1) * (r > 0.39)
        col = ramp([(0, '#fff2a0'), (0.4, '#ffbf2a'), (1, '#ff6418')], (r - 0.4) / 0.09)
        halo = np.exp(-((r - 0.41) / 0.04) ** 2) * 0.45 * (r > 0.4)
        rgb = over(col, rcol, ring)
        alpha = np.maximum(np.maximum(rays, ring), halo)
        rgb = np.where((alpha > halo + 1e-3)[..., None], rgb, hexc('#ffa31a'))
        frames.append(finish(rgb, alpha))
    return frames


def fr_frost():
    x, y, r, ang = fgrid()
    rng = np.random.default_rng(21)
    a, b = 0.367, 0.41
    ring = ring_mask(r, a, b)
    ns = 46
    sa = np.linspace(0, TAU, ns, endpoint=False) + rng.uniform(-0.05, 0.05, ns)
    sr = rng.uniform(a, b, ns)
    d1, d2, idx = voronoi(x, y, sr * np.cos(sa), sr * np.sin(sa))
    tint = rng.random(ns).astype(np.float32)[idx]
    edges = smooth(0.0035, 0.0, d2 - d1)
    diff, spec, _ = tube(r, ang, a, b)
    ice = ramp([(0, '#2a7db8'), (0.45, '#7fcaf0'), (0.8, '#d6f3ff'), (1, '#ffffff')],
               diff * 0.55 + tint * 0.35 + 0.1)
    ice = over(ice, hexc('#f2fcff'), edges * 0.85)
    ice = np.clip(ice + spec[..., None] * 0.5, 0, 1)
    alpha = ring * (0.86 + 0.14 * edges)

    # Shards growing outward, and icicles along the bottom.
    shards = np.zeros_like(r)
    shade = np.zeros_like(r)
    for i in range(22):
        ca = i / 22 * TAU + rng.uniform(-0.08, 0.08)
        if abs(wrap(ca - math.pi / 2)) < 0.65:
            continue
        ln = rng.uniform(0.025, 0.07)
        w = rng.uniform(0.012, 0.02)
        da = wrap(ang - ca) * r
        reach = np.clip((r - 0.4) / ln, 0, 1)
        s = smooth(1.2 / N4, -1.2 / N4, np.abs(da) - w * (1 - reach)) * (r > 0.395) * (r < 0.4 + ln)
        shards = np.maximum(shards, s)
        shade = np.where(s > 0, np.where(da > 0, 0.75, 1.0), shade)
    for i in range(9):
        ca = math.pi / 2 + (i - 4) * 0.13 + rng.uniform(-0.03, 0.03)
        ln = rng.uniform(0.035, 0.085) * (1 - abs(i - 4) / 7)
        da = wrap(ang - ca) * r
        reach = np.clip((r - 0.405) / ln, 0, 1)
        s = smooth(1.2 / N4, -1.2 / N4, np.abs(da) - 0.011 * (1 - reach) ** 1.3) * (r > 0.4) * (r < 0.405 + ln)
        shards = np.maximum(shards, s)
        shade = np.where(s > 0, np.where(da > 0, 0.8, 1.0), shade)
    scol = ramp([(0, '#5fb3e3'), (1, '#e9f9ff')], (1 - (r - 0.4) / 0.09) * shade)
    ice = over(ice, scol, shards * (1 - ring))
    alpha = np.maximum(alpha, shards * 0.92)

    def flakes(dr, s):
        for ca, cr, sz in [(-2.35, 0.432, 0.04), (-0.55, 0.44, 0.032), (2.75, 0.438, 0.028)]:
            cx, cy = (0.5 + cr * math.cos(ca)) * N4, (0.5 + cr * math.sin(ca)) * N4
            L = sz * N4
            for k in range(6):
                th = k * math.pi / 3 + 0.3
                ex, ey = cx + math.cos(th) * L, cy + math.sin(th) * L
                dr.line([(cx, cy), (ex, ey)], fill=255, width=6)
                for bb in (0.45, 0.72):
                    bx, by = cx + math.cos(th) * L * bb, cy + math.sin(th) * L * bb
                    for side in (-1, 1):
                        ph = th + side * 0.75
                        dr.line([(bx, by), (bx + math.cos(ph) * L * 0.32, by + math.sin(ph) * L * 0.32)],
                                fill=255, width=5)
            dr.ellipse([cx - 9, cy - 9, cx + 9, cy + 9], fill=255)
    im = Image.new('L', (N4, N4), 0)
    flakes(ImageDraw.Draw(im), 1)
    fm = np.asarray(im, np.float32) / 255
    shadow = np.roll(np.roll(blur(fm, 4), 4, axis=0), 3, axis=1)
    ice = over(ice, hexc('#1b5f93'), shadow * 0.5 * (1 - fm))
    alpha = np.maximum(alpha, shadow * 0.35)
    ice = over(ice, hexc('#ffffff'), fm)
    alpha = np.maximum(alpha, fm)

    sp = [(rng.uniform(0, TAU), rng.uniform(0.375, 0.44), rng.uniform(0, TAU), int(rng.integers(1, 3)))
          for _ in range(9)]
    frames = []
    n = 12
    for f in range(n):
        t = f / n
        rgb = ice.copy()
        al = alpha.copy()
        for pa, pr, ph, k in sp:
            px, py = math.cos(pa) * pr, math.sin(pa) * pr
            tw = max(0.0, math.sin(TAU * k * t + ph)) ** 3
            if tw < 0.01:
                continue
            dx, dy = np.abs(x - px), np.abs(y - py)
            star = (np.exp(-(dx / 0.0028) ** 2) * np.exp(-(dy / (0.03 * tw + 1e-4)) ** 2)
                    + np.exp(-(dy / 0.0028) ** 2) * np.exp(-(dx / (0.03 * tw + 1e-4)) ** 2)
                    + np.exp(-(np.hypot(dx, dy) / 0.008) ** 2)) * tw
            rgb = over(rgb, hexc('#ffffff'), np.clip(star, 0, 1))
            al = np.maximum(al, np.clip(star, 0, 1))
        frames.append(finish(rgb, al))
    return frames


def fr_glitch():
    x, y, r, ang = fgrid()
    base = ring_mask(r, 0.37, 0.408)
    calm = {0, 1, 2, 5, 6, 7, 10, 11}
    frames = []
    n = 12
    for f in range(n):
        frng = np.random.default_rng(300 + f)
        heavy = f not in calm
        core = base.copy()
        for _ in range(frng.integers(1, 3) + (2 if heavy else 0)):
            a0 = frng.uniform(-math.pi, math.pi)
            core *= 1 - (np.abs(wrap(ang - a0)) < frng.uniform(0.08, 0.35))
        out = np.zeros(x.shape + (3,), np.float32)
        alpha = np.zeros(x.shape, np.float32)
        sh = int((0.026 if heavy else 0.01) * N4)
        for mask, col, s in [(base, '#00e6ff', -sh), (base, '#ff2bd6', sh), (core, '#ffffff', 0)]:
            mm = np.roll(mask, s, axis=1)
            out = np.clip(out + mm[..., None] * hexc(col) * (0.8 if col != '#ffffff' else 1.0), 0, 1)
            alpha = np.maximum(alpha, mm)
        for _ in range(frng.integers(2, 4) + (3 if heavy else 0)):
            y0 = int(frng.uniform(0.08, 0.92) * N4)
            h = int(frng.uniform(0.01, 0.05) * N4)
            dx = int(frng.uniform(-0.07, 0.07) * N4)
            out[y0:y0 + h] = np.roll(out[y0:y0 + h], dx, axis=1)
            alpha[y0:y0 + h] = np.roll(alpha[y0:y0 + h], dx, axis=1)
        img = finish(out, alpha)
        # Stray data blocks on a hard pixel grid, then CRT scanlines.
        arr = np.asarray(img, np.float32) / 255
        pal = [hexc('#00e6ff'), hexc('#ff2bd6'), hexc('#ffffff'), hexc('#7a5cff')]
        for _ in range(frng.integers(6, 10) + (10 if heavy else 0)):
            a0 = frng.uniform(-math.pi, math.pi)
            rr = frng.uniform(0.36, 0.47) * FR
            bx = int((FR / 2 + rr * math.cos(a0)) // 6 * 6)
            by = int((FR / 2 + rr * math.sin(a0)) // 6 * 6)
            w = 6 * int(frng.integers(1, 4))
            arr[by:by + 6, bx:bx + w, :3] = pal[int(frng.integers(0, 4))]
            arr[by:by + 6, bx:bx + w, 3] = frng.uniform(0.6, 1.0)
        arr[1::3, :, 3] *= 0.7
        frames.append(Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA'))
    return frames


FRAMES = {
    'border-ink': (fr_ink, 100),
    'border-double': (fr_double, 100),
    'border-gold': (fr_gold, 110),
    'border-collar': (fr_collar, 100),
    'border-sun': (fr_sun, 120, 58),
    'border-frost': (fr_frost, 150),
    'border-glitch': (fr_glitch, 110),
}


# ------------------------------------------------------------------ names
# Fills for the nickname text. Stretched over the text's box, so they are
# painted for the aspect of a short name. Thin strokes only ever show a
# sliver of the picture, so every fill stays mid-toned and saturated - never
# so pale it vanishes on the light theme or so dark it vanishes on the dark.

def ngrid():
    x, y = grid(NAME_W, NAME_H)
    return x, y, x * NAME_W, y * NAME_H


def sweep(x, y, t, width=0.09, period=2.2):
    """A diagonal sheen crossing once per loop, off the text half the time."""
    p = (x + 0.35 * y - t * period + 0.5) % period - 0.5
    return np.exp(-(p / width) ** 2)


def nm_caps():
    x, y, PX, PY = ngrid()
    g = fbm(PX / 2, PY / 2, 0, 81, 2, period=(128, 32, 1))
    return [to_img(ramp([(0, '#1a1712'), (1, '#3d362b')], y) * (0.9 + 0.2 * g)[..., None])]


def nm_caps_dark():
    # Small Caps is ink on paper; on the dark theme it is paper on ink.
    x, y, PX, PY = ngrid()
    g = fbm(PX / 2, PY / 2, 0, 82, 2, period=(128, 32, 1))
    return [to_img(ramp([(0, '#f7f0de'), (1, '#d2c8b0')], y) * (0.96 + 0.06 * g)[..., None])]


def nm_gradient():
    x, y, PX, PY = ngrid()
    img = ramp([(0, '#c9682f'), (0.5, '#b5823f'), (1, '#4f8a5e')], x * 0.85 + y * 0.15)
    img = np.clip(img + (smooth(0.5, 0.0, y) * 0.07)[..., None], 0, 1)
    return [to_img(img)]


def nm_terminal():
    x, y, PX, PY = ngrid()
    scan = 1 - 0.28 * ((np.arange(NAME_H) % 3) == 0).astype(np.float32)[:, None]
    frames = []
    n = 8
    for f in range(n):
        t = f / n
        band = np.exp(-((((y - t) % 1.0) - 0.5) * 5) ** 2)
        img = ramp([(0, '#17c95e'), (0.6, '#3dff8c'), (1, '#b4ffd2')], 0.25 + band * 0.6)
        img *= (0.94 + 0.06 * math.cos(TAU * t * 3))
        frames.append(to_img(img * scan[..., None]))
    return frames


def nm_woof():
    x, y, PX, PY = ngrid()
    fur = fbm(PX / 1.5 + PY / 3, PY / 9 - PX / 14, 0, 83, 3, period=(256, 64, 1))
    img = ramp([(0, '#7c3f12'), (0.5, '#b4651f'), (1, '#d68a3a')], fur * 0.8 + 0.1 + y * 0.1)
    spots = smooth(0.58, 0.64, fbm(PX / 14, PY / 10, 0, 84, 3, period=(32, 16, 1)))
    img = over(img, hexc('#4a260c'), spots * 0.85)
    patch = smooth(0.62, 0.68, fbm(PX / 18 + 7, PY / 12 + 7, 0, 85, 3, period=(32, 16, 1)))
    img = over(img, hexc('#e8b06a'), patch * 0.7)
    return [to_img(img)]


TROPIC = [(0, '#00b894'), (0.25, '#6fd94a'), (0.5, '#ffbb24'), (0.75, '#ff5f8a'), (1, '#00b894')]


def nm_tropic():
    x, y, PX, PY = ngrid()
    frames = []
    n = 12
    for f in range(n):
        t = f / n
        u = (x * 0.9 + 0.12 * np.sin(TAU * (y * 0.8 + x * 2 - t)) - t) % 1.0
        img = ramp(TROPIC, u)
        leaf = np.sin(TAU * (x * 6 + y * 1.5 - t * 2)) * 0.5 + 0.5
        img *= (0.9 + 0.12 * leaf)[..., None]
        frames.append(to_img(img))
    return frames


def nm_ice():
    x, y, PX, PY = ngrid()
    rng = np.random.default_rng(86)
    ns = 22
    d1, d2, idx = voronoi(PX, PY, rng.uniform(0, NAME_W, ns), rng.uniform(0, NAME_H, ns))
    tint = rng.random(ns).astype(np.float32)[idx]
    edges = smooth(1.6, 0.0, d2 - d1)
    base = ramp([(0, '#1b5fa8'), (0.5, '#3a9be0'), (1, '#86d2f4')], (1 - y) * 0.6 + tint * 0.4)
    base = over(base, hexc('#c9efff'), edges * 0.6)
    frames = []
    n = 12
    for f in range(n):
        t = f / n
        frames.append(to_img(np.clip(base + sweep(x, y, t)[..., None] * 0.45, 0, 1)))
    return frames


def nm_gold():
    x, y, PX, PY = ngrid()
    rng = np.random.default_rng(87)
    ns = 16
    d1, d2, idx = voronoi(PX, PY, rng.uniform(0, NAME_W, ns), rng.uniform(0, NAME_H, ns))
    leaf = rng.uniform(-0.08, 0.08, ns).astype(np.float32)[idx]
    crack = smooth(1.2, 0.0, d2 - d1)
    base = ramp([(0, '#6b3f06'), (0.3, '#c8901c'), (0.52, '#f4cf5c'), (0.72, '#b67b16'), (1, '#6e4207')],
                y + leaf)
    base = base * (1 - 0.35 * crack)[..., None]
    frames = []
    n = 12
    for f in range(n):
        t = f / n
        frames.append(to_img(np.clip(base + sweep(x, y, t, 0.07)[..., None] * hexc('#fff3c0') * 0.55, 0, 1)))
    return frames


def nm_glitch():
    x, y, PX, PY = ngrid()
    frames = []
    n = 10
    for f in range(n):
        frng = np.random.default_rng(400 + f)
        img = ramp([(0, '#ff2bd6'), (0.5, '#9b4dff'), (1, '#00d9ff')], x)
        for _ in range(frng.integers(2, 5)):
            y0 = int(frng.uniform(0, 1) * NAME_H)
            h = int(frng.uniform(0.06, 0.22) * NAME_H)
            img[y0:y0 + h] = np.roll(img[y0:y0 + h], int(frng.uniform(-70, 70)), axis=1)
        for _ in range(frng.integers(1, 4)):
            bx, by = int(frng.uniform(0, NAME_W - 16)), int(frng.uniform(0, NAME_H - 6))
            img[by:by + int(frng.integers(3, 8)), bx:bx + int(frng.integers(8, 40))] = \
                [hexc('#ffffff'), hexc('#00f0ff'), hexc('#ff2bd6')][int(frng.integers(0, 3))]
        if f % 3 == 0:
            img[::2] = np.clip(img[::2] * 1.15 + 0.06, 0, 1)
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
        for name, (fn, dur, *q) in table.items():
            if only and name not in only:
                continue
            # A third entry overrides the quality, for the noisy animated
            # items that would otherwise weigh several hundred KB.
            quality = q[0] if q else 75 if kind != 'name' else 85
            save(name, kind, fn(), duration=dur, quality=quality)


if __name__ == '__main__':
    main(sys.argv[1:])
