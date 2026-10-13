#!/usr/bin/env python3
"""Renders the XOXD logo into every size the site and the app need.

    python3 tools/gen-brand.py

Source of truth: assets/brand/xoxd-logo.png (the logo, black on white or
transparent). Needs Pillow. The vector version, assets/brand/xoxd.svg, is the
same shape traced from that PNG; the nav, the stats card and the app's
BrandMark component embed its path.

Writes:
  icons/icon-192.png, icons/icon-512.png      "any" icons, logo on white
  icons/icon-maskable-512.png                 logo inside the maskable safe zone
  icons/apple-touch-icon.png                  180px, opaque as iOS requires
  mobile/assets/icon.png                      1024px app icon
  mobile/assets/adaptive-icon.png             Android foreground, transparent
  mobile/assets/splash-mark.png               cream logo for the terracotta splash
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets' / 'brand' / 'xoxd-logo.png'
CREAM = (253, 247, 234)


def load_mask():
    """The logo as a coverage mask (0..255), cropped to its bounding box."""
    im = Image.open(SRC).convert('RGBA')
    white = Image.new('RGBA', im.size, (255, 255, 255, 255))
    white.alpha_composite(im)
    gray = np.asarray(white.convert('L'), dtype=np.float32)
    mask = (255 - gray).clip(0, 255).astype(np.uint8)
    ys, xs = np.where(mask > 8)
    return Image.fromarray(mask[ys.min():ys.max() + 1, xs.min():xs.max() + 1])


def render(mask, size, fill, bg=None, width_frac=0.66):
    """Centre the logo in a size x size canvas, `width_frac` of its width."""
    w = max(1, round(size * width_frac))
    h = round(w * mask.height / mask.width)
    if h > size * width_frac:           # the mark is nearly square; never overflow
        h = round(size * width_frac)
        w = round(h * mask.width / mask.height)
    m = mask.resize((w, h), Image.LANCZOS)
    canvas = Image.new('RGBA', (size, size), bg or (0, 0, 0, 0))
    glyph = Image.new('RGBA', (w, h), fill + (255,))
    glyph.putalpha(m)
    canvas.alpha_composite(glyph, ((size - w) // 2, (size - h) // 2))
    return canvas


def save(img, path, opaque=False):
    out = ROOT / path
    img = img.convert('RGB') if opaque else img
    img.save(out, optimize=True)
    print(f'{path}: {img.size[0]}x{img.size[1]}')


def main():
    mask = load_mask()
    black, white = (0, 0, 0), (255, 255, 255)
    for size in (192, 512):
        save(render(mask, size, black, white + (255,), 0.68), f'icons/icon-{size}.png', opaque=True)
    save(render(mask, 512, black, white + (255,), 0.5), 'icons/icon-maskable-512.png', opaque=True)
    save(render(mask, 180, black, white + (255,), 0.7), 'icons/apple-touch-icon.png', opaque=True)
    save(render(mask, 1024, black, white + (255,), 0.66), 'mobile/assets/icon.png', opaque=True)
    save(render(mask, 1024, black, None, 0.46), 'mobile/assets/adaptive-icon.png')
    save(render(mask, 1024, CREAM, None, 0.5), 'mobile/assets/splash-mark.png')


if __name__ == '__main__':
    main()
