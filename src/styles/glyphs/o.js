/**
 * glyphs/o.js — Matlack lowercase 'o'.
 * Per-letter descriptor module; see glyphs/t.js for the pattern.
 */
import {
  buildConnectorRibbon, smoothStep, scaleEllipse, sampleSegments, sampleEllipse, resolveVariantPure, BOWL_PHASE, ARC_PRESS, ARC_RISE,
} from './helpers.js';

// Reference anchor: center of 'o's inner ellipse in ref o/03.
// Image: reference/lowercase/o/03.png (75×66, 1x from high-res facsimile)
const O_REF_CENTER = { x: 40.3, y: 33.5 };

// Rule-line y-values in o's local frame.
// o's bowl reaches from about y=3 (top, at θ where the tilted outer ellipse
// peaks) to y=63 (bottom). rule.y-top is extrapolated — o doesn't extend
// into the ascender zone.
const O_RULE = { yTop: -57, yCenter: 3, yBottom: 63 };

// Join anchors — curs attach points in o's local frame.
//   entry: top-left of the bowl (~θ=-π/2 on the tilted outer ellipse),
//          where both low and high entry flicks terminate at the body.
//   exit:  upper-right of the bowl at ~rule.y-center height. o.exit is
//          "strong" (per the rules table) so this anchor governs how a
//          following letter lines up.
// Join-height convention (canonical, from the two human-picked anchors):
//   low joins  at 15% of x-height above rule.y-bottom (sinback's to/01
//   t.exit anchor: 4.4 su / 28 su x-height = 15.7%)
//   high joins at 68.5% (r.entry.high, the most scan-tuned high anchor)
// Every letter's anchors must hit these percentages in its own rule frame,
// or curs attachment accumulates baseline drift letter-by-letter.
const O_JOIN_ANCHORS = {
  entry: {
    // low: sinback's to/01 scan anchor (41.25, 71.64) mapped through the
    // entrance slice's placement transform (scale 2.143, see
    // O_ENTRANCE_DEFAULT_SEGS). 15.6% x-height by rule consistency.
    low:  { x: -7.91, y: 53.66 },
    // high: ON the afterHigh entrance flick, at its closest approach to
    // the 71.6% high-join height (flick min-y is 20.87 = 69.3%; residual
    // drift vs convention -0.8 su, inside the 1.5 su tolerance). The old
    // (27.3, 22.4) was the flick's body-side terminus, not a join point.
    high: { x: 13.67, y: 20.87 },
  },
  // Exit font-anchor from sinback's scan-space o.exit (46.22, 30.11) in
  // 'or/01' via the structural alignment transform. 71.6% x-height — the
  // high-join convention height (matched by r.entry.high).
  exit:  { x: 90.73, y: 20.06 },
};

const O_STRUCTURAL_ANCHORS = {
  bowlCenter: { x: 40.3, y: 33.5 },  // inner ellipse center (= O_REF_CENTER)
  // Topmost point of the outer ellipse (at rule.y-center). Where the
  // pen emerges from the bowl on its way out. Anchor for the left end
  // of O_EXIT_SEGS so the flick starts flush with the bowl.
  bowlTop:    { x: 59.66, y:  3.40 },
};

// Exit-connector Bezier segments in o's local frame.
//
// Band-true slice rule: the portion of a connector inside the join band is
// a rule-consistent-scale copy of the shared trace (or/01 path2), pinned at
// sinback's scan anchor (46.22, 30.11) → local (90.73, 20.06), scale
// 60/xh_scan = 2.325. The receiving glyph's slice (R_ENTRANCE_AFTERHIGH_SEGS)
// is a same-scale copy of the same trace, so the curs overlay reconstructs
// the trace exactly. Any adaptation to this glyph's own body happens in the
// authored BRIDGE segment on the bowl side — never by warping the band.
// (The pre-hiatus version stretched path2's first ~2 scan-units across the
// whole bowl→band span, because our o/03-fitted bowl is smaller than the
// or/01 o bowl; that warp is why the two strokes couldn't coarticulate.)
const O_EXIT_SEGS = [
  // Bridge (authored): bowl top → trace start, riding the bowl's top curve.
  [[59.66,  3.40], [63.50,  4.40], [67.40,  5.40], [70.99,  6.55]],
  // Trace: path2 seg1 — the reversal dip leaving the bowl.
  [[70.99,  6.55], [69.74,  6.97], [71.71, 25.69], [75.62, 24.38]],
  // Trace: path2 seg2 — rises through the anchor toward r; ends ~5 su past
  // the anchor (the fade tail).
  [[75.62, 24.38], [75.22, 25.41], [95.54, 19.53], [96.24, 17.69]],
];

// Connector, not a lift: hairline holds through the anchor (at arc-length
// fraction 0.886), fades over the tail.
const O_EXIT = { hairline: 0.6, fadeStart: 0.886 };

// ── 'o' bowl ellipses ────────────────────────────────────────────────────────
// Automated fit via scipy Nelder-Mead crescent model (93.8% → 86.2% constrained).
// Tilt constrained to match across inner/outer (known from a/b/f).
// Inner/outer ratio: a=0.54, b=0.71 — similar to 'a'.
const O_BOWL = {
  inner: {
    cx: 40.3,    // = O_REF_CENTER.x
    cy: 33.5,    // = O_REF_CENTER.y
    a: 20.8,     // semi-major
    b: 10.8,     // semi-minor
    tilt: -45.5  // consistent with a (-44.9), b (-43.5), f (-48.8)
  },
  outer: {
    cx: 38.2,    // offset from inner: (-2.1, -0.4) — nearly concentric
    cy: 33.1,
    a: 38.8,     // outer/inner ratio: 1.87× (very close to a's 1.46× and b's 1.89×)
    b: 15.3,     // outer/inner ratio: 1.42×
    tilt: -45.5  // same as inner — 0° tilt diff (most uniform of all letters)
  },
};

// Entrance flick — default (o after @low_exit).
// Enters from ~rule.y-bottom with horizontal-rightward tangent, bows
// downward (stays low) as the pen continues from the preceding letter's
// y-bottom exit, then sweeps up to meet the top-left of the bowl at the
// bowl's own tangent direction (≈ (+0.70, -0.71) at θ=-π/2).
// Band-true slice of the canonical LOW-band trace: to/01 path3 seg B
// ('t Exit Flick → o Entry'), rule-consistent scale 60/28 = 2.143, pinned
// at sinback's scan anchor (41.25, 71.64) → local (-7.91, 53.66). The
// slice runs from the trace (trimmed at local x = -24 to stay in frame)
// up to bowl-attach height; the authored BRIDGE segment covers the last
// ~6 su into the bowl attach point (27.3, 22.4), arriving ~46°. This is
// the long, leftward entrance the scan shows — the pen climbs from near
// baseline (left of the whole bowl) up to the bowl top-left.
const O_ENTRANCE_DEFAULT_SEGS = [
  // Trace slice (seg B, t ∈ [0.011, 0.733], de Casteljau sub-curve).
  [[-24.0, 61.79],[-19.58, 63.48],[8.54, 39.58],[23.3, 26.5]],
  // Bridge (authored): slice end → bowl attach, continuing the ~42° climb.
  [[23.3, 26.5],[24.6, 25.1],[26.0, 23.8],[27.3, 22.4]],
];

// Connector: anchor sits at arc-length fraction ~0.71 measured body → tip;
// width holds ~7 su past the anchor before fading over the tip stretch
// (the previous letter's exit slice is full-width there — the two
// crossfade along the SAME curve).
const O_ENTRANCE_DEFAULT = { hairline: 0.6, fadeStart: 0.60 };

// Entrance flick — afterHigh variant (o after @high_exit = b/f/v/w, or after strong o-exit).
// Enters at ~rule.y-center and arrives at the top-left of the bowl (~θ=-π/2 in
// ref ellipse coords, at (27.3, 22.4)).
const O_ENTRANCE_AFTERHIGH_SEGS = [
  [[4, 22],[12, 20],[20, 21],[27.3, 22.4]],
];

// Connector: anchor (13.67, 20.87) sits at ~0.6 of arc length body → tip,
// so the fade must not start before that.
const O_ENTRANCE_AFTERHIGH = { hairline: 0.6, fadeStart: 0.6 };

// ── 'o' bowl width function ──────────────────────────────────────────────────
// Very similar to 'a' — thickest on the bottom-left (pen slowest),
// thinnest at the top (pen fastest). No downstroke overlap zone,
// so the upper-right is just thin like the top.
// 'o' is slightly more uniform than 'a' since there's no downstroke
// interaction distorting the width profile.
function oBowlWidth(arcFracRaw) {
  const f = (arcFracRaw + BOWL_PHASE) % 1.0;

  // Top: thin. Pen moves fast across the top of the bowl.
  if (f < 0.20) return 0.25;

  // Left side: thin→fat. Pen decelerates.
  if (f < ARC_PRESS) { const t = (f - 0.20) / (ARC_PRESS - 0.20); return smoothStep(0.25, 1.0, t); }

  // Bottom-left: peak width. Pen at slowest.
  if (f < ARC_RISE) return 1.0;

  // Bottom-right: fat→thin. Pen accelerates back up.
  if (f < 0.95) return smoothStep(1.0, 0.25, (f - ARC_RISE) / 0.17);

  // Upper-right: thin, returning to top.
  return 0.25;
}

// ── 'o' bowl density ─────────────────────────────────────────────────────────
function oBowlDensity(arcFracRaw) {
  const f = (arcFracRaw + BOWL_PHASE) % 1.0;
  // Slightly lighter at the thin top, solid everywhere else.
  if (f < 0.20) return 0.70;
  return 0.85;
}

const VARIANT_SUPPORT = {
    supported: [
      { entry: 'low',  exit: 'high' },
      { entry: 'high', exit: 'high' },
      { entry: 'none', exit: 'high' },      // init form (word-start)
      { entry: 'none', exit: 'none' },      // isol (standalone "o")
    ],
    notYet: [
      // o's exit-flick geometry isn't rendered yet, so exit:'high' and
      // exit:'none' produce the same shape today. Promoted {none, high}
      // to supported because semantically it's valid for word-initial o
      // and renders correctly (bare bowl) until the exit flick is added.
      { entry: 'low',  exit: 'none' },      // fina after low-exiting letter
      { entry: 'high', exit: 'none' },      // fina after high-exiting letter
    ],
  };

function build(cx, cy, scale, dpr, overrides, variant = { entry: 'low', exit: 'high' }) {
  variant = resolveVariantPure(VARIANT_SUPPORT, variant, 'o');

  const inner = scaleEllipse(O_BOWL.inner, cx, cy, scale, O_REF_CENTER);
  const outer = scaleEllipse(O_BOWL.outer, cx, cy, scale, O_REF_CENTER);

  // Entrance flick depends on variant.entry.
  let entrSegs = null, entrParams = null;
  if (variant.entry === 'high') {
    entrSegs = O_ENTRANCE_AFTERHIGH_SEGS;
    entrParams = O_ENTRANCE_AFTERHIGH;
  } else if (variant.entry === 'low') {
    entrSegs = O_ENTRANCE_DEFAULT_SEGS;
    entrParams = O_ENTRANCE_DEFAULT;
  }
  // 'none' → no entry stroke; entrSegs stays null.

  // Optional CW rotation of the low-entry flick around its junction (P3)
  // with the bowl. Used for iterating on the flick's angle; in y-down image
  // coords, math CCW rotation visually reads as CW on the page.
  if (entrSegs && variant.entry === 'low' && overrides.defaultEntryRotation) {
    const rad = overrides.defaultEntryRotation * Math.PI / 180;
    const c = Math.cos(rad), s = Math.sin(rad);
    entrSegs = entrSegs.map(seg => {
      const [px, py] = seg[3];
      return seg.map((p, i) => {
        if (i === 3) return p;
        const dx = p[0] - px, dy = p[1] - py;
        return [dx * c - dy * s + px, dx * s + dy * c + py];
      });
    });
  }

  let entrFills = [];
  if (entrSegs) {
    const entrCenter = sampleSegments(
      entrSegs,
      Array.from({ length: entrSegs.length }, (_, i) => i),
      12, cx, cy, scale, O_REF_CENTER,
    );
    // Reversed → body-to-tip order, so the connector fade lands at the tip
    // (the free end reaching toward the previous letter).
    const entrReversed = [...entrCenter].reverse();
    const entrQuads = buildConnectorRibbon(
      entrReversed,
      entrParams.hairline * scale,
      entrParams.fadeStart,
    );
    entrFills = entrQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'entrance' }));
  }

  // Exit connector when variant.exit === 'high'. Geometry is path2 from
  // 'or/01' (o Exit → r Entry) up to the font-anchor plus a short fade
  // tail, in o's glyph local frame. Hairline width — mid-word connectors
  // are continuous strokes, not pen lifts.
  let exitFills = [];
  if (variant.exit === 'high') {
    const exitCenter = sampleSegments(
      O_EXIT_SEGS,
      Array.from({ length: O_EXIT_SEGS.length }, (_, i) => i),
      12, cx, cy, scale, O_REF_CENTER,
    );
    const exitQuads = buildConnectorRibbon(
      exitCenter,
      O_EXIT.hairline * scale,
      O_EXIT.fadeStart,
    );
    exitFills = exitQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'exit' }));
  }

  return {
    bowls: [
      {
        outer: outer,
        inner: inner,
        widthFn: oBowlWidth,
        densityFn: oBowlDensity,
      },
    ],
    fills: [
      ...entrFills,
      ...exitFills,
    ],
  };
}

// Connector chains feeding o's join anchors (mirrors build's seg pick).
function joinSegs(v) {
    return {
      entry: v.entry === 'high' ? O_ENTRANCE_AFTERHIGH_SEGS
           : v.entry === 'low'  ? O_ENTRANCE_DEFAULT_SEGS : null,
      exit:  v.exit === 'high' ? O_EXIT_SEGS : null,
    };
}

function exportOutlines() {
  return {
    bowl: { inner: sampleEllipse(O_BOWL.inner), outer: sampleEllipse(O_BOWL.outer) },
  };
}

export default {
  letter: 'o',
  build,
  joinSegs,
  exportOutlines,
  variantSupport: VARIANT_SUPPORT,
  rule: O_RULE,
  refCenter: O_REF_CENTER,
  joinAnchors: O_JOIN_ANCHORS,
  structuralAnchors: O_STRUCTURAL_ANCHORS,
  outerEllipse: { outer: O_BOWL.outer, refCenter: O_REF_CENTER },
  variantExports: [
    ['',          { entry: 'low',  exit: 'high' }],   // mid-word default
    ['afterHigh', { entry: 'high', exit: 'high' }],   // after b/f/o/v/w
    ['init',      { entry: 'none', exit: 'high' }],   // word-initial
    ['isol',      { entry: 'none', exit: 'none' }],   // standalone (no neighbors)
  ],
};
