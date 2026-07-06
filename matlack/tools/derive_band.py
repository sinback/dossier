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
    ap.add_argument("--span", default=None,
                    help="a,b arc-length sub-range of the trace to emit (default full)")
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

    segs = band["segs"]
    if args.span:
        lo, hi = (float(v) for v in args.span.split(","))
        print(f"// NOTE: --span slicing not implemented for sub-segment cuts; "
              f"emit full and trim segments manually (requested {lo},{hi})")

    lens = [seg_len([T(p) for p in seg]) for seg in segs]
    total = sum(lens)
    print("[")
    for seg in segs:
        pts = ", ".join(f"[{x}, {y}]" for x, y in (T(p) for p in seg))
        print(f"  [{pts}],")
    print("]")
    # arc fraction of the anchor along the emitted curve
    acc = 0.0
    frac = None
    for seg, L in zip(segs, lens):
        tseg = [T(p) for p in seg]
        best = min(
            (math.dist(bez(*tseg, i / 400), (args.anchor_x, ay)), i / 400)
            for i in range(401)
        )
        # sinback's anchors can sit slightly OFF the curve (to/01's is ~0.5
        # scan-su below it) — use a loose gate and report the distance.
        if best[0] < 2.5:
            sub = [bez(*tseg, i / 300 * best[1]) for i in range(301)]
            partial = sum(math.dist(sub[i], sub[i + 1]) for i in range(300))
            frac = (acc + partial) / total
            break
        acc += L
    print(f"// seg lengths: {[round(v, 1) for v in lens]}  total {total:.1f}")
    if frac is not None:
        print(f"// anchor at arc-length fraction {frac:.3f} of the emitted curve "
              f"(distance to curve {best[0]:.2f} su)")
    else:
        print("// anchor is >2.5 su from the emitted curve (check anchor-x)")


if __name__ == "__main__":
    main()
