/**
 * glyphs/h.js — Matlack lowercase 'h'.
 * Per-letter descriptor module; see glyphs/t.js for the pattern.
 */
import {
  resolveOffset, buildRibbon, buildTaperedRibbon, buildConnectorRibbon, smoothStep, scaleEllipse, sampleSegments, sampleEllipse, resolveVariantPure,
} from './helpers.js';
import { fBarBowlWidth, fBarBowlDensity } from './f.js';

// Reference center: use the downstroke top as the anchor — all components
// are traced in the same image so they'll align correctly.
const H_REF_CENTER = { x: 61.13, y: 105.06 };

// Bar-bowl (tall stem) — using 'f' bar-bowl proportions for the inner
// semi-minor (b reduced from 8.7→5.5 to widen the ink gap).
// Ellipse centers shifted down 20px to close the gap between the
// fitted bar-bowl bottom and the downstroke top.
// Bar-bowl ellipse centers nudged so the bottom tip lands on the
// downstroke top (61.1, 105.1). Tip 2 was at (72.4, 110.6) —
// shift both centers by (-11, -5.5) to close the gap.
const H_BAR_BOWL = {
  inner: {
    cx: 90.2, cy: 69.1,
    a: 46.1, b: 5.5, tilt: -51.4
  },
  outer: {
    cx: 102.4, cy: 53.9,
    a: 59.5, b: 12.9, tilt: -49.5
  },
};

// Bar-bowl width/density — same pattern as 'b'/'f' bar-bowls
// Reuse 'f' bar-bowl width/density — same stem shape, proven parameters.
const hBarBowlWidth = fBarBowlWidth;

const hBarBowlDensity = fBarBowlDensity;

// Entrance flick (leading stroke from bottom-left)
const H_ENTRANCE_SEGS = [
  [[11.17,136.91],[12.18,137.70],[58.52,109.99],[56.28,108.23]],
];

const H_ENTRANCE = {
  startWidth: 1.0,
  taperPower: 1.7,
  liftPoint: 1.0,
};

// Downstroke + hump as one continuous path.
// The pen goes: down the fat bar → bottom → sweeps up into the hump → exit.
// Combining them because they're one continuous pen motion.
const H_STROKE_SEGS = [
  // Downstroke portion — starts 15px up the bar-bowl axis from the base
  // so the fat ribbon covers the bar-bowl's vanishing bottom tip.
  // Original base: (61.13, 105.06). Bar-bowl tilt ~-51°, so "up" is
  // (+15*cos(51°), -15*sin(51°)) ≈ (+9.4, -11.7)
  //
  // NOTE: the review-round-1 offset (dx 4, dy -4, candidate 3) is BAKED
  // into these coordinates (trace coords + (4, -4)) and H_STROKE_OFFSET
  // is now zero. resolveOffset scales by dpr but NOT by size/100, so a
  // live offset meant "4 su" at render size 100 (where GLYPH_RULES,
  // anchors, and compose_word.py live) but only "2 su" at font-export
  // size 200 — the font's h stroke landed ~2 su off its anchors and
  // split the h→e seam. Baking freezes the size-100 interpretation at
  // every size.
  [[74.5,89.3],[74.5,89.3],[31.22,153.87],[31.22,153.87]],
  // Hump portion (curves up and around)
  [[32.35,155.16],[32.35,155.16],[57.74,122.56],[57.74,122.56]],
  [[57.74,122.56],[54.34,120.13],[89.90,99.12],[95.49,103.12]],
  [[95.49,103.12],[96.43,103.07],[102.96,122.12],[97.05,122.39]],
  [[97.05,122.39],[96.91,121.29],[80.75,136.38],[81.17,139.91]],
  [[81.17,139.91],[78.65,140.13],[76.38,151.43],[81.49,150.98]],
  [[81.49,150.98],[81.11,150.79],[93.99,151.75],[94.28,151.90]],
  [[94.28,151.90],[96.57,150.82],[125.51,128.24],[124.73,129.48]],
];

const H_STROKE_OFFSET = { dx: 0, dy: 0 };  // baked into H_STROKE_SEGS above

// Combined downstroke+hump width function. t = arc-length fraction.
// The downstroke is roughly the first ~20% of the path (straight fat bar),
// then the hump curves up and around for the remaining ~80%.
function hStrokeWidth(t, scale) {
  // Downstroke: fat bar
  if (t < 0.10) return 5.0 * scale;

  // Downstroke bottom → hump entry: thinning at the turnaround
  if (t < 0.18) return smoothStep(5.0, 1.5, (t - 0.10) / 0.08) * scale;

  // Hump rising: thickening back up (less than the downstroke)
  if (t < 0.35) return smoothStep(1.5, 3.5, (t - 0.18) / 0.17) * scale;

  // Hump arch: moderate-fat
  if (t < 0.50) return 3.5 * scale;

  // Hump descending: thinning
  if (t < 0.65) return smoothStep(3.5, 2.5, (t - 0.50) / 0.15) * scale;

  // Bottom curve: moderate
  if (t < 0.80) return 3.0 * scale;

  // Thinning to hairline exit
  if (t < 0.92) return smoothStep(3.0, 0.7, (t - 0.80) / 0.12) * scale;

  // Hairline exit
  return 0.7 * scale;
}

// Rule lines in h's RENDERED frame — i.e. trace coords with
// H_STROKE_OFFSET (+4, -4) folded in, since the stroke (feet, hump) is
// what defines the rules and it renders shifted. In trace coords:
// yCenter from the hump-start knob (61.13, 105.06 — same anatomy anchor
// M_RULE used), agreeing with the arch max (~104.5); yBottom weighted
// toward the hump's baseline crawl (y ≈ 155–156) with the downstroke
// foot overshooting to ~159 (0.05 xh, like to/05's t foot). xh 51.5.
// yTop from the tops-reach-~90% convention (bar-bowl ink, unshifted,
// tops out at y ≈ 8); ascender ≈ 2.8 xh — consistent with f and the
// isolated t.
const H_RULE = { yTop: -8, yCenter: 101, yBottom: 152.5 };

// Mid-word low entrance — band-true slice of to/01 path3 (derive_band.py
// low --xh 51.5 --ybottom 152.5 --anchor-x -0.71 --skip-head 12.1
// --fade-len 6; the entrance renders unshifted, so render-frame rules),
// bridged onto the traced entrance line. A first attempt extended the
// traced hang as a straight line (the r recipe) — it crossed t's
// band-true exit at a shallow angle instead of riding it (t→h coart
// 0.07), the same mixed-pair failure e's dip had; only a slice of the
// same trace can coarticulate with a band-true partner. The slice end
// (1.25, 142.0) lands ~2 su off the traced entrance line, so the bridge
// just eases the band tangent (−38°) onto the line's (−32.5°) and the
// traced entrance carries on to the downstroke junction (56.28, 108.23).
// The traced hang form (H_ENTRANCE_SEGS) remains the word-initial entry.
const H_ENTRANCE_LOW_SEGS = [
  // Band-true slice; anchor (-0.71, 144.48) at 15.6% x-height.
  [[-16.23, 151.89], [-15.44, 151.74], [-14.88, 151.57], [-14.67, 151.38]],
  [[-14.67, 151.38], [-13.11, 152.41], [-6.56, 148.06], [1.25, 142.0]],
  // Bridge (authored): band → traced entrance line.
  [[1.25, 142.0], [4.02, 139.86], [8.22, 138.79], [11.17, 136.91]],
  // The traced entrance, word-initial start point → junction.
  [[11.17, 136.91], [11.17, 136.91], [56.28, 108.23], [56.28, 108.23]],
];

// Connector, body→tip render order: holds hairline through the anchor
// (anchor sits at ~0.79 of arc from the body side), fades over the tip.
const H_ENTRANCE_LOW = { hairline: 0.56, fadeStart: 0.83 };

// Mid-word exit connector — band-true slice of to/01 path3 (the canonical
// LOW band; derive_band.py low --xh 51.5 --ybottom 156.5 --anchor-x 118.59
// --fade-len 6). anchor-x was chosen so the trace START lands on the
// hump's baseline valley (90.28, 155.90) — where H_STROKE_SEGS' last
// segment (the traced h→next tail from the "hi/hu" scan) begins. That
// traced tail rises at ~36° while the canonical band crawls the baseline
// first (13 su apart mid-band), so exit-low variants TRUNCATE the tail
// and use this slice instead — the tail stays in exit:'none' forms as
// the kept word-final stroke (table: h exit rule.y-bottom.). Anchor
// (118.59, 148.48) = the canonical low scan point through this slice's
// transform, 15.6% x-height.
// (Coordinates are derive_band.py output + the baked (4, -4) stroke
// shift, so the slice start meets the baked hump valley (94.28, 151.90).)
const H_EXIT_BAND_SEGS = [
  // Bridge (authored): starts ON the body centerline ~3.4 su back so the
  // ribbon emerges from inside the valley ink. Without it the slice
  // start sat 0.5 su past the body ribbon's end cap — connected at
  // compose scale by sampling luck, but a separate ink island in the
  // integer-unit font (h glyph split into body + floating exit).
  [[90.9, 151.66], [92.0, 151.9], [93.3, 152.2], [94.28, 152.41]],
  [[94.28, 152.41], [93.79, 152.85], [107.36, 152.52], [108.63, 151.38]],
  [[108.63, 151.38], [110.19, 152.41], [116.74, 148.06], [124.55, 142.0]],
];

// hairline rule-consistent (0.65 × 51.5/60); fadeStart holds full width
// ~1 su past the anchor (30.4 su of the 33.3 su slice, plus the ~3.5 su
// bridge) — the profile that put t→o over the 0.6 coarticulation bar.
const H_EXIT_CONN = { hairline: 0.56, fadeStart: 0.948 };

// Join anchors — curs attach points in h's RENDERED frame (see H_RULE's
// comment: the exit rides the stroke, so H_STROKE_OFFSET is folded into
// its anchor; the entrance renders unshifted).
const H_JOIN_ANCHORS = {
  entry: {
    // On the extended entrance line at the low-join convention height
    // (15.6% x-height above the rendered baseline). No afterHigh entry yet.
    low: { x: -0.71, y: 144.47 },
  },
  // The canonical low scan point through H_EXIT_BAND_SEGS's transform,
  // plus H_STROKE_OFFSET: (118.59, 148.48) + (4, -4). 15.6% x-height.
  exit: { x: 122.59, y: 144.48 },
};

const VARIANT_SUPPORT = {
    supported: [
      { entry: 'low',  exit: 'low' },       // mid-word default
      { entry: 'none', exit: 'low' },       // word-initial ("the" mid-word h is low-low; this is "hi...")
      { entry: 'none', exit: 'none' },      // isol — traced base incl. the h→next tail
      { entry: 'low',  exit: 'none' },      // word-final after low exit (tail kept per table)
    ],
    notYet: [
      { entry: 'high', exit: 'low' },       // after b/f/o/v/w — no afterHigh entry traced
      { entry: 'high', exit: 'none' },
      { entry: 'low',  exit: 'flourish' },
      { entry: 'none', exit: 'flourish' },
    ],
  };

/**
 * Render a Matlack-style lowercase 'h'.
 * Components: entrance flick + bar-bowl + combined downstroke/hump ribbon.
 */
function build(cx, cy, scale, dpr, overrides, variant = undefined) {
  variant = resolveVariantPure(VARIANT_SUPPORT, variant, 'h');

  // ── Bar-bowl (tall stem) ──────────────────────────────────────
  const inner = scaleEllipse(H_BAR_BOWL.inner, cx, cy, scale, H_REF_CENTER);
  const outer = scaleEllipse(H_BAR_BOWL.outer, cx, cy, scale, H_REF_CENTER);

  // ── Combined downstroke + hump (one continuous variable-width ribbon) ──
  // H_STROKE_SEGS' last segment is the traced h→next tail from the
  // "hi/hu" scan. exit:'low' variants truncate it (the band-true
  // connector below replaces it — see H_EXIT_BAND_SEGS' comment);
  // exit:'none' keeps it as the word-final/isol stroke. When truncating,
  // remap the width function's arc fraction so the profile stays pinned
  // to the same geometry instead of compressing into the shorter path.
  const strokeOff = resolveOffset('stroke', H_STROKE_OFFSET, overrides, dpr);
  const truncate = variant.exit === 'low';
  const fullIdxs = [0, 1, 2, 3, 4, 5, 6, 7];
  const strokeIdxs = truncate ? [0, 1, 2, 3, 4, 5, 6] : fullIdxs;
  const strokeCenter = sampleSegments(
    H_STROKE_SEGS, strokeIdxs, 12,
    cx + strokeOff.dx, cy + strokeOff.dy, scale, H_REF_CENTER
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
      H_STROKE_SEGS, fullIdxs, 12,
      cx + strokeOff.dx, cy + strokeOff.dy, scale, H_REF_CENTER
    );
    widthFrac = polyLen(strokeCenter) / polyLen(fullCenter);
  }
  const strokeQuads = buildRibbon(strokeCenter, (t) => hStrokeWidth(t * widthFrac, scale));
  const strokeFills = strokeQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'body' }));

  // ── Entrance ─────────────────────────────────────────────────
  // entry 'none' (word-initial/isol): the traced hang form — tapered
  // ribbon, thick at the downstroke junction.
  // entry 'low' (mid-word): the same line extended down through the low
  // join band (H_ENTRANCE_LOW_SEGS), rendered as a connector hairline.
  let entrFills;
  if (variant.entry === 'low') {
    const entrCenter = sampleSegments(
      H_ENTRANCE_LOW_SEGS,
      Array.from({ length: H_ENTRANCE_LOW_SEGS.length }, (_, i) => i),
      12, cx, cy, scale, H_REF_CENTER
    );
    const entrReversed = [...entrCenter].reverse();
    const entrQuads = buildConnectorRibbon(
      entrReversed,
      H_ENTRANCE_LOW.hairline * scale,
      H_ENTRANCE_LOW.fadeStart,
      { bodyWidth: 5.0 * scale, blendEnd: 0.25 },
    );
    entrFills = entrQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'entrance' }));
  } else {
    const entrCenter = sampleSegments(
      H_ENTRANCE_SEGS, [0], 12, cx, cy, scale, H_REF_CENTER
    );
    const entrReversed = [...entrCenter].reverse();
    const entrQuads = buildTaperedRibbon(
      entrReversed,
      5.0 * scale,  // match downstroke width at junction
      H_ENTRANCE.taperPower,
      H_ENTRANCE.liftPoint,
    );
    entrFills = entrQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'entrance' }));
  }

  // ── Exit connector (band-true slice; see H_EXIT_BAND_SEGS) ───
  // Segs carry the baked stroke shift, so the slice start meets the
  // hump valley in every frame; strokeOff is zero now but kept in the
  // sampling call so a review-grid override still moves both together.
  let exitFills = [];
  if (variant.exit === 'low') {
    const exitCenter = sampleSegments(
      H_EXIT_BAND_SEGS,
      Array.from({ length: H_EXIT_BAND_SEGS.length }, (_, i) => i),
      12, cx + strokeOff.dx, cy + strokeOff.dy, scale, H_REF_CENTER
    );
    const exitQuads = buildConnectorRibbon(
      exitCenter,
      H_EXIT_CONN.hairline * scale,
      H_EXIT_CONN.fadeStart,
    );
    exitFills = exitQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'exit' }));
  }

  return {
    bowls: [
      {
        outer: outer,
        inner: inner,
        widthFn: hBarBowlWidth,
        densityFn: hBarBowlDensity,
        overlayFills: [
      ...strokeFills,
      ...entrFills,
      ...exitFills,
    ],
      },
    ],
    fills: [
    ],
  };
}

// Connector chains feeding h's join anchors (mirrors build's seg pick).
function joinSegs(v) {
    return {
      entry: v.entry === 'low' ? H_ENTRANCE_LOW_SEGS : H_ENTRANCE_SEGS,
      exit:  v.exit === 'low'  ? H_EXIT_BAND_SEGS : null,
    };
}

function exportOutlines(overrides) {
  return { barBowl: { inner: sampleEllipse(H_BAR_BOWL.inner), outer: sampleEllipse(H_BAR_BOWL.outer) } };
}

export default {
  letter: 'h',
  build,
  joinSegs,
  exportOutlines,
  variantSupport: VARIANT_SUPPORT,
  rule: H_RULE,
  refCenter: H_REF_CENTER,
  joinAnchors: H_JOIN_ANCHORS,
  variantExports: [
    ['',          { entry: 'low',  exit: 'low' }],    // mid-word default
    ['init',      { entry: 'none', exit: 'low' }],    // word-initial
    ['isol',      { entry: 'none', exit: 'none' }],   // standalone — traced base incl. tail
    ['fina',      { entry: 'low',  exit: 'none' }],   // word-final: keeps the traced tail
  ],
};
