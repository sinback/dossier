/**
 * glyphs/m.js — Matlack lowercase 'm'.
 * Per-letter descriptor module; see glyphs/t.js for the pattern.
 */
import {
  buildRibbon, buildTaperedRibbon, buildConnectorRibbon, smoothStep, sampleSegments, resolveVariantPure,
} from './helpers.js';

const M_REF_CENTER = { x: 79.20, y: 37.62 };  // humps centerline start

const M_HUMPS_SEGS = [
  [[79.20,37.62],[79.97,37.56],[82.09,39.36],[81.72,42.28]],
  [[81.72,42.28],[83.45,43.32],[49.19,87.98],[47.11,86.73]],
  [[47.11,86.73],[47.09,86.72],[69.15,68.97],[71.01,68.53]],
  [[71.01,68.53],[71.01,68.53],[105.86,44.17],[105.86,44.17]],
  [[105.86,44.17],[105.97,43.34],[114.98,41.12],[116.11,43.29]],
  [[116.11,43.29],[117.39,44.45],[117.72,51.34],[117.18,53.49]],
  [[117.18,53.49],[115.07,58.96],[95.83,84.14],[94.43,83.73]],
  [[94.43,83.73],[94.23,83.72],[115.64,64.34],[118.34,62.81]],
  [[118.34,62.81],[118.26,61.19],[151.15,43.01],[152.18,42.91]],
  [[152.18,42.91],[154.76,40.48],[160.19,46.03],[159.74,47.86]],
  [[159.74,47.86],[157.37,53.72],[138.24,77.90],[138.10,77.69]],
  [[138.10,77.69],[136.56,81.83],[138.45,85.50],[142.90,86.60]],
  [[142.90,86.60],[143.22,87.67],[154.93,86.08],[155.30,85.54]],
  [[155.30,85.54],[157.38,84.82],[183.40,67.70],[183.23,67.59]],
];

// Entrance — three forms.
// init: the traced m/01 entrance verbatim — isolated-letter traces are the
// word-INITIAL form (kept per the rules table, m entry '.').
const M_ENTRANCE_INIT_SEGS = [
  [[30.51,72.89],[31.01,72.18],[75.35,32.18],[79.40,37.67]],
];

const M_ENTRANCE_INIT = { startWidth: 1.0, taperPower: 1.7, liftPoint: 1.0 };

// low (mid-word after low exits): band-true slice of to/01 path3
// (derive_band.py low --xh 49.1 --ybottom 86.7 --anchor-x 22 --skip-head 10)
// + authored bridge easing the 38° climb into the humps start.
const M_ENTRANCE_LOW_SEGS = [
  [[5.49, 86.36],[7.10, 86.18],[8.35, 85.93],[8.69, 85.63]],
  [[8.69, 85.63],[12.90, 88.40],[55.11, 50.23],[54.93, 50.10]],
  [[54.93, 50.10],[63.00, 44.30],[72.00, 39.60],[79.20, 37.62]],
];

// high (after b/f/o/v/w): band-true slice of or/01 path2 (derive_band.py
// high --xh 49.1 --ybottom 86.7 --anchor-x 62.55 --skip-head 23). The trace
// end lands 0.6 su above the humps start — the same trace-end-=-body-start
// structure the or/01 scan shows for o→r.
const M_ENTRANCE_HIGH_SEGS = [
  [[55.41, 54.12],[60.24, 52.78],[66.71, 50.59],[67.06, 49.66]],
  [[67.06, 49.66],[69.25, 51.16],[80.39, 39.05],[79.20, 38.21]],
];

// hairline rule-consistent (0.65 × 49.1/60). Anchors sit at body→tip arc
// fractions 0.79 (low, incl. 28 su bridge) / 0.80 (high); fadeStart holds
// hairline ~3-5 su PAST the anchor tip-ward so the pre-anchor overlap band
// stays full-width (fading at the anchor starves the coarticulation zone).
const M_ENTRANCE_CONN = { hairline: 0.53, fadeStartLow: 0.85, fadeStartHigh: 0.90 };

// Rule lines — trace-derived (the m/01 crop has no visible paper rules):
// yCenter = the entrance knob top / humps start height, yBottom = the hump
// valleys (~86.7). yTop nominal (m has no ascender).
const M_RULE = { yTop: -11.5, yCenter: 37.6, yBottom: 86.7 };

// Join anchors. entry anchors are the canonical band scan points through
// each slice's transform; exit sits ON the final traced stroke at 15.6%
// x-height — not band-true yet (same status r→e had pre-conversion), fine
// until an m→x pair becomes a close-study target.
const M_JOIN_ANCHORS = {
  entry: {
    low:  { x: 22.0,  y: 79.05 },
    high: { x: 62.55, y: 51.6 },
  },
  exit: { x: 165.93, y: 79.04 },
};

// Width function for the double-hump centerline.
// Two hump cycles: each goes thin (turnaround) → fat (arch) → thin (descent).
// The centerline has roughly:
//   0-5%:   initial small loop/blob
//   5-20%:  first descent (fat)
//  20-30%:  first turnaround (thin)
//  30-42%:  first hump arch (fat)
//  42-50%:  second descent (fat)
//  50-58%:  second turnaround (thin)
//  58-70%:  second hump arch (fat)
//  70-80%:  second descent (fat)
//  80-90%:  bottom loop
//  90-100%: exit flick (hairline)
function mHumpsWidth(t, scale) {
  // Initial blob/loop
  if (t < 0.05) return 3.0 * scale;

  // First descent
  if (t < 0.18) return smoothStep(3.0, 5.0, (t - 0.05) / 0.13) * scale;

  // First turnaround (thin)
  if (t < 0.28) return smoothStep(5.0, 1.5, (t - 0.18) / 0.10) * scale;

  // First hump rising
  if (t < 0.38) return smoothStep(1.5, 4.0, (t - 0.28) / 0.10) * scale;

  // First hump arch + second descent
  if (t < 0.50) return smoothStep(4.0, 5.0, (t - 0.38) / 0.12) * scale;

  // Second turnaround (thin)
  if (t < 0.58) return smoothStep(5.0, 1.5, (t - 0.50) / 0.08) * scale;

  // Second hump rising
  if (t < 0.68) return smoothStep(1.5, 4.0, (t - 0.58) / 0.10) * scale;

  // Second hump arch + descent
  if (t < 0.78) return smoothStep(4.0, 3.5, (t - 0.68) / 0.10) * scale;

  // Bottom loop
  if (t < 0.88) return smoothStep(3.5, 2.5, (t - 0.78) / 0.10) * scale;

  // Exit flick (hairline)
  return smoothStep(2.5, 0.7, (t - 0.88) / 0.12) * scale;
}

const VARIANT_SUPPORT = {
    supported: [
      { entry: 'low',  exit: 'low' },
      { entry: 'high', exit: 'low' },       // afterHigh
      { entry: 'none', exit: 'low' },       // word-initial (traced flourish)
    ],
    notYet: [],
  };

/**
 * Render a Matlack-style lowercase 'm'.
 * Components: entrance flick + double-hump ribbon.
 */
function build(cx, cy, scale, dpr, overrides, variant = { entry: 'low', exit: 'low' }) {
  variant = resolveVariantPure(VARIANT_SUPPORT, variant, 'm');

  // Double-hump centerline as variable-width ribbon
  const humpsCenter = sampleSegments(
    M_HUMPS_SEGS,
    Array.from({ length: M_HUMPS_SEGS.length }, (_, i) => i),
    12, cx, cy, scale, M_REF_CENTER
  );
  const humpsQuads = buildRibbon(humpsCenter, (t) => mHumpsWidth(t, scale));
  const humpsFills = humpsQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'body' }));

  // Entrance: word-initial keeps the traced flourish (lift-taper); mid-word
  // forms are band-true connectors.
  const entrSegs = variant.entry === 'high' ? M_ENTRANCE_HIGH_SEGS
                 : variant.entry === 'none' ? M_ENTRANCE_INIT_SEGS
                 : M_ENTRANCE_LOW_SEGS;
  const entrCenter = sampleSegments(
    entrSegs,
    Array.from({ length: entrSegs.length }, (_, i) => i),
    12, cx, cy, scale, M_REF_CENTER
  );
  const entrReversed = [...entrCenter].reverse();
  const entrQuads = variant.entry === 'none'
    ? buildTaperedRibbon(
        entrReversed,
        4.0 * scale,
        M_ENTRANCE_INIT.taperPower,
        M_ENTRANCE_INIT.liftPoint,
      )
    : buildConnectorRibbon(
        entrReversed,
        M_ENTRANCE_CONN.hairline * scale,
        variant.entry === 'high' ? M_ENTRANCE_CONN.fadeStartHigh
                                 : M_ENTRANCE_CONN.fadeStartLow,
      );
  const entrFills = entrQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'entrance' }));

  return {
    bowls: [
    ],
    fills: [
      ...humpsFills,
    ...entrFills,
    ],
  };
}

// Connector chains feeding m's join anchors (mirrors build's seg pick).
function joinSegs(v) {
    return {
      entry: v.entry === 'high' ? M_ENTRANCE_HIGH_SEGS
           : v.entry === 'low'  ? M_ENTRANCE_LOW_SEGS : null,
      exit:  v.exit !== 'none' ? M_HUMPS_SEGS : null,
    };
}

function exportOutlines(overrides) {
  return { humps: 'single-stroke' };
}

export default {
  letter: 'm',
  build,
  joinSegs,
  exportOutlines,
  variantSupport: VARIANT_SUPPORT,
  rule: M_RULE,
  refCenter: M_REF_CENTER,
  joinAnchors: M_JOIN_ANCHORS,
  variantExports: [
    ['',          { entry: 'low',  exit: 'low' }],    // mid-word default
    ['afterHigh', { entry: 'high', exit: 'low' }],    // after b/f/o/v/w
    ['init',      { entry: 'none', exit: 'low' }],    // word-initial (traced flourish)
  ],
};
