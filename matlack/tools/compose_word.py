#!/usr/bin/env python3
"""
compose_word.py — geometry-level preview of curs-joined letter sequences.

Chains glyphs the way the OpenType `curs` feature will: each letter is
translated so its entry anchor lands on the previous letter's exit anchor.
This previews (and quantifies) cross-glyph joins before any font is built.

Rendering color-codes the joins: letters alternate ink colors and the
overlap zones (prev-exit flick ∩ next-entry flick) draw in black — a good
join shows a solid black band at every seam. Use --mono for plain ink.

Per-seam metrics (the scriptable "is the join right" signals):
  overlap   — area of ink shared by the two letters (G0 rule: must be > 0)
  seam      — number of ink components inside the join disc (1 = merged,
              2 = the letters don't actually touch at the anchor)

Usage:
  uv run python matlack/tools/compose_word.py or
  uv run python matlack/tools/compose_word.py oreo --px-per-unit 4 --rules
  uv run python matlack/tools/compose_word.py fe --mono -o /tmp/fe.png

Only letters with GLYPH_JOIN_ANCHORS (currently e, f, o, r) can be chained;
the tool errors with a clear message otherwise. Word-position variants are
requested automatically: first letter entry=none, last letter exit=none,
mid-word entry=high after high-exit letters (b f o v w) else low. Letters
without variant support silently render their default form.
"""

import argparse
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw
from shapely import affinity
from shapely.geometry import Point
from shapely.ops import unary_union

sys.path.insert(0, str(Path(__file__).resolve().parent))
from render_glyph import (
    BG, INK, RULE_COLOR, SCRATCH_DIR, fetch_render, ink_geometry, _polygons,
)

HIGH_EXIT = set("bfovw")
INK_ALT = (128, 38, 30)      # alternate letter color (dark red)
OVERLAP = (0, 0, 0)          # join overlap zones
JOIN_DISC_R = 10             # join-disc radius, ref units (letter size=100)
TARGET_XH = 60.0             # normalized x-height (su); build_font.py does the
                             # same rule-based per-glyph normalization


def stroke_direction(geom, at, radius=6.0):
    """Principal direction (degrees, mod 180) of a letter's ink near a
    point, via PCA of the local outline. None if no ink in the disc."""
    local = geom.intersection(Point(at).buffer(radius))
    if local.is_empty:
        return None
    pts = [p for poly in _polygons(local) for p in poly.exterior.coords]
    if len(pts) < 4:
        return None
    mx = sum(p[0] for p in pts) / len(pts)
    my = sum(p[1] for p in pts) / len(pts)
    sxx = sum((p[0] - mx) ** 2 for p in pts)
    syy = sum((p[1] - my) ** 2 for p in pts)
    sxy = sum((p[0] - mx) * (p[1] - my) for p in pts)
    return math.degrees(0.5 * math.atan2(2 * sxy, sxx - syy)) % 180.0


def kink_angle(a, b):
    """Smallest angle between two undirected stroke directions."""
    if a is None or b is None:
        return None
    d = abs(a - b) % 180.0
    return min(d, 180.0 - d)


def variant_for(i, word):
    """Entry/exit variant params for letter i of word, per the calt design."""
    entry = "none" if i == 0 else ("high" if word[i - 1] in HIGH_EXIT else "low")
    exit_ = "none" if i == len(word) - 1 else None  # None → letter default
    return entry, exit_


def fetch_letter(letter, entry, exit_):
    """Fetch with variant params, degrading gracefully when the letter
    doesn't support the combo. The entry side must survive degradation —
    it carries the incoming join's anchor — so drop the exit request
    first and only then fall back to the full default."""
    try:
        return fetch_render(letter, entry=entry, exit=exit_)
    except Exception:
        pass
    if exit_ is not None:
        try:
            r = fetch_render(letter, entry=entry)
            print(f"  note: {letter} exit={exit_} unsupported → letter-default exit",
                  file=sys.stderr)
            return r
        except Exception:
            pass
    print(f"  note: {letter} entry={entry} exit={exit_} unsupported → default form",
          file=sys.stderr)
    return fetch_render(letter)


def normalize_scale(render, geom):
    """Uniform-scale a letter's geometry/anchors/rules so its x-height is
    TARGET_XH. Letters render at different physical scales for the same
    `size` (each was traced from a different-resolution crop); build_font.py
    normalizes via rule lines, so the composer must too or the seam metrics
    lie. Letters without rules pass through unscaled.

    Returns (geom, scale). Note: render['rings'] stays unscaled — apply the
    returned scale when deriving geometry from rings later."""
    rules = render.get("rules")
    if not rules:
        return geom, 1.0
    s = TARGET_XH / (rules["yBottom"] - rules["yCenter"])
    if abs(s - 1.0) < 1e-9:
        return geom, 1.0
    geom = affinity.scale(geom, xfact=s, yfact=s, origin=(0, 0))
    render["rules"] = {k: v * s for k, v in rules.items()}
    if render.get("joinAnchors"):
        render["joinAnchors"] = {
            k: [p[0] * s, p[1] * s] for k, p in render["joinAnchors"].items()
        }
    return geom, s


def coarticulation_ratio(a, b, slack=2.5):
    """How well two ink geometries overlay where they approach each other.

    near_a = the part of `a` within `slack` of `b` (and vice versa); the
    ratio is shared ink over the smaller near-region. 1.0 → wherever the
    strokes come close, they actually ride on each other (full
    coarticulation — the handwriting-analysis term for adjacent letters
    sharing one stroke). Offset-parallel strokes score ~0; shallow
    crossings score low. Connector pairs sliced from one traced
    transition must score high (they reconstruct it)."""
    near_a = a.intersection(b.buffer(slack))
    near_b = b.intersection(a.buffer(slack))
    denom = min(near_a.area, near_b.area)
    if denom <= 0:
        return 0.0
    return a.intersection(b).area / denom


def compose(word):
    """Chain letters by join anchors.

    Returns (placed, seams): placed = [{letter, render, geom, dx, dy}, ...]
    with geom translated into a shared frame; seams = [{pair, at, overlap,
    components}, ...] one per adjacent pair.
    """
    placed = []
    seams = []
    dx = dy = 0.0
    prev_exit = None

    for i, letter in enumerate(word):
        entry, exit_ = variant_for(i, word)
        render = fetch_letter(letter, entry, exit_)
        geom, letter_scale = normalize_scale(render, ink_geometry(render))
        anchors = render.get("joinAnchors") or {}

        if i > 0:
            if "entry" not in anchors:
                raise SystemExit(
                    f"'{letter}' has no entry join anchor — can't chain. "
                    f"Letters with anchors: e, f, o, r (GLYPH_JOIN_ANCHORS)."
                )
            ex, ey = prev_exit
            dx, dy = ex - anchors["entry"][0], ey - anchors["entry"][1]

        geom = affinity.translate(geom, dx, dy)
        placed.append({"letter": letter, "render": render, "geom": geom,
                       "dx": dx, "dy": dy, "scale": letter_scale})

        if i > 0:
            join_pt = prev_exit
            disc = Point(join_pt).buffer(JOIN_DISC_R)
            a, b = placed[-2]["geom"], geom
            overlap = a.intersection(b).area
            local = unary_union([a.intersection(disc), b.intersection(disc)])
            n_components = len(_polygons(local))
            # Baseline drift: after anchor alignment, this letter's yBottom
            # rule vs the previous letter's. curs only aligns anchor points;
            # consistent anchor heights (relative to rules) keep this at 0.
            prev = placed[-2]
            drift = None
            if render.get("rules") and prev["render"].get("rules"):
                drift = (render["rules"]["yBottom"] + dy) - (
                    prev["render"]["rules"]["yBottom"] + prev["dy"])
            # Kink: angle between the two strokes' local directions at the
            # join. Low joins are collinear handoffs (both hairlines ride
            # the same climb → small kink required); high joins are
            # crossings (or/01: the exit tail ends where the next body
            # stroke begins), so direction legitimately breaks there.
            kink = kink_angle(stroke_direction(a, join_pt),
                              stroke_direction(b, join_pt))
            # Coarticulation: the two glyphs' connector strokes are
            # slices of ONE traced transition and must overlay
            # (reconstruct it), not merely cross or run offset.
            # Full-letter inks are fine here: the connectors are the only
            # places neighbors come close.
            coarticulation = coarticulation_ratio(a, b)
            seams.append({
                "pair": word[i - 1] + letter,
                "at": join_pt,
                "overlap": overlap,
                "components": n_components,
                "drift": drift,
                "kink": kink,
                "coarticulation": coarticulation,
                "join_class": entry,  # entry variant of the second letter
            })

        if i < len(word) - 1:
            if "exit" not in anchors:
                raise SystemExit(
                    f"'{letter}' has no exit join anchor — can't chain into "
                    f"'{word[i + 1]}'. Letters with anchors: e, f, o, r."
                )
            prev_exit = (anchors["exit"][0] + dx, anchors["exit"][1] + dy)

    return placed, seams


def rasterize_word(placed, seams, px_per_unit=3, rules=False, mono=False,
                   supersample=4, margin=15):
    """Raster the composed word; alternating letter colors, overlaps black."""
    union_all = unary_union([p["geom"] for p in placed])
    minx, miny, maxx, maxy = union_all.bounds
    minx, miny, maxx, maxy = minx - margin, miny - margin, maxx + margin, maxy + margin
    ppu = px_per_unit * supersample
    w, h = int((maxx - minx) * ppu), int((maxy - miny) * ppu)

    def tf(pt):
        return ((pt[0] - minx) * ppu, (pt[1] - miny) * ppu)

    img = Image.new("RGB", (w, h), BG)
    draw = ImageDraw.Draw(img)

    if rules:
        first = placed[0]["render"]
        for y in (first.get("rules") or {}).values():
            _, ypx = tf((0, y + placed[0]["dy"]))
            draw.line([(0, ypx), (w, ypx)], fill=RULE_COLOR, width=supersample)

    def paint(geom, color):
        for poly in _polygons(geom):
            draw.polygon([tf(p) for p in poly.exterior.coords], fill=color)
            for hole in poly.interiors:
                draw.polygon([tf(p) for p in hole.coords], fill=BG)

    for i, p in enumerate(placed):
        paint(p["geom"], INK if (mono or i % 2 == 0) else INK_ALT)
    if not mono:
        for i in range(1, len(placed)):
            paint(placed[i - 1]["geom"].intersection(placed[i]["geom"]), OVERLAP)

    return img.resize((w // supersample, h // supersample), Image.LANCZOS)


def main():
    ap = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    ap.add_argument("word", help="letters to chain (e.g. 'or')")
    ap.add_argument("--px-per-unit", type=float, default=3, help="raster scale (default 3)")
    ap.add_argument("--rules", action="store_true", help="draw first letter's rule lines")
    ap.add_argument("--mono", action="store_true", help="single ink color, no join coding")
    ap.add_argument("-o", "--out", help="output path (default matlack/renders/_scratch/)")
    args = ap.parse_args()

    placed, seams = compose(args.word)
    out = args.out or SCRATCH_DIR / f"word_{args.word}.png"
    SCRATCH_DIR.mkdir(parents=True, exist_ok=True)
    rasterize_word(placed, seams, args.px_per_unit, args.rules, args.mono).save(out)
    print(f"wrote {out}")
    for s in seams:
        drift_ok = s["drift"] is None or abs(s["drift"]) < 1.5
        kink_ok = (s["join_class"] != "low" or s["kink"] is None
                   or s["kink"] < 15.0)
        # Coarticulation gates the verdict only as a sanity floor:
        # near-zero means the connectors run offset-parallel without
        # touching. The strict trace-reconstruction threshold (0.6+)
        # applies only to seams whose two slices come from one shared
        # trace — enforced by pair-specific tests (e.g.
        # tests/matlack/context/or/), not here: independently-authored
        # connectors (r→e, sinback-approved) score ~0.25 while looking
        # perfect.
        coin_ok = s["coarticulation"] > 0.05
        verdict = ("OK" if s["overlap"] > 0 and s["components"] == 1
                   and drift_ok and kink_ok and coin_ok else "BAD")
        drift = f"{s['drift']:+.1f}" if s["drift"] is not None else "?"
        kink = f"{s['kink']:.0f}°" if s["kink"] is not None else "?"
        print(
            f"  seam {s['pair']}: overlap={s['overlap']:.1f} su² "
            f"components-in-disc={s['components']} baseline-drift={drift} su "
            f"kink={kink} coart={s['coarticulation']:.2f} "
            f"({s['join_class']}) [{verdict}]"
        )


if __name__ == "__main__":
    main()
