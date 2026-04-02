#!/usr/bin/env python3
"""
fit_paths.py — Fit ellipses and egg curves to hand-traced SVG paths.

Reads a GIMP-exported SVG path file, samples the bezier curves, fits
ellipses (via image moments) and optionally egg curves (via scipy),
and prints a comparison table with residuals.

Usage:
  python3 fit_paths.py <svg_path_file>
  python3 fit_paths.py <svg_path_file> --egg    # also fit egg curves

Examples:
  python3 fit_paths.py matlack-declaration/reference/lowercase/b_4x/01_paths
  python3 fit_paths.py matlack-declaration/reference/context/for_4x/01_paths --egg

The script auto-detects path names from <title> elements in the SVG.
Paths with "Inner" in the name get both ellipse and egg fits.
Paths with "Outer" get ellipse only (outers are generally good ellipses).
All other paths get ellipse fit only.

Output includes:
  - Ellipse params: cx, cy, semi-major a, semi-minor b, tilt, aspect ratio
  - Residuals: avg and max deviation from the fitted curve
  - Grade: GOOD (<0.1), FAIR (0.1-0.15), POOR (>0.15)
  - For egg fits: the k parameter and improvement over ellipse
  - Cross-path relationships: center offset, size ratio, tilt difference
"""

import math
import re
import sys
import xml.etree.ElementTree as ET


# ── Bezier sampling ───────────────────────────────────────────────────────────

def sample_svg_path(d, n=25):
    """Sample points along an SVG cubic bezier path string."""
    raw = re.findall(r'[-+]?\d*\.?\d+', d)
    vals = [float(v) for v in raw]
    pts = []
    if len(vals) < 2:
        return pts
    prev = (vals[0], vals[1])
    i = 2
    while i + 5 < len(vals):
        cp1 = (vals[i], vals[i+1])
        cp2 = (vals[i+2], vals[i+3])
        end = (vals[i+4], vals[i+5])
        for j in range(n + 1):
            t = j / n; u = 1 - t
            x = u**3*prev[0] + 3*u**2*t*cp1[0] + 3*u*t**2*cp2[0] + t**3*end[0]
            y = u**3*prev[1] + 3*u**2*t*cp1[1] + 3*u*t**2*cp2[1] + t**3*end[1]
            pts.append((x, y))
        prev = end
        i += 6
    return pts


# ── Ellipse fitting (image moments) ──────────────────────────────────────────

def fit_ellipse(points):
    """Fit an ellipse via second-order image moments with √2 boundary correction.
    Returns (cx, cy, a, b, tilt_degrees)."""
    n = len(points)
    cx = sum(p[0] for p in points) / n
    cy = sum(p[1] for p in points) / n
    mu20 = sum((p[0] - cx)**2 for p in points) / n
    mu02 = sum((p[1] - cy)**2 for p in points) / n
    mu11 = sum((p[0] - cx) * (p[1] - cy) for p in points) / n
    theta = 0.5 * math.atan2(2 * mu11, mu20 - mu02)
    disc = math.sqrt(4 * mu11**2 + (mu20 - mu02)**2)
    a = math.sqrt(max(0.5 * (mu20 + mu02 + disc), 0) * 2)
    b = math.sqrt(max(0.5 * (mu20 + mu02 - disc), 0) * 2)
    tilt = math.degrees(theta)
    while tilt > 90: tilt -= 180
    while tilt < -90: tilt += 180
    return cx, cy, a, b, tilt


def ellipse_residuals(points, cx, cy, a, b, tilt):
    """Compute per-point normalized distance from the best-fit ellipse.
    Returns (avg_residual, max_residual). A perfect fit = 0."""
    tilt_r = math.radians(tilt)
    res = []
    for px, py in points:
        dx, dy = px - cx, py - cy
        lx = dx * math.cos(-tilt_r) - dy * math.sin(-tilt_r)
        ly = dx * math.sin(-tilt_r) + dy * math.cos(-tilt_r)
        if a > 0 and b > 0:
            r = math.sqrt((lx / a)**2 + (ly / b)**2)
            res.append(abs(r - 1.0))
    return (sum(res) / len(res), max(res)) if res else (0, 0)


# ── Egg curve fitting (requires scipy) ────────────────────────────────────────

def fit_egg(points):
    """Fit an egg curve: x = a*cos(t), y = b*sin(t)*(1 + k*cos(t)).
    The k parameter controls asymmetry (k=0 → regular ellipse).
    Returns (cx, cy, a, b, tilt, k, avg_residual, max_residual)."""
    try:
        from scipy.optimize import minimize
    except ImportError:
        print("  [scipy not installed — skipping egg fit]")
        return None

    ecx, ecy, ea, eb, etilt = fit_ellipse(points)

    def egg_pts(params, n=200):
        cx, cy, a, b, tilt_deg, k = params
        tilt_r = math.radians(tilt_deg)
        ct, st = math.cos(tilt_r), math.sin(tilt_r)
        out = []
        for i in range(n):
            t = (i / n) * 2 * math.pi
            lx = a * math.cos(t)
            ly = b * math.sin(t) * (1 + k * math.cos(t))
            out.append((lx * ct - ly * st + cx, lx * st + ly * ct + cy))
        return out

    def cost(params):
        epts = egg_pts(params)
        total = 0
        for px, py in points:
            best = min((px - ex)**2 + (py - ey)**2 for ex, ey in epts)
            total += best
        return total / len(points)

    result = minimize(cost, [ecx, ecy, ea, eb, etilt, 0.0],
                      method='Nelder-Mead', options={'maxiter': 8000})
    cx, cy, a, b, tilt, k = result.x
    while tilt > 90: tilt -= 180
    while tilt < -90: tilt += 180

    epts = egg_pts(result.x)
    avg_r = (abs(a) + abs(b)) / 2
    rlist = []
    for px, py in points:
        d = min(math.sqrt((px - ex)**2 + (py - ey)**2) for ex, ey in epts)
        rlist.append(d / avg_r)

    return cx, cy, abs(a), abs(b), tilt, k, sum(rlist) / len(rlist), max(rlist)


# ── Grade helper ──────────────────────────────────────────────────────────────

def grade(avg_res, thresholds=None):
    if thresholds is None:
        thresholds = [(0.1, 'GOOD'), (0.15, 'FAIR')]
    for thresh, label in thresholds:
        if avg_res < thresh:
            return label
    return 'POOR'


# ── SVG parsing ───────────────────────────────────────────────────────────────

def parse_svg_paths(filepath):
    """Parse an SVG file and extract named paths.
    Returns list of (name, d_attribute) tuples."""
    tree = ET.parse(filepath)
    root = tree.getroot()
    ns = {'svg': 'http://www.w3.org/2000/svg'}

    paths = []
    for path_el in root.findall('.//svg:path', ns):
        d = path_el.get('d', '')
        title_el = path_el.find('svg:title', ns)
        name = title_el.text if title_el is not None else path_el.get('id', 'unnamed')
        paths.append((name, d))
    return paths


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <svg_path_file> [--egg]")
        sys.exit(1)

    filepath = sys.argv[1]
    do_egg = '--egg' in sys.argv

    paths = parse_svg_paths(filepath)
    print(f"\n═══ {filepath} ═══")
    print(f"Found {len(paths)} path(s)\n")

    results = {}

    for name, d in paths:
        pts = sample_svg_path(d)
        if len(pts) < 6:
            print(f"  {name}: too few points ({len(pts)}), skipping\n")
            continue

        # Ellipse fit
        ecx, ecy, ea, eb, etilt = fit_ellipse(pts)
        eavg, emax = ellipse_residuals(pts, ecx, ecy, ea, eb, etilt)
        eg = grade(eavg)

        print(f"  {name} ({len(pts)} pts):")
        print(f"    Ellipse: cx=({ecx:.1f}, {ecy:.1f}) a={ea:.1f} b={eb:.1f} tilt={etilt:.1f}°")
        print(f"             aspect={eb/ea:.2f}  residual={eavg:.3f} max={emax:.3f} [{eg}]")

        result = {'type': 'ellipse', 'cx': ecx, 'cy': ecy, 'a': ea, 'b': eb,
                  'tilt': etilt, 'residual': eavg}

        # Egg fit for "Inner" paths or if --egg flag
        is_inner = 'inner' in name.lower()
        if do_egg or (is_inner and eavg > 0.1):
            egg = fit_egg(pts)
            if egg:
                gcx, gcy, ga, gb, gtilt, gk, gavg, gmax = egg
                gg = grade(gavg, [(0.05, 'GOOD'), (0.1, 'FAIR')])
                improvement = (1 - gavg / eavg) * 100 if eavg > 0 else 0
                print(f"    Egg:     cx=({gcx:.1f}, {gcy:.1f}) a={ga:.1f} b={gb:.1f} tilt={gtilt:.1f}° k={gk:+.3f}")
                print(f"             residual={gavg:.3f} max={gmax:.3f} [{gg}] ({improvement:.0f}% better)")
                result = {'type': 'egg', 'cx': gcx, 'cy': gcy, 'a': ga, 'b': gb,
                          'tilt': gtilt, 'k': gk, 'residual': gavg}

        results[name] = result
        print()

    # Cross-path relationships
    inners = {n: r for n, r in results.items() if 'inner' in n.lower()}
    outers = {n: r for n, r in results.items() if 'outer' in n.lower()}

    if inners and outers:
        print("═══ RELATIONSHIPS ═══\n")
        for iname, ir in inners.items():
            for oname, orr in outers.items():
                # Match by prefix (e.g., "b Inner" ↔ "b Outer")
                ipfx = iname.lower().replace('inner', '').replace('bar-bowl', '').strip()
                opfx = oname.lower().replace('outer', '').replace('bar-bowl', '').strip()
                if ipfx == opfx or (not ipfx and not opfx):
                    print(f"  {oname} vs {iname}:")
                    print(f"    Center offset: ({orr['cx']-ir['cx']:+.1f}, {orr['cy']-ir['cy']:+.1f})")
                    if ir['a'] > 0 and ir['b'] > 0:
                        print(f"    Size ratio: a={orr['a']/ir['a']:.2f}×  b={orr['b']/ir['b']:.2f}×")
                    print(f"    Tilt diff: {orr['tilt']-ir['tilt']:+.1f}°")
                    print()


if __name__ == '__main__':
    main()
