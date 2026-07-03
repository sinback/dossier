#!/usr/bin/env python3
"""
render_glyph.py — rasterize synthesized glyph geometry to clean PNGs.

Fetches ring geometry from the dev server's /api/render endpoint (format=json)
and rasterizes it with Shapely + PIL. No browser, no screenshots, no review-UI
overlays — this replaces snap.sh for "what does the synthesized letterform
look like" questions. snap.sh remains the tool for ink-simulation output.

Usage:
  uv run python matlack/tools/render_glyph.py o
  uv run python matlack/tools/render_glyph.py o --entry none --exit none
  uv run python matlack/tools/render_glyph.py o --px 400 --rules -o /tmp/o.png
  uv run python matlack/tools/render_glyph.py --alphabet
  uv run python matlack/tools/render_glyph.py o --overrides '{"bowl":{"dx":4,"dy":0}}'

Default output lands in matlack/renders/_scratch/ (gitignored). Also prints
ink area and bbox stats, and exposes fetch_render()/ink_geometry() for reuse
from tests and other analysis scripts.
"""

import argparse
import json
import math
import string
import sys
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw
from shapely.geometry import Polygon
from shapely.ops import unary_union

try:
    from shapely import make_valid
except ImportError:  # shapely < 2.0 fallback
    def make_valid(g):
        return g.buffer(0)

DEV_SERVER = "http://localhost:3000"
SCRATCH_DIR = Path(__file__).resolve().parents[1] / "renders" / "_scratch"

INK = (30, 38, 58)
BG = (255, 255, 255)
RULE_COLOR = (200, 170, 170)
ANCHOR_COLOR = (200, 60, 60)


def fetch_render(letter, entry=None, exit=None, overrides=None, size=100):
    """Fetch ring geometry for one glyph. Raises RuntimeError on server error."""
    params = {"letter": letter, "format": "json", "size": size}
    if entry:
        params["entry"] = entry
    if exit:
        params["exit"] = exit
    if overrides:
        params["overrides"] = json.dumps(overrides)
    url = f"{DEV_SERVER}/api/render?{urllib.parse.urlencode(params)}"
    with urllib.request.urlopen(url, timeout=5) as r:
        data = json.load(r)
    if "error" in data:
        raise RuntimeError(f"{letter}: {data['error']}")
    return data


def ink_geometry(render):
    """Union all rings into the final ink shape (Polygon or MultiPolygon).

    Bowls are built as outer.difference(inner), validating each ring first:
    open bowls (c, and taper-to-nothing variants) have effective-inner rings
    that touch/self-intersect along the open arc, which Polygon-with-hole
    construction does not survive (the hole gets dropped and the bowl fills
    solid). SVG evenodd and the WebGL cutout tolerate those rings; Shapely
    needs the explicit difference.
    """
    parts = []
    for ring in render["rings"]:
        if ring["kind"] == "bowl":
            outer = make_valid(Polygon(ring["outer"]))
            inner = make_valid(Polygon(ring["inner"]))
            parts.append(outer.difference(inner))
        else:
            pts = ring["points"]
            if len(pts) < 3:
                continue
            parts.append(make_valid(Polygon(pts)))
    return unary_union(parts)


def _polygons(geom):
    """Flatten any shapely geometry to a list of Polygons."""
    if geom.is_empty:
        return []
    if geom.geom_type == "Polygon":
        return [geom]
    return [g for g in getattr(geom, "geoms", []) if g.geom_type == "Polygon"]


def rasterize(render, geom=None, px=300, rules=False, supersample=4):
    """Rasterize one glyph render to a PIL image (px × px, white bg)."""
    if geom is None:
        geom = ink_geometry(render)
    frame = render["frame"]
    big = px * supersample
    ppu = big / frame["height"]

    def tf(pt):
        return ((pt[0] - frame["minX"]) * ppu, (pt[1] - frame["minY"]) * ppu)

    img = Image.new("RGB", (big, big), BG)
    draw = ImageDraw.Draw(img)

    if rules and render.get("rules"):
        for y in render["rules"].values():
            _, ypx = tf((0, y))
            draw.line([(0, ypx), (big, ypx)], fill=RULE_COLOR, width=supersample)

    for poly in _polygons(geom):
        draw.polygon([tf(p) for p in poly.exterior.coords], fill=INK)
        for hole in poly.interiors:
            draw.polygon([tf(p) for p in hole.coords], fill=BG)

    if rules and render.get("anchor"):
        ax, ay = tf(render["anchor"])
        r = 3 * supersample
        draw.line([(ax - r, ay), (ax + r, ay)], fill=ANCHOR_COLOR, width=supersample)
        draw.line([(ax, ay - r), (ax, ay + r)], fill=ANCHOR_COLOR, width=supersample)

    return img.resize((px, px), Image.LANCZOS)


def stats(render, geom):
    """One-line numeric summary of the ink geometry."""
    if geom.is_empty:
        return "EMPTY geometry"
    minx, miny, maxx, maxy = geom.bounds
    n = len(_polygons(geom))
    holes = sum(len(p.interiors) for p in _polygons(geom))
    return (
        f"area={geom.area:.0f} bbox=({minx:.1f},{miny:.1f})–({maxx:.1f},{maxy:.1f}) "
        f"w={maxx - minx:.1f} h={maxy - miny:.1f} polys={n} holes={holes}"
    )


def render_alphabet(px, rules, out_path):
    """Contact sheet of every letter the endpoint can render."""
    letters = list(string.ascii_lowercase)
    cols = 7
    rows = math.ceil(len(letters) / cols)
    sheet = Image.new("RGB", (cols * px, rows * px), BG)
    draw = ImageDraw.Draw(sheet)
    failed = []
    for i, letter in enumerate(letters):
        x, y = (i % cols) * px, (i // cols) * px
        try:
            render = fetch_render(letter)
            cell = rasterize(render, px=px, rules=rules)
            sheet.paste(cell, (x, y))
        except Exception as e:
            failed.append(f"{letter}: {e}")
            draw.rectangle([x + 2, y + 2, x + px - 2, y + px - 2], outline=(220, 60, 60))
        draw.text((x + 4, y + 2), letter, fill=(150, 150, 150))
    sheet.save(out_path)
    print(f"wrote {out_path}")
    for f in failed:
        print(f"  FAILED {f}", file=sys.stderr)


def main():
    ap = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    ap.add_argument("letter", nargs="?", help="letter to render")
    ap.add_argument("--alphabet", action="store_true", help="contact sheet of all letters")
    ap.add_argument("--entry", help="entry variant (none/low/high)")
    ap.add_argument("--exit", help="exit variant (none/low/high)")
    ap.add_argument("--overrides", help="component offset overrides JSON")
    ap.add_argument("--px", type=int, default=300, help="output image size in px (default 300)")
    ap.add_argument("--rules", action="store_true", help="draw rule lines + anchor cross")
    ap.add_argument("-o", "--out", help="output path (default: matlack/renders/_scratch/)")
    args = ap.parse_args()

    if not args.alphabet and not args.letter:
        ap.error("give a letter or --alphabet")

    SCRATCH_DIR.mkdir(parents=True, exist_ok=True)

    if args.alphabet:
        out = args.out or SCRATCH_DIR / "alphabet.png"
        render_alphabet(args.px, args.rules, out)
        return

    variant_suffix = ""
    if args.entry or args.exit:
        variant_suffix = f"_{args.entry or 'def'}-{args.exit or 'def'}"
    out = args.out or SCRATCH_DIR / f"{args.letter}{variant_suffix}.png"

    overrides = json.loads(args.overrides) if args.overrides else None
    render = fetch_render(args.letter, args.entry, args.exit, overrides)
    geom = ink_geometry(render)
    rasterize(render, geom, px=args.px, rules=args.rules).save(out)
    print(f"wrote {out}")
    print(f"  {stats(render, geom)}")


if __name__ == "__main__":
    main()
