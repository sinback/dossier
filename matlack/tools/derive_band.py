#!/usr/bin/env python3
"""
derive_band.py — emit band-true connector segments for a glyph.

The band-true slice rule (see O_EXIT_SEGS in matlackGlyphs.js): the in-band
portion of every connector is a rule-consistent-scale copy of the canonical
band trace, pinned at the human-picked scan anchor. This tool does the
transform arithmetic and prints paste-ready JS seg arrays + the glyph-local
anchor + arc-length fractions for fadeStart, so new letters' connectors can
be derived in seconds instead of by hand.

Canonical bands (pinned per sinback, 2026-07-06):
  high — or/01 path2 ('o Exit → r Entry'), scan anchor (46.22, 30.11),
         scan x-height 25.81 (from the rule-consistent r-slice fit)
  low  — to/01 transition ('t Exit → o Entry'), scan anchor (41.25, 71.64),
         scan rules yCenter≈48 yBottom≈76 → x-height 28

Transform: uniform scale s = glyph_xh / scan_xh, no rotation. The glyph
anchor's y is FORCED by rule consistency (same height fraction above the
glyph's baseline as the scan anchor above the scan baseline); its x is the
glyph's spacing choice.

Usage:
  uv run python matlack/tools/derive_band.py high --xh 41 --ybottom 137 --anchor-x 99.2
  uv run python matlack/tools/derive_band.py low  --xh 56 --ybottom 94  --anchor-x 74
  # optional: --span a,b to slice a sub-range of the trace's arc length [0,1]
"""

import argparse
import math

BANDS = {
    "high": {
        "segs": [
            [[37.73, 24.30], [37.19, 24.48], [38.04, 32.53], [39.72, 31.97]],
            [[39.72, 31.97], [39.55, 32.41], [48.29, 29.88], [48.59, 29.09]],
            [[48.59, 29.09], [49.74, 29.88], [55.60, 23.51], [54.97, 23.07]],
        ],
        "anchor": (46.22, 30.11),
        "xh": 25.81,
        # baseline derived from r's rule-consistent slice transform:
        # (94 - (38.69 - 2.17*23.07)) / 2.17
        "ybottom": 48.56,
        "source": "or/01 path2 ('o Exit → r Entry')",
    },
    "low": {
        # to/01 path3 ('t Exit Flick → o Entry'), verbatim from 01_paths.
        "segs": [
            [[25.86, 75.95], [25.59, 76.19], [32.97, 76.01], [33.66, 75.39]],
            [[33.66, 75.39], [36.06, 76.97], [60.13, 55.20], [60.03, 55.13]],
        ],
        "anchor": (41.25, 71.64),
        "xh": 28.0,
        "ybottom": 76.0,  # to/01_notes.md rule lines
        "source": "to/01 path3 ('t Exit Flick → o Entry')",
    },
}


def bez(p0, p1, p2, p3, t):
    u = 1 - t
    return (
        u**3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t**3 * p3[0],
        u**3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t**3 * p3[1],
    )


def split_bezier(seg, t):
    """de Casteljau: split a cubic at t → (head, tail), both cubics."""
    (p0, p1, p2, p3) = seg
    lerp = lambda a, b, u: (a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u)
    a = lerp(p0, p1, t); b = lerp(p1, p2, t); c = lerp(p2, p3, t)
    d = lerp(a, b, t); e = lerp(b, c, t)
    f = lerp(d, e, t)
    return [p0, a, d, f], [f, e, c, p3]


def cut_chain(segs, arc_from, arc_to):
    """Slice a bezier chain by arc-length positions [arc_from, arc_to]."""
    out = []
    acc = 0.0
    for seg in segs:
        L = seg_len(seg)
        s0, s1 = acc, acc + L
        acc = s1
        if s1 <= arc_from or s0 >= arc_to:
            continue
        piece = seg
        # trim head (approximate arc→t linearly within the segment)
        if s0 < arc_from:
            piece = split_bezier(piece, (arc_from - s0) / L)[1]
            s0 = arc_from
        if s1 > arc_to:
            piece = split_bezier(piece, (arc_to - s0) / (s1 - s0))[0]
        out.append(piece)
    return out


def seg_len(seg, n=300):
    pts = [bez(*seg, i / n) for i in range(n + 1)]
    return sum(math.dist(pts[i], pts[i + 1]) for i in range(n))


def main():
    ap = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    ap.add_argument("band", choices=BANDS)
    ap.add_argument("--xh", type=float, required=True, help="glyph x-height (local su)")
    ap.add_argument("--ybottom", type=float, required=True, help="glyph rule.yBottom (local su)")
    ap.add_argument("--anchor-x", type=float, required=True,
                    help="glyph-local anchor x (spacing choice)")
    ap.add_argument("--skip-head", type=float, default=0.0,
                    help="drop this many LOCAL su of arc from the trace start")
    ap.add_argument("--fade-len", type=float, default=None,
                    help="trim the trace this many LOCAL su past the anchor "
                         "(the connector's fade tail)")
    args = ap.parse_args()

    band = BANDS[args.band]
    s = args.xh / band["xh"]
    ax_scan, ay_scan = band["anchor"]
    # rule-forced anchor y: same height fraction above the glyph baseline
    ay = args.ybottom - (band["ybottom"] - ay_scan) * s
    tx = args.anchor_x - s * ax_scan
    ty = ay - s * ay_scan
    T = lambda p: (round(s * p[0] + tx, 2), round(s * p[1] + ty, 2))

    print(f"// Band-true slice of {band['source']}")
    print(f"// scale {s:.4f} (xh {args.xh}/{band['xh']}), scan anchor "
          f"({ax_scan}, {ay_scan}) → local ({args.anchor_x}, {round(ay, 2)})")
    height_pct = (args.ybottom - ay) / args.xh * 100
    print(f"// anchor height: {height_pct:.1f}% of x-height above baseline")

    local_segs = [[T(p) for p in seg] for seg in band["segs"]]

    # anchor arc position along the full local trace
    acc = 0.0
    anchor_arc = None
    best = (float("inf"), 0)
    for seg in local_segs:
        b = min(
            (math.dist(bez(*seg, i / 400), (args.anchor_x, ay)), i / 400)
            for i in range(401)
        )
        # sinback's anchors can sit slightly OFF the curve (to/01's is ~0.5
        # scan-su below it) — use a loose gate and report the distance.
        if b[0] < 2.5:
            best = b
            sub = [bez(*seg, i / 300 * b[1]) for i in range(301)]
            anchor_arc = acc + sum(math.dist(sub[i], sub[i + 1]) for i in range(300))
            break
        acc += seg_len(seg)

    total_full = sum(seg_len(s) for s in local_segs)
    arc_to = total_full
    if args.fade_len is not None:
        if anchor_arc is None:
            raise SystemExit("--fade-len needs the anchor on the curve (check anchor-x)")
        arc_to = min(total_full, anchor_arc + args.fade_len)
    emitted = cut_chain(local_segs, args.skip_head, arc_to)

    rnd = lambda v: round(v, 2)
    print("[")
    for seg in emitted:
        pts = ", ".join(f"[{rnd(x)}, {rnd(y)}]" for x, y in seg)
        print(f"  [{pts}],")
    print("]")
    lens = [seg_len(s) for s in emitted]
    total = sum(lens)
    print(f"// emitted seg lengths: {[round(v, 1) for v in lens]}  total {total:.1f}")
    if anchor_arc is not None:
        a = anchor_arc - args.skip_head
        print(f"// anchor at {a:.1f} su along the emitted curve "
              f"(fraction {a / total:.3f}; distance to curve {best[0]:.2f} su)")
        print(f"// with a bridge of length B before it: fadeStart = "
              f"(B + {a:.1f}) / (B + {total:.1f})")
    else:
        print("// anchor is >2.5 su from the emitted curve (check anchor-x)")


if __name__ == "__main__":
    main()
