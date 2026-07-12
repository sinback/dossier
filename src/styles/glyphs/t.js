/**
 * glyphs/t.js — Matlack lowercase 't' (type 1: entrance + fat bar + crossbar).
 *
 * Per-letter module: exports one descriptor consumed by matlackGlyphs.js
 * (build/joinSegs/registries) and matlackSVGExport.js (variantExports). All
 * letter constants live here; shared geometry helpers are imported from
 * ./helpers.js.
 */
import {
  refToCanvas, resolveOffset, resolveRefOffset, sampleSegments,
  buildConnectorRibbon, buildTaperedRibbon, buildBar, resolveVariantPure,
} from './helpers.js';

// Reference anchor: midpoint of the fat bar.
const T_REF_CENTER = { x: 59.0, y: 64.5 };

// Fat bar (main downstroke)
const T_FAT_BAR = {
  x1: 94.30, y1: 6.08,     // top
  x2: 23.96, y2: 122.92,   // bottom
};
const T_FAT_BAR_HALF_WIDTH = 5.5;  // slightly less than measured 12.8 at 1x — image includes blur
const T_FAT_BAR_OFFSET = { dx: 0, dy: 0 };

// Crossbar hairline (thin, nearly horizontal)
const T_CROSSBAR = {
  x1: 85.04, y1: 67.95,    // right end
  x2: 49.90, y2: 80.62,    // left end
  halfHeight: 1.5,
};
const T_CROSSBAR_OFFSET = { dx: 0, dy: 0 };

// Entrance hairline (leading stroke — tapered ribbon approaching fat bar)
// Starts thin at bottom-left, thickens toward the intersection with fat bar.
const T_ENTRANCE_SEGS = [
  [[6.77,98.97],[6.77,98.97],[72.61,41.99],[72.61,41.99]],
];
const T_ENTRANCE = {
  startWidth: 1.0,    // thin at the entry point
  taperPower: 1.7,    // same hand
  liftPoint: 1.0,     // tapers over full length (reversed — see render)
};

// Rule lines in t/01's local frame. No rule lines are visible in the crop,
// so these are derived from two anatomy anchors validated across the three
// traced "to" contexts: (1) the fat-bar foot lands on the baseline
// (to/01 foot 75.71 vs rule 76; to/05 183.2 vs 181), and (2) the
// crossbar×bar crossing sits at/just above the x-height line (to/01
// crossing 47.0 vs yCenter 48 at xh 28; to/05 within ~0.1 xh). t/01's
// crossing is (49.5, 80.7), foot (23.96, 122.92) → xh ≈ 40.2 (±2 su).
// yTop from the tops-reach-~90%-of-yTop convention (bar top y 6.08).
// NOTE: this Type-1 (isolated) t is ~2.8 xh tall vs ~1.78 xh for the t's
// in the "to" contexts — sinback's word-context t types differ in
// ascender height while the crossbar stays pinned near x-height.
const T_RULE = { yTop: -7, yCenter: 82.7, yBottom: 122.9 };

// Mid-word low entrance — band-true slice of to/01 path3 (derive_band.py
// low --xh 40.2 --ybottom 122.9 --anchor-x -13.64 --skip-head 12.1
// --fade-len 20). The slice end (4.58, 100.82) lands 0.03 su off the
// traced entrance line's extension — zero bridge; the line carries on to
// the fat-bar junction (G1 within 0.3°: slice tangent −41.2°, line
// −40.9°). Replaces the original straight-line extension (pre-h-lesson;
// l→t scored coart 0.00 with the letters not even touching). The traced
// hang (T_ENTRANCE_SEGS) stays the word-initial form.
const T_ENTRANCE_LOW_SEGS = [
  // Band-true slice; anchor (-13.64, 116.64) at 15.6% x-height.
  [[-24.36, 122.1], [-21.47, 122.92], [-5.62, 109.73], [4.58, 100.82]],
  // The traced entrance line, on to the fat-bar junction.
  [[4.58, 100.82], [4.58, 100.82], [72.61, 41.99], [72.61, 41.99]],
];
// Reversed render: anchor at ~0.91 of arc from the body side.
const T_ENTRANCE_LOW = { fadeStart: 0.93 };

// Mid-word exit connector — band-true slice of to/01 path3 (the canonical
// LOW band; derive_band.py low --xh 40.2 --ybottom 122.9 --anchor-x 47.0
// --fade-len 6). anchor-x was chosen so the trace START (24.9, 122.83)
// lands inside the fat bar's foot ink (bar centerline x ≈ 24.5 at the
// foot, half-width 5.5) — zero bridge: the connector emerges from the
// bar's own footprint, mirroring how the entrance hairline terminates on
// the bar. This also preserves Matlack's own t→o spacing through the
// slice transform. Anchor (47.0, 116.64) = the canonical low scan point
// (41.25, 71.64) through this slice's transform, 15.6% x-height.
const T_EXIT_BAND_SEGS = [
  [[24.9, 122.83], [24.52, 123.17], [35.11, 122.91], [36.1, 122.02]],
  [[36.1, 122.02], [37.42, 122.89], [43.25, 118.88], [49.96, 113.59]],
];
// hairline rule-consistent (0.65 × 40.2/60); fadeStart holds full width
// ~1 su PAST the anchor (23.7 su of the 27.8 su slice), fading only over
// the last ~3 su — same profile as R_EXIT_CONN (0.955), which keeps the
// overlap band full-width so the neighbor's slice can coarticulate.
// (fadeStart at the anchor scored coart 0.58; a longer faded tail
// [--fade-len 10] scored 0.48 — thin-on-thin ink overlaps poorly.)
const T_EXIT_CONN = { hairline: 0.44, fadeStart: 0.89 };

// Join anchors — curs attach points in t's local frame.
const T_JOIN_ANCHORS = {
  entry: {
    // On the extended entrance line at the low-join convention height
    // (15.6% x-height above baseline), where a preceding letter's low
    // exit overlaps. No afterHigh entry yet (t after b/f/o/v/w is a
    // notYet variant).
    low: { x: -13.64, y: 116.63 },
  },
  // The canonical low scan point through T_EXIT_BAND_SEGS's transform.
  exit: { x: 47.0, y: 116.64 },
};

const VARIANT_SUPPORT = {
  supported: [
    { entry: 'low',  exit: 'low' },       // mid-word default
    { entry: 'none', exit: 'low' },       // word-initial ("to", "the")
    { entry: 'none', exit: 'none' },      // isol — the traced Type-1 base
    { entry: 'low',  exit: 'none' },      // bare word-final fallback
  ],
  notYet: [
    // Table: t exit is rule.y-bottom~ (kept word-finally, sometimes
    // flourished) — like m, the mid-word low connector doubles as the
    // kept word-final stroke, so no separate fina geometry yet.
    { entry: 'high', exit: 'low' },       // after b/f/o/v/w — no afterHigh entry traced
    { entry: 'high', exit: 'none' },
    { entry: 'low',  exit: 'flourish' },
    { entry: 'none', exit: 'flourish' },
  ],
};

/**
 * Render a Matlack-style lowercase 't' (type 1).
 * Components: entrance hairline (tapered ribbon), fat bar, crossbar hairline.
 * No bowl — pure vertical family.
 */
function build(cx, cy, scale, dpr, overrides, variant = undefined) {
  variant = resolveVariantPure(VARIANT_SUPPORT, variant, 't');

  // ── Fat bar (main downstroke) ───────────────────────────────────
  const fbOff = resolveOffset('fatBar', T_FAT_BAR_OFFSET, overrides, dpr);
  const hw = T_FAT_BAR_HALF_WIDTH * scale;
  const p0 = refToCanvas(T_FAT_BAR.x1, T_FAT_BAR.y1, cx, cy, scale, T_REF_CENTER);
  const p1 = refToCanvas(T_FAT_BAR.x2, T_FAT_BAR.y2, cx, cy, scale, T_REF_CENTER);
  p0.x += fbOff.dx; p0.y += fbOff.dy;
  p1.x += fbOff.dx; p1.y += fbOff.dy;
  const dx = p1.x - p0.x, dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy);
  const nx = -dy / len * hw, ny = dx / len * hw;
  const fatBar = [
    { x: p0.x + nx, y: p0.y + ny },
    { x: p1.x + nx, y: p1.y + ny },
    { x: p1.x - nx, y: p1.y - ny },
    { x: p0.x - nx, y: p0.y - ny },
  ];

  // ── Crossbar hairline ──────────────────────────────────────────
  const cbOff = resolveOffset('crossbar', T_CROSSBAR_OFFSET, overrides, dpr);
  const cb = T_CROSSBAR;
  const cbl = refToCanvas(cb.x1, cb.y1, cx, cy, scale, T_REF_CENTER);
  const cbr = refToCanvas(cb.x2, cb.y2, cx, cy, scale, T_REF_CENTER);
  cbl.x += cbOff.dx; cbl.y += cbOff.dy;
  cbr.x += cbOff.dx; cbr.y += cbOff.dy;
  const cbh = cb.halfHeight * scale;
  const cbdx = cbr.x - cbl.x, cbdy = cbr.y - cbl.y;
  const cblen = Math.hypot(cbdx, cbdy);
  const cbnx = -cbdy / cblen * cbh, cbny = cbdx / cblen * cbh;
  const crossbar = [
    { x: cbl.x + cbnx, y: cbl.y + cbny },
    { x: cbr.x + cbnx, y: cbr.y + cbny },
    { x: cbr.x - cbnx, y: cbr.y - cbny },
    { x: cbl.x - cbnx, y: cbl.y - cbny },
  ];

  // ── Entrance ─────────────────────────────────────────────────────
  // entry 'none' (word-initial/isol): the traced hang form — a tapered
  // ribbon, thick at the fat bar, lifting to nothing at the tip.
  // entry 'low' (mid-word): the same line extended down through the low
  // join band (T_ENTRANCE_LOW_SEGS), rendered as a connector hairline so
  // the preceding letter's low exit can coarticulate with it.
  let entrFills;
  if (variant.entry === 'low') {
    const entrCenter = sampleSegments(
      T_ENTRANCE_LOW_SEGS,
      Array.from({ length: T_ENTRANCE_LOW_SEGS.length }, (_, i) => i),
      12, cx, cy, scale, T_REF_CENTER
    );
    const entrReversed = [...entrCenter].reverse();
    const entrQuads = buildConnectorRibbon(
      entrReversed,
      T_EXIT_CONN.hairline * scale,
      T_ENTRANCE_LOW.fadeStart,
      { bodyWidth: T_FAT_BAR_HALF_WIDTH * scale, blendEnd: 0.25 },
    );
    entrFills = entrQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'entrance' }));
  } else {
    const entrCenter = sampleSegments(
      T_ENTRANCE_SEGS, [0], 12, cx, cy, scale, T_REF_CENTER
    );
    // Reverse so taper goes from thick (at fat bar) to thin (at entry point)
    const entrReversed = [...entrCenter].reverse();
    const entrQuads = buildTaperedRibbon(
      entrReversed,
      T_FAT_BAR_HALF_WIDTH * scale,  // start thick, matching the fat bar
      T_ENTRANCE.taperPower,
      T_ENTRANCE.liftPoint,
    );
    entrFills = entrQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'entrance' }));
  }

  // ── Exit connector (band-true slice; see T_EXIT_BAND_SEGS) ───────
  // The slice's start sits inside the fat bar's foot ink, so there is no
  // bridge — the hairline emerges from the bar the way the entrance
  // terminates on it.
  let exitFills = [];
  if (variant.exit === 'low') {
    const exitCenter = sampleSegments(
      T_EXIT_BAND_SEGS,
      Array.from({ length: T_EXIT_BAND_SEGS.length }, (_, i) => i),
      12, cx, cy, scale, T_REF_CENTER
    );
    const exitQuads = buildConnectorRibbon(
      exitCenter,
      T_EXIT_CONN.hairline * scale,
      T_EXIT_CONN.fadeStart,
    );
    exitFills = exitQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'exit' }));
  }

  return {
    bowls: [
    ],
    fills: [
      { points: fatBar, pressure: 0.85, label: 'body' },
    { points: crossbar, pressure: 0.70, label: 'body' },
    ...entrFills,
    ...exitFills,
    ],
  };
}

// Connector Bezier chains feeding t's join anchors (mirrors the entry/exit
// seg selection in build above). Receives an already-resolved variant.
function joinSegs(v) {
  return {
    entry: v.entry === 'low' ? T_ENTRANCE_LOW_SEGS : T_ENTRANCE_SEGS,
    exit:  v.exit === 'low'  ? T_EXIT_BAND_SEGS : null,
  };
}

function exportOutlines(overrides) {
  const fbOff = resolveRefOffset('fatBar', T_FAT_BAR_OFFSET, overrides);
  const fatBar = buildBar(
    T_FAT_BAR.x1 + fbOff.dx, T_FAT_BAR.y1 + fbOff.dy,
    T_FAT_BAR.x2 + fbOff.dx, T_FAT_BAR.y2 + fbOff.dy,
    T_FAT_BAR_HALF_WIDTH,
  );
  const cbOff = resolveRefOffset('crossbar', T_CROSSBAR_OFFSET, overrides);
  const crossbar = buildBar(
    T_CROSSBAR.x1 + cbOff.dx, T_CROSSBAR.y1 + cbOff.dy,
    T_CROSSBAR.x2 + cbOff.dx, T_CROSSBAR.y2 + cbOff.dy,
    T_CROSSBAR.halfHeight,
  );
  return { fatBar, crossbar };
}

export default {
  letter: 't',
  build,
  joinSegs,
  exportOutlines,
  rule: T_RULE,
  refCenter: T_REF_CENTER,
  joinAnchors: T_JOIN_ANCHORS,
  variantSupport: VARIANT_SUPPORT,
  variantExports: [
    ['',     { entry: 'low',  exit: 'low' }],    // mid-word default
    ['init', { entry: 'none', exit: 'low' }],    // word-initial ("to", "the")
    ['isol', { entry: 'none', exit: 'none' }],   // standalone — the traced base
    // No fina: like m, the low exit connector doubles as the kept
    // word-final stroke (table: rule.y-bottom~).
  ],
};
