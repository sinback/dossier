/**
 * glyphs/e.js — Matlack lowercase 'e'.
 * Per-letter descriptor module; see glyphs/t.js for the pattern.
 */
import {
  buildRibbon, buildConnectorRibbon, smoothStep, sampleSegments, resolveVariantPure,
} from './helpers.js';

const E_REF_CENTER = { x: 34.5, y: 32.0 };  // approximate center of the letter

// Rule-line y-values in e's local frame.
// e's loop tops around y=9 (x-height top) and reaches baseline around y=52.
const E_RULE = { yTop: -34, yCenter: 9, yBottom: 52 };

// Join anchors — curs attach points in e's local frame.
// Heights follow the join convention (see O_JOIN_ANCHORS): low at 15%
// x-height, high at 68.5%. e's x-height is 43 (E_RULE), so low = y 45.5.
//   entry.low:  on the extended default entrance flick.
//   entry.high: on the extended afterHigh entrance flick.
//   exit: ON the final loop segment at 15% — the loop continues past it
//         to (53.59, 40.21), which is the overlap tail.
const E_JOIN_ANCHORS = {
  entry: {
    low:  { x: 0.98, y: 45.3 },
    // high: ON the extended afterHigh flick at 71.6% x-height (matches
    // o.exit and the high-join convention).
    high: { x: 2.99, y: 21.21 },
  },
  // exit: sinback's to/01 scan anchor (41.25, 71.64) mapped through the
  // exit slice's placement transform (scale 1.536, see E_EXIT_SEGS).
  // 15.6% x-height by rule consistency; also where the trimmed loop
  // final segment ends (handoff point).
  exit:  { x: 43.94, y: 45.30 },
};

const E_STRUCTURAL_ANCHORS = {
  crossbarStart: { x: 21.33, y: 35.41 },  // where the loop begins
};

// The full loop as bezier segments, traced from the 'e Loop' path in e/01_paths.
const E_LOOP_SEGS = [
  [[21.33,35.41],[21.27,36.14],[35.04,31.65],[35.61,29.65]],
  [[35.61,29.65],[41.81,27.15],[50.41,10.44],[50.00,10.59]],
  [[50.00,10.59],[51.44,9.37],[45.87,6.53],[42.76,9.31]],
  [[42.76,9.31],[41.17,8.09],[29.05,19.29],[29.84,19.84]],
  [[29.84,19.84],[28.14,20.43],[13.58,45.74],[18.59,46.23]],
  [[18.59,46.23],[16.34,53.24],[29.79,52.13],[30.51,49.90]],
  // Final (exit) segment, trimmed at the exit anchor (43.94, 45.30):
  // beyond that point the labeled exit CONNECTOR (E_EXIT_SEGS, a band-true
  // slice of the to/01 trace) carries the stroke, so the loop ribbon stops
  // where the connector takes over — no forked tail. (This supersedes the
  // 2026-07-03 P2 steepening of the traced (53.56, 40.27) handle.)
  [[30.51,49.90],[30.11,50.88],[37.3,48.27],[43.94,45.30]],
];

// Entrance flick — default (e after @low_exit).
// Dips from the crossbar start down through the 15% x-height low-join band
// (anchor at (0.98, 45.5)), tip ending at y=48. The earlier straight-line
// Band-true slice of to/01 path3 (the canonical LOW band; derive_band.py
// low --xh 43 --ybottom 52 --anchor-x 0.98 --skip-head 12.1 --fade-len 6),
// bridged to the crossbar start. Replaces the hand-authored dip: with r's
// exit now band-true, only a slice of the same trace can coarticulate
// (the dip rode ~1.5 su parallel to it — coart 0.03).
const E_ENTRANCE_DEFAULT_SEGS = [
  // Band-true slice; anchor (0.98, 45.3) at 15.6% x-height.
  [[-10.68, 51.06],[-9.30, 51.97],[-3.30, 47.88],[3.68, 42.40]],
  // Bridge (authored): band → crossbar start, easing 38° → crossbar tangent.
  [[3.68, 42.40],[8.20, 39.60],[14.50, 37.20],[21.33, 35.41]],
];

// Connector, body→tip render order: holds hairline through the anchor
// (at ~0.63 of arc from the body side), fades over the outer tip.
// Hairline rule-consistent: 0.65 × 43/60.
const E_ENTRANCE_DEFAULT = { hairline: 0.47, fadeStart: 0.75 };

// Entrance flick — afterHigh variant (e after @high_exit = b/f/o/v/w).
// Enters from the high-join band (tip at ~78% x-height, up from the old
// (4, 31) = 49% which no high exit could reach) and descends to the
// crossbar start, arriving on the same tangent as before.
const E_ENTRANCE_AFTERHIGH_SEGS = [
  [[0, 18.5],[6, 24],[14, 31],[21.33, 35.41]],
];

// Authored (not yet band-true — o→e still scores low; future work mirrors
// the low-entry slice using the HIGH band).
const E_ENTRANCE_AFTERHIGH = { hairline: 0.47, fadeStart: 0.8 };

// Exit connector — band-true slice of the canonical LOW-band trace
// (to/01 path3 seg B, same curve as o's low entrance), rule-consistent
// scale 43/28 = 1.536, pinned at sinback's scan anchor (41.25, 71.64) →
// local (43.94, 45.30). Runs from just under the loop's lower-right
// (the trace start) through the anchor, fading toward the next letter;
// the loop's trimmed final segment hands off to it at the anchor.
const E_EXIT_SEGS = [
  // Trace slice (seg B, t ∈ [0, 0.566], de Casteljau sub-curve).
  [[32.28, 51.06],[34.37, 52.43],[47.12, 42.32],[57.76, 33.26]],
];

// Anchor at arc-length fraction ~0.43 (body → tip); hairline holds a few
// su past the anchor (fade window overlaps the partner slice's full-width
// zone), then fades toward the next letter's entrance slice.
const E_EXIT = { hairline: 0.65, fadeStart: 0.58 };

// Width function for the loop. t = arc-length fraction [0, 1].
// The loop goes: crossbar entry (thin) → top curve → left descent (thickening)
//                → bottom (peak) → right ascent → exit (thinning)
function eLoopWidth(t, scale) {
  // Entry: crossbar, thin
  if (t < 0.15) return 1.5 * scale;

  // Curving over the top: still thin
  if (t < 0.30) return smoothStep(1.5, 2.0, (t - 0.15) / 0.15) * scale;

  // Left descent: thickening
  if (t < 0.55) return smoothStep(2.0, 5.5, (t - 0.30) / 0.25) * scale;

  // Bottom: peak width
  if (t < 0.70) return 5.5 * scale;

  // Right ascent + exit: thinning
  if (t < 0.90) return smoothStep(5.5, 1.5, (t - 0.70) / 0.20) * scale;

  // Exit flick
  return smoothStep(1.5, 0.5, (t - 0.90) / 0.10) * scale;
}

const VARIANT_SUPPORT = {
    supported: [
      { entry: 'low',  exit: 'low' },
      { entry: 'high', exit: 'low' },
    ],
    notYet: [
      { entry: 'none', exit: 'low' },       // init form
      { entry: 'low',  exit: 'flourish' },
      { entry: 'high', exit: 'flourish' },
      { entry: 'none', exit: 'flourish' },
    ],
  };

/**
 * Render a Matlack-style lowercase 'e'.
 * Single continuous loop stroke rendered as a variable-width ribbon.
 */
function build(cx, cy, scale, dpr, overrides, variant = { entry: 'low', exit: 'low' }) {
  variant = resolveVariantPure(VARIANT_SUPPORT, variant, 'e');

  const loopCenter = sampleSegments(
    E_LOOP_SEGS,
    [0, 1, 2, 3, 4, 5, 6],
    12, cx, cy, scale, E_REF_CENTER
  );
  const loopQuads = buildRibbon(loopCenter, (t) => eLoopWidth(t, scale));
  const loopFills = loopQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'body' }));

  // Exit connector (band-true slice of the to/01 trace; see E_EXIT_SEGS).
  let exitFills = [];
  if (variant.exit !== 'none') {
    const exitCenter = sampleSegments(E_EXIT_SEGS, [0], 12, cx, cy, scale, E_REF_CENTER);
    const exitQuads = buildConnectorRibbon(
      exitCenter,
      E_EXIT.hairline * scale,
      E_EXIT.fadeStart,
    );
    exitFills = exitQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'exit' }));
  }

  // Entrance flick depends on variant.entry. 'none' → no entry stroke.
  let entrSegs = null, entrParams = null;
  if (variant.entry === 'low') {
    entrSegs = E_ENTRANCE_DEFAULT_SEGS;
    entrParams = E_ENTRANCE_DEFAULT;
  } else if (variant.entry === 'high') {
    entrSegs = E_ENTRANCE_AFTERHIGH_SEGS;
    entrParams = E_ENTRANCE_AFTERHIGH;
  }
  // variant.exit === 'flourish' is not yet implemented — resolveVariant will
  // have already mapped it to a supported variant.

  let entrFills = [];
  if (entrSegs) {
    const entrCenter = sampleSegments(
      entrSegs,
      Array.from({ length: entrSegs.length }, (_, i) => i),
      12, cx, cy, scale, E_REF_CENTER,
    );
    const entrReversed = [...entrCenter].reverse();
    const entrQuads = buildConnectorRibbon(
      entrReversed,
      entrParams.hairline * scale,
      entrParams.fadeStart,
    );
    entrFills = entrQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'entrance' }));
  }

  return {
    bowls: [
    ],
    fills: [
      ...loopFills,
      ...entrFills,
      ...exitFills,
    ],
  };
}

// Connector chains feeding e's join anchors (mirrors build's seg pick).
function joinSegs(v) {
    return {
      entry: v.entry === 'low'  ? E_ENTRANCE_DEFAULT_SEGS
           : v.entry === 'high' ? E_ENTRANCE_AFTERHIGH_SEGS : null,
      exit:  v.exit !== 'none' ? E_EXIT_SEGS : null,
    };
}

function exportOutlines(overrides) {
  return { loop: 'single-stroke — no decomposition' };
}

export default {
  letter: 'e',
  build,
  joinSegs,
  exportOutlines,
  variantSupport: VARIANT_SUPPORT,
  rule: E_RULE,
  refCenter: E_REF_CENTER,
  joinAnchors: E_JOIN_ANCHORS,
  structuralAnchors: E_STRUCTURAL_ANCHORS,
  variantExports: [
    ['',          { entry: 'low',  exit: 'low' }],    // mid-word default
    ['afterHigh', { entry: 'high', exit: 'low' }],    // after b/f/o/v/w
  ],
};
