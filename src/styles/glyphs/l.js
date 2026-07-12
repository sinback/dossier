/**
 * glyphs/l.js — Matlack lowercase 'l'.
 * Per-letter descriptor module; see glyphs/t.js for the pattern.
 */
import {
  buildRibbon, buildConnectorRibbon, smoothStep, sampleSegments, resolveVariantPure,
} from './helpers.js';

const L_REF_CENTER = { x: 68.0, y: 85.0 };  // approximate center

const L_LOOP_SEGS = [
  [[6.45,115.73],[8.73,122.60],[78.00,88.13],[92.15,63.53]],
  [[92.15,63.53],[92.94,64.21],[114.44,26.63],[108.32,21.33]],
  [[108.32,21.33],[106.84,14.70],[65.05,56.32],[65.99,60.52]],
  [[65.99,60.52],[66.01,59.89],[36.11,100.64],[35.99,103.79]],
  [[35.99,103.79],[35.88,103.58],[8.60,139.55],[10.89,143.86]],
  [[10.89,143.86],[9.35,144.16],[7.42,152.94],[17.84,150.92]],
  [[17.84,150.92],[18.02,151.85],[28.03,151.23],[27.72,149.62]],
  [[27.72,149.62],[27.72,149.62],[56.60,129.42],[56.60,129.42]],
];

// Rule lines — trace-derived (anatomy anchors, not scan eyeballing):
// yBottom from the baseline turn's valley (centerline bottoms at
// (20.34, 151.35)); ascender from the tops-reach-~90%-of-yTop convention
// with ascender ≈ 2.8 xh (f/t/h all agree): outer ink tops at y ≈ 6.1,
// so xh = (151.4 − 6.1)/2.8 ≈ 51.9 and yCenter = 99.5. Frame is nearly
// h's (xh 51.5), as expected for same-hand ascender letters.
const L_RULE = { yTop: -10, yCenter: 99.5, yBottom: 151.4 };

// Mid-word low entrance — band-true slice of to/01 path3 (derive_band.py
// low --xh 51.9 --ybottom 151.4 --anchor-x 0.6 --skip-head 12.1
// --fade-len 20), bridged onto the traced upstroke. The traced loop's
// seg 0 starts with a landing hook at a 69% x-height hang — the
// word-INITIAL form (r/t lesson); entry:'low' replaces it with this
// chain. fade-len 20 (not h's 6): the slice must stay band-true deep
// enough to cover the longest partner exit tail (e.exit holds the trace
// ~10 scan-su past the anchor) — with a 6-su cut, e's tail rode the
// authored bridge as unshared near-ink and el scored coart 0.43; the
// o-entrance precedent ("crossfade along the SAME curve") fixed it.
// The bridge is the band's rise continued straight into the ascender
// upstroke: G1 at both ends (slice-end tangent −40.5° vs chord −39.3°;
// seg-0 tangent −39.2° at the join point, which is the de Casteljau
// split of L_LOOP_SEGS[0] at t = 0.78).
const L_ENTRANCE_LOW_SEGS = [
  // Band-true slice; anchor (0.6, 143.32) at 15.6% x-height.
  [[-15.13, 150.8], [-14.29, 150.65], [-13.69, 150.47], [-13.47, 150.27]],
  [[-13.47, 150.27], [-10.9, 151.96], [5.11, 139.19], [18.11, 128.09]],
  // Bridge (authored): straight −39° rise, band → upstroke.
  [[18.11, 128.09], [37.1, 111.87], [56.74, 96.43], [76.11, 80.65]],
  // Traced upstroke tail (seg 0 split at t 0.78) → loop-top junction.
  [[76.11, 80.65], [83.26, 74.83], [89.04, 68.94], [92.15, 63.53]],
];

// Connector, body→tip render order: 139.3 su chain, anchor at ~0.867 of
// arc from the body side; hold hairline ~7 su past it (o's entrance
// profile), fading only over the tip, which overlaps the previous
// letter's full-width zone. hairline rule-consistent (0.65 × 51.9/60).
// bodyWidth 2.6 = the loop ribbon's width at the junction (lLoopWidth
// at full-path frac 0.279); blendEnd 0.17 = the traced-upstroke portion
// of the chain.
const L_ENTRANCE_LOW = { hairline: 0.56, fadeStart: 0.917 };

// Mid-word exit connector — band-true slice of to/01 path3 (the canonical
// LOW band; derive_band.py low --xh 51.9 --ybottom 151.4 --anchor-x 48.9
// --fade-len 6). anchor-x was chosen so the trace START (20.37, 151.31)
// lands dead center of the baseline turn's valley ink (centerline
// (20.34, 151.35), half-width ~1.5 there) — zero bridge, the t recipe.
// The traced l→next tail (L_LOOP_SEGS[7], rising at ~35° to a 42%
// x-height tip while the band crawls the baseline) is truncated in
// exit:'low' forms and kept for exit:'none' fina/isol (table: l exit
// rule.y-bottom. — kept word-finally). Anchor (48.9, 143.32) = the
// canonical low scan point through this slice's transform, 15.6% xh.
const L_EXIT_BAND_SEGS = [
  [[20.37, 151.31], [19.87, 151.75], [33.55, 151.42], [34.83, 150.27]],
  [[34.83, 150.27], [36.4, 151.3], [42.98, 146.94], [50.83, 140.86]],
];

// hairline rule-consistent (0.65 × 51.9/60); fadeStart holds full width
// ~1 su past the anchor (31.6 su of the 33.5 su slice) — the short-hold
// profile that put t→o over the 0.6 coarticulation bar.
const L_EXIT_CONN = { hairline: 0.56, fadeStart: 0.94 };

// Join anchors — curs attach points in l's local frame (no offsets on l;
// trace frame == rendered frame).
const L_JOIN_ANCHORS = {
  entry: {
    // The canonical low scan point through L_ENTRANCE_LOW_SEGS' slice
    // transform (15.6% x-height above baseline). No afterHigh entry yet
    // (l after b/f/o/v/w is a notYet variant).
    low: { x: 0.6, y: 143.32 },
  },
  // The canonical low scan point through L_EXIT_BAND_SEGS' transform.
  exit: { x: 48.9, y: 143.32 },
};

// Width function for l loop. Same shape as 'e' but the top portion
// is longer (ascender extends well above x-height).
function lLoopWidth(t, scale) {
  // Entry: thin (pen coming in from left)
  if (t < 0.10) return 1.5 * scale;

  // Rising to the top: slight thickening
  if (t < 0.25) return smoothStep(1.5, 2.5, (t - 0.10) / 0.15) * scale;

  // Top loop and descent: thickening through the long downstroke
  if (t < 0.50) return smoothStep(2.5, 5.5, (t - 0.25) / 0.25) * scale;

  // Bottom: peak width
  if (t < 0.65) return 5.5 * scale;

  // Right ascent + exit: thinning
  if (t < 0.85) return smoothStep(5.5, 1.5, (t - 0.65) / 0.20) * scale;

  // Exit flick
  return smoothStep(1.5, 0.5, (t - 0.85) / 0.15) * scale;
}

const VARIANT_SUPPORT = {
    supported: [
      { entry: 'low',  exit: 'low' },       // mid-word default
      { entry: 'none', exit: 'low' },       // word-initial ("lorem")
      { entry: 'none', exit: 'none' },      // isol — the traced base incl. the l→next tail
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
 * Render a Matlack-style lowercase 'l'.
 * Single continuous loop stroke, like 'e' but taller.
 */
function build(cx, cy, scale, dpr, overrides, variant = undefined) {
  variant = resolveVariantPure(VARIANT_SUPPORT, variant, 'l');

  // ── Body: the traced loop ─────────────────────────────────────────
  // seg 0 is the word-initial entrance sweep (69% x-height hang +
  // landing hook) — dropped in entry:'low' forms, where the band-true
  // connector (L_ENTRANCE_LOW_SEGS) carries the upstroke instead.
  // seg 7 is the traced l→next tail (word-final form) — truncated in
  // exit:'low' forms (see L_EXIT_BAND_SEGS' comment). When segs are
  // dropped, remap the width function's arc fraction so the profile
  // stays pinned to the same geometry (buildH precedent, generalized
  // to a dropped head segment).
  const fullIdxs = [0, 1, 2, 3, 4, 5, 6, 7];
  const firstIdx = variant.entry === 'low' ? 1 : 0;
  const lastIdx = variant.exit === 'low' ? 6 : 7;
  const bodyIdxs = fullIdxs.slice(firstIdx, lastIdx + 1);
  const bodyCenter = sampleSegments(
    L_LOOP_SEGS, bodyIdxs, 12, cx, cy, scale, L_REF_CENTER
  );
  const polyLen = (pts) => {
    let L = 0;
    for (let i = 1; i < pts.length; i++) {
      L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }
    return L;
  };
  let startFrac = 0, endFrac = 1;
  if (firstIdx !== 0 || lastIdx !== 7) {
    const fullLen = polyLen(sampleSegments(
      L_LOOP_SEGS, fullIdxs, 12, cx, cy, scale, L_REF_CENTER
    ));
    if (firstIdx !== 0) {
      startFrac = polyLen(sampleSegments(
        L_LOOP_SEGS, fullIdxs.slice(0, firstIdx), 12, cx, cy, scale, L_REF_CENTER
      )) / fullLen;
    }
    if (lastIdx !== 7) {
      endFrac = 1 - polyLen(sampleSegments(
        L_LOOP_SEGS, fullIdxs.slice(lastIdx + 1), 12, cx, cy, scale, L_REF_CENTER
      )) / fullLen;
    }
  }
  const bodyQuads = buildRibbon(
    bodyCenter,
    (t) => lLoopWidth(startFrac + t * (endFrac - startFrac), scale)
  );
  const bodyFills = bodyQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'body' }));

  // ── Entrance connector (band-true slice; see L_ENTRANCE_LOW_SEGS) ──
  // entry 'none' keeps the traced sweep inside the body ribbon above.
  let entrFills = [];
  if (variant.entry === 'low') {
    const entrCenter = sampleSegments(
      L_ENTRANCE_LOW_SEGS,
      Array.from({ length: L_ENTRANCE_LOW_SEGS.length }, (_, i) => i),
      12, cx, cy, scale, L_REF_CENTER
    );
    const entrReversed = [...entrCenter].reverse();
    const entrQuads = buildConnectorRibbon(
      entrReversed,
      L_ENTRANCE_LOW.hairline * scale,
      L_ENTRANCE_LOW.fadeStart,
      { bodyWidth: 2.6 * scale, blendEnd: 0.17 },
    );
    entrFills = entrQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'entrance' }));
  }

  // ── Exit connector (band-true slice; see L_EXIT_BAND_SEGS) ─────────
  // The slice's start sits dead center of the baseline turn's valley
  // ink, so there is no bridge (the t recipe).
  let exitFills = [];
  if (variant.exit === 'low') {
    const exitCenter = sampleSegments(
      L_EXIT_BAND_SEGS,
      Array.from({ length: L_EXIT_BAND_SEGS.length }, (_, i) => i),
      12, cx, cy, scale, L_REF_CENTER
    );
    const exitQuads = buildConnectorRibbon(
      exitCenter,
      L_EXIT_CONN.hairline * scale,
      L_EXIT_CONN.fadeStart,
    );
    exitFills = exitQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'exit' }));
  }

  return {
    bowls: [
    ],
    fills: [
      ...bodyFills,
      ...entrFills,
      ...exitFills,
    ],
  };
}

// Connector chains feeding l's join anchors (mirrors build's seg pick).
function joinSegs(v) {
    // entry 'none' keeps the traced sweep inside the body ribbon
    // (L_LOOP_SEGS seg 0) — no separate entrance segs.
    return {
      entry: v.entry === 'low' ? L_ENTRANCE_LOW_SEGS : null,
      exit:  v.exit === 'low'  ? L_EXIT_BAND_SEGS : null,
    };
}

function exportOutlines(overrides) {
  return { loop: 'single-stroke' };
}

export default {
  letter: 'l',
  build,
  joinSegs,
  exportOutlines,
  variantSupport: VARIANT_SUPPORT,
  rule: L_RULE,
  refCenter: L_REF_CENTER,
  joinAnchors: L_JOIN_ANCHORS,
  variantExports: [
    ['',          { entry: 'low',  exit: 'low' }],    // mid-word default
    ['init',      { entry: 'none', exit: 'low' }],    // word-initial ("lorem")
    ['isol',      { entry: 'none', exit: 'none' }],   // standalone — traced base incl. tail
    ['fina',      { entry: 'low',  exit: 'none' }],   // word-final: keeps the traced tail
  ],
};
