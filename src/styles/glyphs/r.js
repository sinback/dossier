/**
 * glyphs/r.js — Matlack lowercase 'r'.
 * Per-letter descriptor module; see glyphs/t.js for the pattern.
 */
import {
  resolveOffset, buildRibbon, buildConnectorRibbon, smoothStep, sampleSegments, resolveVariantPure,
} from './helpers.js';

const R_REF_CENTER = { x: 55, y: 44 };  // junction of entrance/swoop/downstroke

// Rule-line y-values in r's local frame.
// rule.y-top is extrapolated (r doesn't reach into the ascender zone),
// preserving (yTop + yBottom) / 2 = yCenter.
const R_RULE = { yTop: -18, yCenter: 38, yBottom: 94 };

// Join anchors — curs attach points in r's local frame.
//   entry: the overlap-zone anchor where the previous letter's exit lands.
//          Derived from sinback's scan-space r.entry font-anchor (43.12,
//          30.87 in 'or/01') via the structural transform. Sits on r's
//          entry flick, past the body-side end, so the prev letter's
//          exit stroke can overlap with r's entry flick.
//   exit:  curs-attach for the next letter. Placeholder value pending
//          r-before-x scan data.
const R_JOIN_ANCHORS = {
  entry: {
    // low: ON the (extended) default entry flick at the 15% x-height
    // low-join convention height. The old (28.18, 55.62) mid-flick spot
    // sat at 68.5% — fine against the flick, but drift-inconsistent with
    // every low exit (they anchor at 15%).
    // (85.6 → 85.28 when the entrance went band-true: the canonical low
    // scan point through the slice transform; the old value was read off
    // the extended flick and carried a 0.32 su offset every band-true
    // partner exit would have inherited as drift.)
    low:  { x: -7.55, y: 85.28 },
    // high: the SAME scan point as o.exit — sinback's (46.22, 30.11) on
    // or/01 path2 — mapped through the transform that placed
    // R_ENTRANCE_AFTERHIGH_SEGS (scale 2.17, end pinned to downstrokeTop,
    // nudge included). Both glyphs anchoring the same trace point is what
    // makes the curs overlay reconstruct the trace. Lands at 71.5%
    // x-height, independently agreeing with o.exit's 71.6% convention.
    high: { x: 32.76, y: 53.97 },
  },
  // The canonical low scan point (41.25, 71.64) through the exit
  // connector's slice transform (see R_EXIT_BAND_SEGS) — 15.6% x-height.
  exit:  { x: 87.09, y: 85.28 },
};

// Structural anchors — stable, identifiable features on the letter's body,
// used for aligning the glyph geometry against a scan. Different from join
// anchors (which live in the curs overlap zone); structural anchors sit on
// the letter body proper so they're easy to mark on scans by eye.
const R_STRUCTURAL_ANCHORS = {
  downstrokeTop: { x: 51.75, y: 38.69 },  // top of r's swoop (R_STROKE_SEGS[0] start)
};

// Entrance — band-true slice of to/01 path3 (derive_band.py low --xh 56
// --ybottom 94 --anchor-x -7.55 --skip-head 12.1 --fade-len 20), bridged
// onto the traced entrance line (r/01 flick tip (18.10, 64.90) → body
// junction (51.44, 37.99)). Replaces the original straight-line
// extension of the traced flick, which predates the band-true-entry
// lesson (h, 2026-07-10): a straight extension crosses a band-true
// partner's exit at a shallow angle instead of riding it — u→r scored
// coart 0.02 (essentially offset-parallel). The bridge is G1-ish at
// both ends (slice end tangent −40.3°, line −38.9°). Note r has no
// entry-none variant: this chain is also the word-initial render, whose
// deep baseline-crawling tip matches the table's "naturally y-bottom"
// entry note.
const R_ENTRANCE_SEGS = [
  // Band-true slice; anchor (-7.55, 85.28) at 15.6% x-height.
  [[-25.54, 93.51], [-24.12, 93.31], [-23.05, 93.07], [-22.73, 92.78]],
  [[-22.73, 92.78], [-20.07, 94.53], [-4.07, 81.92], [9.61, 70.31]],
  // Bridge (authored): band → the traced entrance line.
  [[9.61, 70.31], [14.2, 66.42], [19.72, 63.6], [24.0, 60.15]],
  // The traced entrance line, on to the body junction.
  [[24.0, 60.15], [24.0, 60.15], [51.44, 37.99], [51.44, 37.99]],
];

// Reversed render (body→tip fade): anchor sits ~0.78 of arc from the
// body side; hold hairline ~4 su past it, fade over the deep tail.
const R_ENTRANCE_LOW = { fadeStart: 0.83 };

// Entrance flick — afterHigh variant (r after b/f/o/v/w, or after strong o-exit).
// Source: or/01 path2 ('o Exit → r Entry'), sliced at t≈0.45 on its 2nd
// cubic so the flick starts at the user's r.entry font-anchor. Transformed
// to r's glyph local frame, then translated (-2.98, +0.54) so the endpoint
// lands on R_STRUCTURAL_ANCHORS.downstrokeTop (= rule.y-center) for clean
// tangent continuity with the afterHigh body at the top.
// Two cubic segments.
const R_ENTRANCE_AFTERHIGH_SEGS = [
  [[25.20, 56.16], [31.00, 55.29], [37.10, 53.14], [37.46, 52.17]],
  [[37.46, 52.17], [40.03, 53.94], [53.16, 39.67], [51.75, 38.69]],
];

// Swoop + downstroke as one continuous stroke
const R_STROKE_SEGS = [
  // Swoop (the little hook that makes 'r' recognizable)
  [[51.75,38.69],[50.92,38.22],[53.16,49.03],[58.52,49.45]],
  // Downstroke
  [[58.96,49.27],[58.96,49.27],[30.91,80.27],[32.80,83.77]],
  [[32.80,83.77],[31.26,84.62],[34.47,95.36],[36.97,93.99]],
];

// Width function: swoop is thin, descent fattens, bottom loop thins
function rStrokeWidth(t, scale) {
  // Swoop entry: thin
  if (t < 0.10) return 2.0 * scale;

  // Swoop body: moderate
  if (t < 0.25) return smoothStep(2.0, 3.5, (t - 0.10) / 0.15) * scale;

  // Transition to descent: fattening
  if (t < 0.40) return smoothStep(3.5, 5.0, (t - 0.25) / 0.15) * scale;

  // Main descent: fat
  if (t < 0.65) return 5.0 * scale;

  // Bottom turnaround: thinning
  if (t < 0.80) return smoothStep(5.0, 3.0, (t - 0.65) / 0.15) * scale;

  // Bottom loop: moderate, thinning to exit
  return smoothStep(3.0, 1.5, (t - 0.80) / 0.20) * scale;
}

// Exit flick — traced from isolated r/01, i.e. the WORD-FINAL form (for/01
// path1 'r Downstroke → r Exit (terminal)' confirms terminal r exits are a
// distinct flourish). Kept for the future fina variant; mid-word exits use
// the band-true connector below.
const R_EXIT_SEGS = [
  [[37.56,94.79],[36.90,95.64],[50.31,96.17],[51.21,95.00]],
  [[51.21,95.00],[51.21,95.00],[74.98,86.19],[74.98,86.19]],
];

const R_EXIT = { startWidth: 2.5, taperPower: 1.7, liftPoint: 0.85 };

const R_EXIT_OFFSET = { dx: 0, dy: 0 };

// Mid-word exit connector — band-true slice of to/01 path3 (the canonical
// LOW band; derive_band.py low --xh 56 --ybottom 94 --anchor-x 87.09
// --fade-len 6). anchor-x was chosen so the trace START lands on the
// afterHigh body's bottom-loop end (56.31, 94.58) — zero bridge for that
// form; the default body reaches the trace via a baseline bridge (the
// trace's own opening character is a baseline crawl, so the bridge just
// extends it). Anchor (87.09, 85.28) = the canonical low scan point
// (41.25, 71.64) through this slice's transform, 15.6% x-height.
const R_EXIT_BAND_SEGS = [
  [[56.31, 93.90], [55.77, 94.38], [70.53, 94.02], [71.91, 92.78]],
  [[71.91, 92.78], [73.57, 93.87], [80.42, 89.38], [88.66, 83.02]],
];

const R_EXIT_BRIDGE_DEFAULT = [
  [[36.97, 93.99], [43.40, 95.80], [50.20, 95.30], [56.31, 93.90]],
];

// hairline rule-consistent (0.65 × 56/60); fadeStart: anchor at 33.0 su of
// the 35.5 su slice, plus the 19.8 su bridge for the default form.
const R_EXIT_CONN = { hairline: 0.61, fadeStartAfterHigh: 0.929, fadeStartDefault: 0.955 };

// ── afterHigh variant body + exit ────────────────────────────────────────────
// In Copperplate literature the flat-topped r is a structurally different
// letterform, not just "default r with a different entry flick" — so both
// the body shape and the exit extension differ.
//
// Source: or/01 path1 ("r Downstroke → r Exit"), six cubic segments. That
// scan's r is the afterHigh variant (o precedes it with a high exit).
// Segments translated to r's glyph-local frame via the scan→glyph transform
// for or/01 (scale≈0.446, offsets≈(30.54, 6.04)), then shifted +0.22 in y
// so the first point coincides with R_STRUCTURAL_ANCHORS.downstrokeTop.
const R_STROKE_SEGS_AFTERHIGH = [
  [[51.75, 38.69], [51.55, 38.71], [48.35, 52.66], [50.50, 52.23]],
  [[50.50, 52.23], [49.83, 52.25], [53.23, 60.23], [54.82, 59.58]],
  [[54.82, 59.58], [54.53, 59.31], [32.31, 82.00], [37.08, 86.25]],
  [[37.08, 86.25], [35.19, 86.74], [36.74, 97.25], [44.89, 95.12]],
  [[44.89, 95.12], [43.39, 96.02], [52.95, 96.58], [56.31, 94.58]],
];

const R_EXIT_SEGS_AFTERHIGH = [
  [[56.31, 94.58], [57.05, 97.99], [103.89, 66.30], [103.62, 65.00]],
];

const VARIANT_SUPPORT = {
    supported: [
      { entry: 'low',  exit: 'low' },
      { entry: 'high', exit: 'low' },       // afterHigh
    ],
    notYet: [
      { entry: 'low',  exit: 'flourish' },
      { entry: 'high', exit: 'flourish' },
    ],
  };

function build(cx, cy, scale, dpr, overrides, variant = { entry: 'low', exit: 'low' }) {
  variant = resolveVariantPure(VARIANT_SUPPORT, variant, 'r');

  // Body + exit geometry depends on variant.entry — r.afterHigh is a
  // structurally different letterform, not just a different entry flick.
  const isAfterHigh = variant.entry === 'high';
  const strokeSegs = isAfterHigh ? R_STROKE_SEGS_AFTERHIGH : R_STROKE_SEGS;

  // Swoop + downstroke as one ribbon.
  const strokeIdxs = Array.from({ length: strokeSegs.length }, (_, i) => i);
  const strokeCenter = sampleSegments(
    strokeSegs, strokeIdxs, 12, cx, cy, scale, R_REF_CENTER
  );
  const strokeQuads = buildRibbon(strokeCenter, (t) => rStrokeWidth(t, scale));
  const strokeFills = strokeQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'body' }));

  // Entrance flick (reversed taper).
  const entrSegs = isAfterHigh ? R_ENTRANCE_AFTERHIGH_SEGS : R_ENTRANCE_SEGS;
  const entrIdxs = Array.from({ length: entrSegs.length }, (_, i) => i);
  const entrCenter = sampleSegments(
    entrSegs, entrIdxs, 12, cx, cy, scale, R_REF_CENTER
  );
  // Connector profile: fat where it merges into the body, hairline through
  // the join band (the trace is a hairline there — or/01 path2), brief fade
  // at the free tip. The old tip-to-zero lift taper left the band portion
  // thinner than the shared trace, so the neighbor's slice couldn't
  // coarticulate with it.
  const entrReversed = [...entrCenter].reverse();
  const entrQuads = buildConnectorRibbon(
    entrReversed,
    0.65 * scale,
    isAfterHigh ? 0.9 : R_ENTRANCE_LOW.fadeStart,
    { bodyWidth: 3.5 * scale, blendEnd: 0.4 },
  );
  const entrFills = entrQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'entrance' }));

  // Exit connector — band-true slice (see R_EXIT_BAND_SEGS). The traced
  // flourish forms (R_EXIT_SEGS / R_EXIT_SEGS_AFTERHIGH) are word-final;
  // they'll return as the fina variant.
  const exitOff = resolveOffset('exitFlick', R_EXIT_OFFSET, overrides, dpr);
  const exitConnSegs = isAfterHigh
    ? R_EXIT_BAND_SEGS
    : [...R_EXIT_BRIDGE_DEFAULT, ...R_EXIT_BAND_SEGS];
  const exitIdxs = Array.from({ length: exitConnSegs.length }, (_, i) => i);
  const exitCenter = sampleSegments(
    exitConnSegs, exitIdxs, 12,
    cx + exitOff.dx, cy + exitOff.dy, scale, R_REF_CENTER
  );
  const exitQuads = buildConnectorRibbon(
    exitCenter,
    R_EXIT_CONN.hairline * scale,
    isAfterHigh ? R_EXIT_CONN.fadeStartAfterHigh : R_EXIT_CONN.fadeStartDefault,
  );
  const exitFills = exitQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'exit' }));

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

// Connector chains feeding r's join anchors (mirrors build's seg pick).
function joinSegs(v) {
    // r.afterHigh is a structurally different letterform (see R_STROKE_SEGS_
    // AFTERHIGH's comment) — body AND exit shape change with variant.entry,
    // not variant.exit. R_JOIN_ANCHORS.exit is a single point shared by both
    // forms, but the curve it sits on differs.
    const isAfterHigh = v.entry === 'high';
    return {
      entry: isAfterHigh ? R_ENTRANCE_AFTERHIGH_SEGS : R_ENTRANCE_SEGS,
      exit:  isAfterHigh ? R_EXIT_BAND_SEGS
           : [...R_EXIT_BRIDGE_DEFAULT, ...R_EXIT_BAND_SEGS],
    };
}

function exportOutlines(overrides) {
  return { stroke: 'ribbon' };
}

export default {
  letter: 'r',
  build,
  joinSegs,
  exportOutlines,
  variantSupport: VARIANT_SUPPORT,
  rule: R_RULE,
  refCenter: R_REF_CENTER,
  joinAnchors: R_JOIN_ANCHORS,
  structuralAnchors: R_STRUCTURAL_ANCHORS,
  variantExports: [
    ['',          { entry: 'low',  exit: 'low' }],    // mid-word default
    ['afterHigh', { entry: 'high', exit: 'low' }],    // after b/f/o/v/w
  ],
};
