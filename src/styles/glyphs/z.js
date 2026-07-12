/**
 * glyphs/z.js — Matlack lowercase 'z'.
 * Per-letter descriptor module; see glyphs/t.js for the pattern.
 */
import {
  resolveOffset, buildRibbon, buildTaperedRibbon, smoothStep, scaleEllipse, sampleSegments, sampleEllipse,
} from './helpers.js';
import { fBarBowlWidth, fBarBowlDensity } from './f.js';

const Z_REF_CENTER = { x: 50, y: 34 };  // entry flick end / weird stroke start

// Entry flick
const Z_ENTRY_SEGS = [
  [[11.96,67.92],[11.96,67.92],[50.28,33.68],[50.28,33.68]],
];

const Z_ENTRY = { startWidth: 1.0, taperPower: 1.7, liftPoint: 1.0 };

// Main weird stroke — the zigzag z-shape
const Z_STROKE_SEGS = [
  [[49.25,33.43],[48.45,33.77],[48.29,43.03],[50.55,42.07]],
  [[50.55,42.07],[49.32,43.83],[56.40,50.00],[58.39,47.79]],
  [[58.39,47.79],[58.39,47.79],[77.14,35.58],[77.14,35.58]],
  [[77.14,35.58],[75.00,32.83],[30.64,70.68],[31.51,71.79]],
  [[31.51,71.79],[31.13,71.18],[50.02,65.76],[50.92,67.20]],
  [[50.92,67.20],[52.69,66.46],[62.02,78.76],[57.88,80.51]],
  [[57.88,80.51],[57.88,80.51],[58.06,84.23],[58.06,84.23]],
];

// Width: blob at top, fat diagonal, thin turnaround, fat return, thins to bar-bowl
function zStrokeWidth(t, scale) {
  // Top blob
  if (t < 0.08) return 3.5 * scale;

  // First arm going right: moderate
  if (t < 0.20) return smoothStep(3.5, 3.0, (t - 0.08) / 0.12) * scale;

  // Diagonal descent: fattening
  if (t < 0.45) return smoothStep(3.0, 5.0, (t - 0.20) / 0.25) * scale;

  // Turnaround at bottom of diagonal
  if (t < 0.55) return smoothStep(5.0, 2.0, (t - 0.45) / 0.10) * scale;

  // Return stroke going up-right: thickening
  if (t < 0.75) return smoothStep(2.0, 4.5, (t - 0.55) / 0.20) * scale;

  // Descending to bar-bowl junction: thinning
  return smoothStep(4.5, 2.0, (t - 0.75) / 0.25) * scale;
}

// Bar-bowl (descender loop)
const Z_BAR_BOWL = {
  inner: {
    cx: 27.9, cy: 129.7,
    a: 32.6, b: 7.5, tilt: -48.9
  },
  outer: {
    cx: 28.2, cy: 129.4,
    a: 46.9, b: 12.9, tilt: -46.4   // tilt diff 5.6°
  },
};

// Reuse 'f' bar-bowl width — proven formula
const zBarBowlWidth = fBarBowlWidth;

const zBarBowlDensity = fBarBowlDensity;

// Exit flick
const Z_EXIT_SEGS = [
  [[56.46,87.45],[56.46,87.45],[108.06,46.49],[108.06,46.49]],
];

const Z_EXIT = { startWidth: 2.0, taperPower: 1.7, liftPoint: 0.85 };

/**
 * Render a Matlack-style lowercase 'z'.
 * Components: entry flick + zigzag weird stroke + bar-bowl loop + exit flick.
 */
function build(cx, cy, scale, dpr, overrides) {
  // Bar-bowl (descender loop)
  const bbOff = resolveOffset('barBowl', { dx: 0, dy: -8 }, overrides, dpr);  // review round 2
  const bbInner = scaleEllipse(Z_BAR_BOWL.inner, cx + bbOff.dx, cy + bbOff.dy, scale, Z_REF_CENTER);
  const bbOuter = scaleEllipse(Z_BAR_BOWL.outer, cx + bbOff.dx, cy + bbOff.dy, scale, Z_REF_CENTER);

  // Main weird stroke (zigzag z-shape)
  const strokeCenter = sampleSegments(
    Z_STROKE_SEGS,
    Array.from({ length: Z_STROKE_SEGS.length }, (_, i) => i),
    12, cx, cy, scale, Z_REF_CENTER
  );
  const strokeQuads = buildRibbon(strokeCenter, (t) => zStrokeWidth(t, scale));
  const strokeFills = strokeQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  // Entry flick (reversed taper)
  const entrCenter = sampleSegments(
    Z_ENTRY_SEGS, [0], 12, cx, cy, scale, Z_REF_CENTER
  );
  const entrReversed = [...entrCenter].reverse();
  const entrQuads = buildTaperedRibbon(
    entrReversed, 3.5 * scale, Z_ENTRY.taperPower, Z_ENTRY.liftPoint,
  );
  const entrFills = entrQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  // Exit flick
  const exitCenter = sampleSegments(
    Z_EXIT_SEGS, [0], 12, cx, cy, scale, Z_REF_CENTER
  );
  const exitQuads = buildTaperedRibbon(
    exitCenter, Z_EXIT.startWidth * scale, Z_EXIT.taperPower, Z_EXIT.liftPoint,
  );
  const exitFills = exitQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  return {
    bowls: [
      {
        outer: bbOuter,
        inner: bbInner,
        widthFn: zBarBowlWidth,
        densityFn: zBarBowlDensity,
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

function exportOutlines(overrides) {
  return { barBowl: { inner: sampleEllipse(Z_BAR_BOWL.inner), outer: sampleEllipse(Z_BAR_BOWL.outer) } };
}

export default {
  letter: 'z',
  build,
  exportOutlines,
};
