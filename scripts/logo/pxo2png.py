#!/usr/bin/env python3
"""Render a Pixelorama .pxo to PNGs and a favicon. Usage: pxo2png.py SRC.pxo OUTDIR

#AVE-0017. Standard library only.
"""

import json
import struct
import sys
import zipfile
import zlib
from pathlib import Path

ICO_SIZES = (16, 32, 64)
SCALES = {"logo.png": 1, "logo_x2.png": 2, "logo_x4.png": 4}


# #AVE-0017
def flatten(pxo: Path) -> tuple[bytes, int, int]:
    """Composite the visible layers of the single frame, bottom to top, into straight RGBA."""
    with zipfile.ZipFile(pxo) as z:
        meta = json.loads(z.read("data.json"))
        w, h = meta["size_x"], meta["size_y"]
        if meta["color_mode"] != 5:
            raise SystemExit(
                f"{pxo}: only RGBA8 projects are supported (color_mode {meta['color_mode']})"
            )
        if len(meta["frames"]) != 1:
            raise SystemExit(f"{pxo}: expected one frame, found {len(meta['frames'])}")
        cels = meta["frames"][0]["cels"]
        out = [(0.0, 0.0, 0.0, 0.0)] * (w * h)
        for i, layer in enumerate(meta["layers"]):
            if layer["type"] != 0:
                raise SystemExit(f"{pxo}: layer {layer['name']!r} is not a pixel layer")
            if not layer["visible"]:
                continue
            if layer["blend_mode"] != 0:
                raise SystemExit(
                    f"{pxo}: layer {layer['name']!r} uses an unsupported blend mode"
                )
            data = z.read(f"image_data/frames/1/layer_{i + 1}")
            if len(data) != w * h * 4:
                raise SystemExit(
                    f"{pxo}: layer {layer['name']!r} has {len(data)} bytes, expected {w * h * 4}"
                )
            opacity = layer["opacity"] * cels[i]["opacity"]
            for p in range(w * h):
                r, g, b, a = data[p * 4 : p * 4 + 4]
                sa = a / 255 * opacity
                if sa == 0:
                    continue
                dr, dg, db, da = out[p]
                oa = sa + da * (1 - sa)
                out[p] = tuple(
                    (s * sa + d * da * (1 - sa)) / oa
                    for s, d in ((r, dr), (g, dg), (b, db))
                ) + (oa,)
    rgba = bytearray()
    for r, g, b, a in out:
        rgba += bytes((round(r), round(g), round(b), round(a * 255)))
    return bytes(rgba), w, h


# #AVE-0017
def scale(rgba: bytes, w: int, h: int, size: int) -> tuple[bytes, int, int]:
    """Square image to `size`: nearest neighbour up, box average down; integer ratios only."""
    if w != h:
        raise SystemExit("only square images are supported")
    if size >= w:
        k = size // w
        if size % w:
            raise SystemExit(f"{size} is not an integer multiple of {w}")
        rows = []
        for y in range(h):
            row = b"".join(
                rgba[(y * w + x) * 4 : (y * w + x) * 4 + 4] * k for x in range(w)
            )
            rows += [row] * k
        return b"".join(rows), size, size
    k = w // size
    if w % size:
        raise SystemExit(f"{w} is not an integer multiple of {size}")
    out = bytearray()
    for y in range(size):
        for x in range(size):
            px = [
                rgba[((y * k + j) * w + x * k + i) * 4 :][:4]
                for j in range(k)
                for i in range(k)
            ]
            a = sum(p[3] for p in px)
            if a == 0:
                out += bytes(4)
                continue
            # alpha-weighted so transparent pixels do not darken the edge
            out += bytes(round(sum(p[c] * p[3] for p in px) / a) for c in range(3))
            out.append(round(a / len(px)))
    return bytes(out), size, size


# #AVE-0017
def png(rgba: bytes, w: int, h: int) -> bytes:
    def chunk(tag: bytes, body: bytes) -> bytes:
        return (
            struct.pack(">I", len(body))
            + tag
            + body
            + struct.pack(">I", zlib.crc32(tag + body))
        )

    raw = b"".join(b"\0" + rgba[y * w * 4 : (y + 1) * w * 4] for y in range(h))
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


# #AVE-0017
def ico(images: list[tuple[int, bytes]]) -> bytes:
    """An .ico of PNG-compressed entries: (size, png bytes) each."""
    head = struct.pack("<HHH", 0, 1, len(images))
    offset = 6 + 16 * len(images)
    entries, blobs = b"", b""
    for size, data in images:
        entries += struct.pack(
            "<BBBBHHII", size % 256, size % 256, 0, 0, 1, 32, len(data), offset
        )
        blobs += data
        offset += len(data)
    return head + entries + blobs


# #AVE-0017
def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__.strip().splitlines()[0], file=sys.stderr)
        return 2
    rgba, w, h = flatten(Path(argv[1]))
    out = Path(argv[2])
    out.mkdir(parents=True, exist_ok=True)
    for name, k in SCALES.items():
        (out / name).write_bytes(png(*scale(rgba, w, h, w * k)))
    (out / "favicon.ico").write_bytes(
        ico([(s, png(*scale(rgba, w, h, s))) for s in ICO_SIZES])
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
