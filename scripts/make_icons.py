#!/usr/bin/env python3
"""Generate the PWA icons as real PNGs, with no image library available.

Python here has no PIL, and the manifest needs PNG icons for the app to be
installable. So the pixels are drawn by hand and the file is assembled with
zlib and struct, both of which are in the standard library.

    python3 scripts/make_icons.py

The mark is two exchange arrows, drawn inside the central 80% of the canvas so
it survives Android's maskable-icon cropping.
"""

from __future__ import annotations

import struct
import sys
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SIZES = (192, 512)

BACKGROUND = (0x0B, 0x12, 0x20)
FOREGROUND = (0x4A, 0xDE, 0x80)

# Supersampling factor per axis: 3 means nine samples per pixel, which is
# enough to keep the diagonal arrow heads from looking like stairs.
SUPERSAMPLE = 3

# The two arrows, in fractions of the canvas. Keep them inside 0.1 to 0.9.
ARROWS = (
    # Pointing right.
    {
        "bar": (0.22, 0.355, 0.70, 0.445),
        "head": ((0.70, 0.290), (0.70, 0.510), (0.82, 0.400)),
    },
    # Pointing left.
    {
        "bar": (0.30, 0.555, 0.78, 0.645),
        "head": ((0.30, 0.490), (0.30, 0.710), (0.18, 0.600)),
    },
)


def _inside_rect(x, y, rect):
    x0, y0, x1, y1 = rect
    return x0 <= x <= x1 and y0 <= y <= y1


def _side(ax, ay, bx, by, px, py):
    return (bx - ax) * (py - ay) - (by - ay) * (px - ax)


def _inside_triangle(x, y, triangle):
    (ax, ay), (bx, by), (cx, cy) = triangle
    d1 = _side(ax, ay, bx, by, x, y)
    d2 = _side(bx, by, cx, cy, x, y)
    d3 = _side(cx, cy, ax, ay, x, y)
    negative = d1 < 0 or d2 < 0 or d3 < 0
    positive = d1 > 0 or d2 > 0 or d3 > 0
    return not (negative and positive)


def _is_mark(x, y):
    for arrow in ARROWS:
        if _inside_rect(x, y, arrow["bar"]) or _inside_triangle(x, y, arrow["head"]):
            return True
    return False


def _blend(background, foreground, ratio):
    if ratio <= 0:
        return background
    if ratio >= 1:
        return foreground
    return tuple(
        round(background[channel] + (foreground[channel] - background[channel]) * ratio)
        for channel in range(3)
    )


def render(size):
    """Return the RGBA scanlines of one icon."""
    total_samples = SUPERSAMPLE * SUPERSAMPLE
    rows = []

    for pixel_y in range(size):
        row = bytearray()
        for pixel_x in range(size):
            hits = 0
            for sample_y in range(SUPERSAMPLE):
                y = (pixel_y + (sample_y + 0.5) / SUPERSAMPLE) / size
                for sample_x in range(SUPERSAMPLE):
                    x = (pixel_x + (sample_x + 0.5) / SUPERSAMPLE) / size
                    if _is_mark(x, y):
                        hits += 1
            row += bytes((*_blend(BACKGROUND, FOREGROUND, hits / total_samples), 0xFF))
        rows.append(bytes(row))

    return rows


def _chunk(tag, data):
    return (
        struct.pack(">I", len(data))
        + tag
        + data
        + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    )


def write_png(path, size, rows):
    raw = b"".join(b"\x00" + row for row in rows)  # filter type 0 per scanline
    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + _chunk(b"IHDR", header)
        + _chunk(b"IDAT", zlib.compress(raw, 9))
        + _chunk(b"IEND", b"")
    )


def main():
    for size in SIZES:
        target = ROOT / f"icon-{size}.png"
        write_png(target, size, render(size))
        print(f"escrito {target} ({target.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
