/**
 * glyphs/f.js — Matlack lowercase 'f' (bar-bowl + fat bar + entry flick + exit).
 * Per-letter descriptor module; see glyphs/t.js for the pattern.
 * Exports fBarBowlWidth/fBarBowlDensity — reused by h, k, z.
 */
import {
  resolveOffset, buildTaperedRibbon, buildConnectorRibbon, smoothStep, scaleEllipse, sampleSegments, sampleEllipse, resolveRefOffset, BOWL_PHASE,
} from './helpers.js';

// Reference anchor: bar-bowl → fat-bar transition (gestalt midpoint).
// Matches path5 start (fat-bar top) and path6 end (where bar-bowl descends
// into the stem).
const F_REF_CENTER = { x: 70, y: 108 };

// ── 'f' bar-bowl ellipses ────────────────────────────────────────────────────
// Fitted by matlack/tools/fit_paths.py on 01_better_bar_bowl
// (path7 "f Bar-Bowl Outer", path8 "f Bar-Bowl Inner"):
//   outer: residual 0.088 [GOOD]
//   inner: residual 0.139 [FAIR] as ellipse;
//          egg-curve fit would drop to 0.035 [GOOD, 75% better, k=+0.576]
// — so Matlack's inner boundary is asymmetric (one end of the loop is
// wider than the other). Sticking with ellipse for now since the renderer
// doesn't have an egg-curve primitive yet; flagged as a future upgrade.
const F_BAR_BOWL = {
  inner: {
    cx: 112.4,
    cy:  58.2,
    a:   37.7,
    b:    4.7,
    tilt: -51.0,
  },
  outer: {
    cx: 116.2,
    cy:  50.8,
    a:   51.6,   // inner→outer ratio: 1.37×
    b:    9.7,   // inner→outer ratio: 2.07×
    tilt: -51.1,
  },
};

// Bar-bowl width function: gentle taper at tips, full thickness in middle.
// Same shape as the prior 'f'.
function fBarBowlWidth(arcFracRaw) {
  const f = (arcFracRaw + BOWL_PHASE) % 1.0;
  if (f < 0.10) return smoothStep(0.35, 0.65, f / 0.10);
  if (f < 0.40) return smoothStep(0.65, 1.0, (f - 0.10) / 0.30);
  if (f < 0.60) return 1.0;
  if (f < 0.90) return smoothStep(1.0, 0.65, (f - 0.60) / 0.30);
  return smoothStep(0.65, 0.35, (f - 0.90) / 0.10);
}

function fBarBowlDensity() { return 0.85; }

// ── 'f' fat-bar (descender) ──────────────────────────────────────────────────
// Direct ink-outline fill using path5 of 01_better_downstroke — 13 cubic
// segments forming a closed shape. Preserves Matlack's subtle asymmetry
// (slight curvature changes along each edge) and, crucially, the FLAT
// bottom cut parallel to rule.y-below at ≈y=212 (sign of good penmanship
// in Copperplate). No extrusion or width param — the polygon IS the ink.
const F_FAT_BAR_SEGS = [
  [[71.77,  96.22], [71.77,  96.22], [65.98,  93.58], [65.98,  93.58]],
  [[65.98,  93.58], [65.83,  93.46], [60.44, 100.55], [62.07, 101.88]],
  [[62.07, 101.88], [61.30, 101.75], [60.31, 115.23], [61.65, 115.61]],
  [[61.65, 115.61], [63.10, 118.64], [37.74, 157.18], [37.33, 156.41]],
  [[37.33, 156.41], [34.18, 154.60], [11.12, 193.81], [ 8.15, 199.58]],
  [[ 8.15, 199.58], [ 7.56, 199.44], [ 5.77, 211.60], [ 7.48, 211.86]],
  [[ 7.48, 211.86], [ 8.41, 216.30], [23.60, 213.28], [23.54, 212.29]],
  [[23.54, 212.29], [23.11, 212.47], [39.22, 184.79], [44.54, 182.44]],
  [[44.54, 182.44], [42.95, 182.60], [44.28, 170.96], [44.75, 170.88]],
  [[44.75, 170.88], [44.70, 170.91], [71.43, 111.58], [76.04, 109.38]],
  [[76.04, 109.38], [75.71, 109.43], [76.60,  99.26], [76.75,  99.23]],
  [[76.75,  99.23], [77.93,  98.75], [77.38,  95.98], [76.99,  96.14]],
  [[76.99,  96.14], [76.66,  95.11], [71.64,  95.83], [71.77,  96.22]],
];

// ── 'f' entry flick ──────────────────────────────────────────────────────────
// From path9 "f Entry" in 01_better_bar_bowl — single cubic from low-left
// (44.60, 116.03) up to the bar-bowl's outer start (81.68, 92.38).
const F_ENTRY_FLICK_SEGS = [
  [[44.60, 116.03], [45.14, 116.67], [82.88, 94.24], [81.68, 92.38]],
];

const F_ENTRY_FLICK = {
  startWidth: 1.2,   // very thin at entry tip
  taperPower: 0.6,   // ease toward thicker end
  liftPoint: 1.0,
};

// ── 'f' exit connector ───────────────────────────────────────────────────────
// Band-true slice of or/01 path2 (the canonical HIGH band; derive_band.py
// high --xh 41 --ybottom 137 --anchor-x 99.2 --skip-head 13.5 --fade-len 5),
// bridged from f's stem. The old segs were the traced for/01 path4 ("f Exit
// → o Entry") verbatim — pair-specific geometry that couldn't coarticulate
// with band-true entrances; its departure handle survives in the bridge.
const F_EXIT_SEGS = [
  // Bridge (authored): stem → band start, keeping path4's departure tangent.
  [[ 70.13, 104.10], [ 70.34, 108.89], [ 82.50, 111.50], [ 88.87, 110.66]],
  // Band-true slice; anchor (99.2, 107.69) at 71.5% x-height.
  [[ 88.87, 110.66], [ 88.67, 111.33], [102.49, 107.33], [102.96, 106.07]],
  [[102.96, 106.07], [103.07, 106.14], [103.20, 106.18], [103.36, 106.18]],
];

// Connector: hairline through the band, fade over the ~4.6 su past-anchor
// tail (anchor at arc fraction (21.2 + 10.8) / (21.2 + 15.4)).
// Hairline is in glyph-local su, and f's frame is small (xh 41 vs the 60
// normalization target) — the physical pen width is constant, so the local
// value is scaled down accordingly (0.65 × 41/60).
const F_EXIT = { hairline: 0.45, fadeStart: 0.874 };

// ── 'f' rule lines ───────────────────────────────────────────────────────────
// In for/01 frame. Tilted rule.y-center is Matlack's own irregularity; we
// compromise (option 3): yCenter midway between f's gestalt (y=108) and
// where o/r's tops sit on the tilted rule line (y≈83). This keeps f's
// xHeight zone comparable to other letters without the comical scale
// blow-up we'd get from strictly anchoring gestalt to rule.y-center.
//
// yBottom from rule.y-bottom (path2) extrapolated to x=70: ≈ 136.
// yTop from f's actual peak (y=21 in path6).
const F_RULE = { yTop: 21, yCenter: 96, yBottom: 137 };

// Structural anchor: gestalt midpoint (same as REF_CENTER for this glyph).
const F_STRUCTURAL_ANCHORS = {
  gestalt: { x: 70, y: 108 },
};

// Join anchors. exit = the canonical high-band scan anchor (46.22, 30.11)
// mapped through the F_EXIT_SEGS slice transform — same point every
// band-true high connector pins, so f→r / f→o coarticulate by construction.
const F_JOIN_ANCHORS = {
  // entry: path6 start (before entry flick). Sits at 51% x-height — off the
  // 15.6% low-join convention; fine while f is only used word-initially
  // (no curs predecessor). TODO before mid-word f: extend the entry flick
  // to the low band and move this onto it.
  entry: { x: 44.60, y: 116.03 },
  exit:  { x: 99.2,  y: 107.69 },
};

/**
 * Render a Matlack-style lowercase 'f', rebuilt from for/01_paths.
 * Components:
 *   - barBowl (ellipse, ascender loop)
 *   - fatBar (filled polygon sampled from path5)
 *   - entryFlick (tapered ribbon, path6 segment 1)
 *   - exit (tapered ribbon, path4, the crossbar → o-handoff stroke)
 */
function build(cx, cy, scale, dpr, overrides) {
  // ── Bar-bowl (nudge default locked in via grid-search round 2) ──
  const bbOff = resolveOffset('barBowl', { dx: -8, dy: 8 }, overrides, dpr);
  const inner = scaleEllipse(F_BAR_BOWL.inner, cx + bbOff.dx, cy + bbOff.dy, scale, F_REF_CENTER);
  const outer = scaleEllipse(F_BAR_BOWL.outer, cx + bbOff.dx, cy + bbOff.dy, scale, F_REF_CENTER);

  // ── Fat-bar: sample the closed ink outline into a fill polygon ─
  const fbOff = resolveOffset('fatBar', { dx: 0, dy: 0 }, overrides, dpr);
  const fatBarPoly = sampleSegments(
    F_FAT_BAR_SEGS,
    F_FAT_BAR_SEGS.map((_, i) => i),
    10,
    cx + fbOff.dx, cy + fbOff.dy, scale, F_REF_CENTER,
  );

  // ── Entry flick: tapered ribbon from path6 seg 1 ──────────────
  const efOff = resolveOffset('entryFlick', { dx: 0, dy: 0 }, overrides, dpr);
  const efParams = overrides.entryFlick ?? F_ENTRY_FLICK;
  const efCenter = sampleSegments(
    F_ENTRY_FLICK_SEGS, [0], 14,
    cx + efOff.dx, cy + efOff.dy, scale, F_REF_CENTER,
  );
  const entryFlick = buildTaperedRibbon(
    efCenter,
    (efParams.startWidth ?? F_ENTRY_FLICK.startWidth) * scale,
    efParams.taperPower ?? F_ENTRY_FLICK.taperPower,
    efParams.liftPoint  ?? F_ENTRY_FLICK.liftPoint,
  );

  // ── Exit connector: band-true hairline (see F_EXIT_SEGS) ──────
  const exOff = resolveOffset('exit', { dx: 0, dy: 0 }, overrides, dpr);
  const exParams = overrides.exit ?? F_EXIT;
  const exCenter = sampleSegments(
    F_EXIT_SEGS, [0, 1, 2], 14,
    cx + exOff.dx, cy + exOff.dy, scale, F_REF_CENTER,
  );
  const exit = buildConnectorRibbon(
    exCenter,
    (exParams.hairline ?? F_EXIT.hairline) * scale,
    exParams.fadeStart ?? F_EXIT.fadeStart,
  );

  return {
    bowls: [
      {
        outer: outer,
        inner: inner,
        widthFn: fBarBowlWidth,
        densityFn: fBarBowlDensity,
      },
    ],
    fills: [
      { points: fatBarPoly, pressure: 0.85, label: 'body' },
      ...entryFlick.map(p => ({ points: p, pressure: 0.75, label: 'entrance' })),
      ...exit.map(p => ({ points: p, pressure: 0.75, label: 'exit' })),
    ],
  };
}

// Connector chain feeding f's exit anchor (mirrors buildF's exit seg pick).
function joinSegs(v) {
  // f has no mid-word entry (word-initial only — see F_JOIN_ANCHORS);
  // exit is the band-true connector.
  return {
    entry: null,
    exit:  F_EXIT_SEGS,
  };
}

function exportOutlines(overrides) {
  const bbOff = resolveRefOffset('barBowl', { dx: 0, dy: 0 }, overrides);
  const fbOff = resolveRefOffset('fatBar',  { dx: 0, dy: 0 }, overrides);

  // Shift an ellipse's center without touching a/b/tilt (ref-space offset).
  const shift = (e, dx, dy) => ({ ...e, cx: e.cx + dx, cy: e.cy + dy });

  // Sample cubic bezier segments into a flat array of [x,y] points in ref space.
  const sampleSegsRef = (segs, perSeg = 12) => {
    const pts = [];
    for (let s = 0; s < segs.length; s++) {
      const [p0, p1, p2, p3] = segs[s];
      const start = s === 0 ? 0 : 1;   // dedupe shared endpoints
      for (let i = start; i <= perSeg; i++) {
        const t = i / perSeg, u = 1 - t;
        const x = u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0];
        const y = u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1];
        pts.push([x + fbOff.dx, y + fbOff.dy]);
      }
    }
    return pts;
  };

  return {
    barBowl: {
      inner: sampleEllipse(shift(F_BAR_BOWL.inner, bbOff.dx, bbOff.dy)),
      outer: sampleEllipse(shift(F_BAR_BOWL.outer, bbOff.dx, bbOff.dy)),
    },
    fatBar: sampleSegsRef(F_FAT_BAR_SEGS, 12),
    // entryFlick + exit are tapered ribbons (not simple outlines); skip for now.
  };
}

// Bar-bowl width/density are shared by h, k, z (see their modules).
export { fBarBowlWidth, fBarBowlDensity };

export default {
  letter: 'f',
  build,
  joinSegs,
  exportOutlines,
  rule: F_RULE,
  refCenter: F_REF_CENTER,
  joinAnchors: F_JOIN_ANCHORS,
  structuralAnchors: F_STRUCTURAL_ANCHORS,
  outerEllipse: { outer: F_BAR_BOWL.outer, refCenter: F_REF_CENTER },
};
