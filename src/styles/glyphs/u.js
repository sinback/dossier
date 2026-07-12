/**
 * glyphs/u.js — Matlack lowercase 'u'.
 * Per-letter descriptor module; see glyphs/t.js for the pattern.
 */
import {
  buildRibbon, buildTaperedRibbon, buildConnectorRibbon, smoothStep, sampleSegments, resolveVariantPure,
} from './helpers.js';

const U_REF_CENTER = { x: 64, y: 24 };  // entrance flick end / first descent top

// Entrance flick
const U_ENTRANCE_SEGS = [
  [[10.16,65.05],[15.42,69.71],[65.46,25.33],[64.15,24.16]],
];

const U_ENTRANCE = { startWidth: 1.0, taperPower: 1.7, liftPoint: 1.0 };

// Combined stroke: initial downstroke → intermediate flick → second downstroke
const U_STROKE_SEGS = [
  // Initial downstroke
  [[63.35,23.23],[63.35,23.23],[24.78,66.96],[30.41,70.91]],
  [[30.41,70.91],[28.71,72.10],[34.43,77.46],[35.55,76.63]],
  [[35.55,76.63],[35.55,77.15],[44.31,74.89],[44.58,73.59]],
  // Intermediate flick (rise back up)
  [[44.21,74.38],[44.21,74.38],[104.33,25.26],[104.33,25.26]],
  // Second downstroke
  [[105.79,25.21],[105.59,24.91],[76.34,57.82],[78.11,60.49]],
  [[78.11,60.49],[74.01,62.59],[78.48,74.18],[80.68,72.92]],
  [[80.68,72.92],[80.59,73.87],[86.92,71.87],[87.06,70.01]],
];

// Width: single descent/rise cycle like 'n'
function uStrokeWidth(t, scale) {
  // First descent: fat
  if (t < 0.08) return smoothStep(3.0, 5.0, t / 0.08) * scale;
  if (t < 0.20) return 5.0 * scale;

  // Turnaround: thin
  if (t < 0.30) return smoothStep(5.0, 1.5, (t - 0.20) / 0.10) * scale;

  // Rise / intermediate flick: thickening
  if (t < 0.50) return smoothStep(1.5, 4.0, (t - 0.30) / 0.20) * scale;

  // Second descent: fat
  if (t < 0.70) return smoothStep(4.0, 5.0, (t - 0.50) / 0.20) * scale;

  // Bottom loop: thinning
  if (t < 0.85) return smoothStep(5.0, 2.5, (t - 0.70) / 0.15) * scale;

  // Exit: thin
  return smoothStep(2.5, 1.0, (t - 0.85) / 0.15) * scale;
}

// Exit flick — the traced word-edge form: leaves the second valley and
// rises at ~−43° to a 70% x-height tip (the band crawls the baseline
// instead, 15.6% anchor) — so exit:'low' replaces it with the band-true
// connector below and this stays for exit:'none' fina/isol (table: u
// exit rule.y-bottom? — no word-final data, keep what the trace has).
const U_EXIT_SEGS = [
  [[87.30,70.33],[87.30,70.33],[120.07,39.38],[120.07,39.38]],
];

const U_EXIT = { startWidth: 2.0, taperPower: 1.7, liftPoint: 0.85 };

// Rule lines — trace-derived (no visible paper rules in the u/01 crop,
// like m): yBottom 74.4 = where the intermediate flick departs the first
// foot (the functional writing line); valley1's hook then dips 2.3 su
// below it (4.6% xh — within the 0–5% foot-hook convention) and valley2
// bottoms 1.2 su above. yCenter 24.5 from the stroke tops (23.2–25.3).
// yTop nominal one-xh-above (m convention; u has no ascender). xh 49.9.
const U_RULE = { yTop: -25.4, yCenter: 24.5, yBottom: 74.4 };

// Mid-word low entrance — band-true slice of to/01 path3 (derive_band.py
// low --xh 49.9 --ybottom 74.4 --anchor-x 16.7 --skip-head 12.1
// --fade-len 20; long fade-len so the band-true span covers the deepest
// partner exit tail — e.exit rides ~10 scan-su past the anchor), bridged
// onto the traced entrance line. anchor-x 16.7 was solved so the slice
// END (34.37, 51.27) lands ON the traced entrance cubic, which is
// nearly band-parallel there: split at t = 0.56 gives curve tangent
// −40.2° vs chord −40.1° vs slice-end −40.6° — G1 through a short
// bridge. The tail keeps the traced arrival curl into the downstroke
// top junction. The full traced flick (U_ENTRANCE_SEGS, a 19.5%-xh
// hang) stays as the word-initial form (table: entry ~rule.y-bottom,
// nerfed-not-omitted at word start).
const U_ENTRANCE_LOW_SEGS = [
  // Band-true slice; anchor (16.7, 66.63) at 15.6% x-height.
  [[2.01, 73.73], [2.58, 73.61], [3.0, 73.47], [3.17, 73.31]],
  [[3.17, 73.31], [5.7, 74.98], [21.72, 62.1], [34.37, 51.27]],
  // Bridge (authored): −40.6° → −40.2°, band → traced entrance line.
  [[34.37, 51.27], [37.64, 48.47], [40.95, 45.72], [44.24, 42.94]],
  // Traced entrance tail (de Casteljau split at t 0.56) → junction.
  [[44.24, 42.94], [55.36, 33.56], [64.73, 24.67], [64.15, 24.16]],
];

// Connector, body→tip render order: 80.3 su chain, anchor at 0.784 of
// arc from the body side; hold hairline ~7 su past it (o's entrance
// profile — crossfade along the same curve), fade only over the tip.
// hairline rule-consistent (0.65 × 49.9/60).
const U_ENTRANCE_LOW = { hairline: 0.54, fadeStart: 0.872 };

// Mid-word exit connector — band-true slice of to/01 path3 (the
// canonical LOW band; derive_band.py low --xh 49.9 --ybottom 74.4
// --anchor-x 109.4 --fade-len 6). The traced exit flick is dropped in
// exit:'low' along with the body's valley lip (U_STROKE_SEGS[6], which
// existed to carry the flick); the slice start (81.97, 74.31) sits
// 1.9 su past the truncated body's end cap, i.e. just OUTSIDE its ink —
// the h island lesson — so an authored bridge starts ON the body
// centerline inside the descending valley ink (seg 5 @ t 0.7) and eases
// G1 into the slice's baseline crawl. Anchor (109.4, 66.63) = the
// canonical low scan point through this slice's transform, 15.6% xh.
const U_EXIT_BAND_SEGS = [
  // Bridge (authored): body valley → slice start.
  [[78.38, 71.19], [79.18, 72.56], [80.38, 74.31], [81.97, 74.31]],
  // Band-true slice.
  [[81.97, 74.31], [81.49, 74.74], [94.64, 74.42], [95.87, 73.31]],
  [[95.87, 73.31], [97.4, 74.32], [103.85, 70.02], [111.5, 64.07]],
];

// hairline rule-consistent (0.65 × 49.9/60); fadeStart holds full width
// ~1 su past the anchor (bridge 5.0 + 30.4 of the 5.0 + 32.6 su chain)
// — the short-hold profile that put t→o over the coarticulation bar.
const U_EXIT_CONN = { hairline: 0.54, fadeStart: 0.941 };

// Join anchors — curs attach points in u's local frame (no offsets on
// u; trace frame == rendered frame).
const U_JOIN_ANCHORS = {
  entry: {
    // The canonical low scan point through U_ENTRANCE_LOW_SEGS' slice
    // transform (15.6% x-height above baseline). No afterHigh entry yet
    // (u after b/f/o/v/w is a notYet variant).
    low: { x: 16.7, y: 66.63 },
  },
  // The canonical low scan point through U_EXIT_BAND_SEGS' transform.
  exit: { x: 109.4, y: 66.63 },
};

const VARIANT_SUPPORT = {
    supported: [
      { entry: 'low',  exit: 'low' },       // mid-word default
      { entry: 'none', exit: 'low' },       // word-initial (traced nerfed flick)
      { entry: 'none', exit: 'none' },      // isol — traced base incl. both flicks
      { entry: 'low',  exit: 'none' },      // word-final after low exit (flick kept: no data)
    ],
    notYet: [
      { entry: 'high', exit: 'low' },       // after b/f/o/v/w — no afterHigh entry traced
      { entry: 'high', exit: 'none' },
      { entry: 'low',  exit: 'flourish' },
      { entry: 'none', exit: 'flourish' },
    ],
  };

/**
 * Render a Matlack-style lowercase 'u'.
 * Components: entrance flick + single descent/rise ribbon + exit flick.
 */
function build(cx, cy, scale, dpr, overrides, variant = undefined) {
  variant = resolveVariantPure(VARIANT_SUPPORT, variant, 'u');

  // ── Body stroke ────────────────────────────────────────────────────
  // U_STROKE_SEGS[6] is the second valley's rising lip, which exists to
  // carry the traced exit flick — truncated in exit:'low' (the band-true
  // connector below replaces it; h precedent), kept for exit:'none'.
  // When truncating, remap the width function's arc fraction so the
  // profile stays pinned to the same geometry.
  const truncate = variant.exit === 'low';
  const fullIdxs = [0, 1, 2, 3, 4, 5, 6];
  const strokeIdxs = truncate ? [0, 1, 2, 3, 4, 5] : fullIdxs;
  const strokeCenter = sampleSegments(
    U_STROKE_SEGS, strokeIdxs, 12, cx, cy, scale, U_REF_CENTER
  );
  const polyLen = (pts) => {
    let L = 0;
    for (let i = 1; i < pts.length; i++) {
      L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }
    return L;
  };
  let widthFrac = 1.0;
  if (truncate) {
    const fullCenter = sampleSegments(
      U_STROKE_SEGS, fullIdxs, 12, cx, cy, scale, U_REF_CENTER
    );
    widthFrac = polyLen(strokeCenter) / polyLen(fullCenter);
  }
  const strokeQuads = buildRibbon(strokeCenter, (t) => uStrokeWidth(t * widthFrac, scale));
  const strokeFills = strokeQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'body' }));

  // ── Entrance ───────────────────────────────────────────────────────
  // entry 'none' (word-initial/isol): the traced flick — the nerfed
  // word-start form per the table (~rule.y-bottom).
  // entry 'low' (mid-word): band-true connector (U_ENTRANCE_LOW_SEGS).
  let entrFills;
  if (variant.entry === 'low') {
    const entrCenter = sampleSegments(
      U_ENTRANCE_LOW_SEGS,
      Array.from({ length: U_ENTRANCE_LOW_SEGS.length }, (_, i) => i),
      12, cx, cy, scale, U_REF_CENTER
    );
    const entrReversed = [...entrCenter].reverse();
    const entrQuads = buildConnectorRibbon(
      entrReversed,
      U_ENTRANCE_LOW.hairline * scale,
      U_ENTRANCE_LOW.fadeStart,
      { bodyWidth: 3.0 * scale, blendEnd: 0.25 },
    );
    entrFills = entrQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'entrance' }));
  } else {
    const entrCenter = sampleSegments(
      U_ENTRANCE_SEGS, [0], 12, cx, cy, scale, U_REF_CENTER
    );
    const entrReversed = [...entrCenter].reverse();
    const entrQuads = buildTaperedRibbon(
      entrReversed, 4.0 * scale, U_ENTRANCE.taperPower, U_ENTRANCE.liftPoint,
    );
    entrFills = entrQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'entrance' }));
  }

  // ── Exit ───────────────────────────────────────────────────────────
  // exit 'none': the traced flick (word-edge form, kept per the table).
  // exit 'low': band-true connector via the authored valley bridge
  // (see U_EXIT_BAND_SEGS).
  let exitFills;
  if (variant.exit === 'low') {
    const exitCenter = sampleSegments(
      U_EXIT_BAND_SEGS,
      Array.from({ length: U_EXIT_BAND_SEGS.length }, (_, i) => i),
      12, cx, cy, scale, U_REF_CENTER
    );
    const exitQuads = buildConnectorRibbon(
      exitCenter,
      U_EXIT_CONN.hairline * scale,
      U_EXIT_CONN.fadeStart,
    );
    exitFills = exitQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'exit' }));
  } else {
    const exitCenter = sampleSegments(
      U_EXIT_SEGS, [0], 12, cx, cy, scale, U_REF_CENTER
    );
    const exitQuads = buildTaperedRibbon(
      exitCenter, U_EXIT.startWidth * scale, U_EXIT.taperPower, U_EXIT.liftPoint,
    );
    exitFills = exitQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'exit' }));
  }

  return {
    bowls: [
    ],
    fills: [
      ...strokeFills,
    ...entrFills,
    ...exitFills,
    ],
  };
}

// Connector chains feeding u's join anchors (mirrors build's seg pick).
function joinSegs(v) {
    return {
      entry: v.entry === 'low' ? U_ENTRANCE_LOW_SEGS : U_ENTRANCE_SEGS,
      exit:  v.exit === 'low'  ? U_EXIT_BAND_SEGS : null,
    };
}

function exportOutlines(overrides) {
  return { stroke: 'ribbon' };
}

export default {
  letter: 'u',
  build,
  joinSegs,
  exportOutlines,
  variantSupport: VARIANT_SUPPORT,
  rule: U_RULE,
  refCenter: U_REF_CENTER,
  joinAnchors: U_JOIN_ANCHORS,
  variantExports: [
    ['',          { entry: 'low',  exit: 'low' }],    // mid-word default
    ['init',      { entry: 'none', exit: 'low' }],    // word-initial (traced nerfed flick)
    ['isol',      { entry: 'none', exit: 'none' }],   // standalone — traced base incl. both flicks
    ['fina',      { entry: 'low',  exit: 'none' }],   // word-final: keeps the traced flick
  ],
};
