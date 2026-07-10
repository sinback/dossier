#!/usr/bin/env python3
"""shape_check.py — verify the built OTF the way a browser will see it.

Shapes text with uharfbuzz (curs+calt — HarfBuzz, same engine as
Firefox) and reports the variant-glyph picks, dy offsets, and per-word
ink connectivity. Also checks per-glyph ink connectivity, which catches
components that are attached at compose scale but ship as separate ink
islands in the integer-unit font (h's exit slice, 2026-07-10).

Usage:
  uv run python matlack/tools/shape_check.py "to the"           # shape + connectivity
  uv run python matlack/tools/shape_check.py "the" --png out.png
  uv run python matlack/tools/shape_check.py --glyphs t h e     # per-glyph components

Exit code is nonzero if any |dy| > 2, any word's substantial ink is more
than one component, or any checked glyph's substantial ink is more than
one component — so tests/agents can gate on it. ("Substantial" ignores
sub-su fade-tip specks, area <= 50 font units².)
"""
import argparse
import sys

import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import RecordingPen
from shapely import affinity
from shapely.geometry import Polygon
from shapely.ops import unary_union

FONT = "matlack-draft.otf"
SPECK_AREA = 50  # font-units²; fade-tip debris below this is ignored


def flatten_cubic(p0, p1, p2, p3, n=24):
    pts = []
    for i in range(1, n + 1):
        t = i / n
        u = 1 - t
        pts.append((
            u**3 * p0[0] + 3*u*u*t * p1[0] + 3*u*t*t * p2[0] + t**3 * p3[0],
            u**3 * p0[1] + 3*u*u*t * p1[1] + 3*u*t*t * p2[1] + t**3 * p3[1],
        ))
    return pts


def glyph_ink(glyph_set, name):
    """Glyph outline -> shapely ink under nonzero winding (CCW contours
    union, CW contours subtract — matches build_font.py's outer/inner
    convention)."""
    pen = RecordingPen()
    glyph_set[name].draw(pen)
    contours, cur = [], []
    for op, args in pen.value:
        if op == "moveTo":
            cur = [args[0]]
        elif op == "lineTo":
            cur.append(args[0])
        elif op == "curveTo":
            cur.extend(flatten_cubic(cur[-1], *args))
        elif op == "qCurveTo":
            cur.extend(a for a in args if a is not None)
        elif op == "closePath":
            if len(cur) >= 3:
                contours.append(cur)
            cur = []
    pos, neg = [], []
    for c in contours:
        poly = Polygon(c)
        if not poly.is_valid:
            poly = poly.buffer(0)
        if poly.is_empty:
            continue
        (pos if Polygon(c).exterior.is_ccw else neg).append(poly)
    ink = unary_union(pos) if pos else Polygon()
    if neg:
        ink = ink.difference(unary_union(neg))
    return ink


def polys(geom):
    return [geom] if geom.geom_type == "Polygon" else list(geom.geoms)


def substantial(geom):
    return [p for p in polys(geom) if p.area > SPECK_AREA]


def shape_text(font, text):
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(font, buf, {"calt": True, "curs": True})
    return buf


def check_text(text, png=None):
    blob = hb.Blob.from_file_path(FONT)
    font = hb.Font(hb.Face(blob))
    glyph_set = TTFont(FONT).getGlyphSet()
    ok = True

    for word in text.split():
        buf = shape_text(font, word)
        names, dys, pieces = [], [], []
        x = y = 0.0
        for info, posn in zip(buf.glyph_infos, buf.glyph_positions):
            name = font.glyph_to_string(info.codepoint)
            names.append(name)
            dys.append(posn.y_offset)
            ink = glyph_ink(glyph_set, name)
            if not ink.is_empty:
                pieces.append(affinity.translate(ink, x + posn.x_offset, y + posn.y_offset))
            x += posn.x_advance
            y += posn.y_advance
        word_ink = unary_union(pieces)
        n = len(substantial(word_ink))
        dy_bad = any(abs(d) > 2 for d in dys)
        conn_bad = n != 1
        if dy_bad or conn_bad:
            ok = False
        flags = (" <-- dy!" if dy_bad else "") + (f" <-- {n} components!" if conn_bad else "")
        print(f"{word:12} -> {names}  dy={dys}  components={n}{flags}")

    if png:
        render_text(font, glyph_set, text, png)
    return ok


def render_text(font, glyph_set, text, out_png, px_height=340):
    from PIL import Image, ImageDraw
    BG, INK = (255, 255, 255), (28, 34, 52)
    # words spaced by 40% of the em
    pieces = []
    x_cursor = 0.0
    for word in text.split():
        buf = shape_text(font, word)
        x, y = x_cursor, 0.0
        for info, posn in zip(buf.glyph_infos, buf.glyph_positions):
            ink = glyph_ink(glyph_set, font.glyph_to_string(info.codepoint))
            if not ink.is_empty:
                pieces.append(affinity.translate(ink, x + posn.x_offset, y + posn.y_offset))
            x += posn.x_advance
            y += posn.y_advance
        x_cursor = x + 400
    geom = unary_union(pieces)
    minx, miny, maxx, maxy = geom.bounds
    pad = 60
    w, h = maxx - minx + 2 * pad, maxy - miny + 2 * pad
    scale = px_height / h
    W, H, ss = int(w * scale), int(h * scale), 3
    img = Image.new("RGB", (W * ss, H * ss), BG)
    draw = ImageDraw.Draw(img)

    def tf(p):  # font y-up -> image y-down
        return ((p[0] - minx + pad) * scale * ss, (maxy + pad - p[1]) * scale * ss)

    for poly in polys(geom):
        draw.polygon([tf(p) for p in poly.exterior.coords], fill=INK)
        for hole in poly.interiors:
            draw.polygon([tf(p) for p in hole.coords], fill=BG)
    img.resize((W, H), Image.LANCZOS).save(out_png)
    print(f"wrote {out_png}")


def check_glyphs(names):
    glyph_set = TTFont(FONT).getGlyphSet()
    ok = True
    for name in names:
        ink = glyph_ink(glyph_set, name)
        n = len(substantial(ink))
        if n != 1:
            ok = False
        print(f"{name:12} substantial-components={n}{'' if n == 1 else ' <-- split!'}")
    return ok


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("text", nargs="?", help="text to shape (words checked independently)")
    ap.add_argument("--png", help="also render the shaped text to this PNG")
    ap.add_argument("--glyphs", nargs="+", help="check per-glyph ink connectivity instead")
    args = ap.parse_args()
    if not args.text and not args.glyphs:
        ap.error("give text and/or --glyphs")
    ok = True
    if args.text:
        ok = check_text(args.text, args.png) and ok
    if args.glyphs:
        ok = check_glyphs(args.glyphs) and ok
    sys.exit(0 if ok else 1)
