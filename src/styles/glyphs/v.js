/**
 * glyphs/v.js — Matlack lowercase 'v'.
 * Per-letter descriptor module; see glyphs/t.js for the pattern.
 */
import {
  buildRibbon, buildTaperedRibbon, smoothStep, sampleSegments,
} from './helpers.js';

const V_REF_CENTER = { x: 28, y: 29 };  // entrance flick end / downstroke top

// Entrance flick
const V_ENTRANCE_SEGS = [
  [[2.57,50.49],[2.13,50.13],[21.50,24.18],[28.14,29.58]],
];

const V_ENTRANCE = { startWidth: 1.0, taperPower: 1.7, liftPoint: 1.0 };

// V-stroke: downstroke + upstroke combined
const V_STROKE_SEGS = [
  // Downstroke
  [[28.08,28.93],[28.08,28.93],[30.89,34.29],[30.89,34.29]],
  [[30.89,34.29],[33.80,38.05],[14.67,60.15],[17.29,63.11]],
  [[17.29,63.11],[15.73,63.91],[19.42,73.42],[22.58,71.81]],
  [[22.58,71.81],[23.26,72.98],[31.69,71.22],[30.78,69.66]],
  // Upstroke flick
  [[30.63,70.47],[31.82,71.82],[69.19,31.78],[65.48,27.92]],
];

function vStrokeWidth(t, scale) {
  // Entry from top: moderate thickening
  if (t < 0.08) return smoothStep(3.0, 5.0, t / 0.08) * scale;

  // Main descent: fat
  if (t < 0.30) return 5.0 * scale;

  // Bottom turnaround: thin
  if (t < 0.45) return smoothStep(5.0, 1.5, (t - 0.30) / 0.15) * scale;

  // Upstroke: thickening
  if (t < 0.70) return smoothStep(1.5, 4.0, (t - 0.45) / 0.25) * scale;

  // Approaching exit junction: moderate
  if (t < 0.90) return smoothStep(4.0, 3.0, (t - 0.70) / 0.20) * scale;

  // End: moderate
  return 3.0 * scale;
}

// Fat exit: stays thick, not a hairline. Curves down then goes right.
const V_EXIT_SEGS = [
  [[65.51,27.99],[65.44,27.91],[58.23,42.67],[59.64,44.33]],
  [[59.64,44.33],[58.79,44.81],[61.50,50.10],[63.64,48.87]],
  [[63.64,48.87],[63.13,49.72],[82.66,49.92],[83.30,48.85]],
];

function vExitWidth(t, scale) {
  // Starts moderate, stays fat throughout
  if (t < 0.15) return smoothStep(3.0, 4.5, t / 0.15) * scale;
  if (t < 0.70) return 4.5 * scale;
  return smoothStep(4.5, 2.0, (t - 0.70) / 0.30) * scale;
}

/**
 * Render a Matlack-style lowercase 'v'.
 * Components: entrance flick + V-stroke ribbon + fat exit ribbon.
 */
function build(cx, cy, scale, dpr, overrides) {
  const strokeCenter = sampleSegments(
    V_STROKE_SEGS,
    Array.from({ length: V_STROKE_SEGS.length }, (_, i) => i),
    12, cx, cy, scale, V_REF_CENTER
  );
  const strokeQuads = buildRibbon(strokeCenter, (t) => vStrokeWidth(t, scale));
  const strokeFills = strokeQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  const entrCenter = sampleSegments(
    V_ENTRANCE_SEGS, [0], 12, cx, cy, scale, V_REF_CENTER
  );
  const entrReversed = [...entrCenter].reverse();
  const entrQuads = buildTaperedRibbon(
    entrReversed, 4.0 * scale, V_ENTRANCE.taperPower, V_ENTRANCE.liftPoint,
  );
  const entrFills = entrQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  const exitCenter = sampleSegments(
    V_EXIT_SEGS,
    Array.from({ length: V_EXIT_SEGS.length }, (_, i) => i),
    12, cx, cy, scale, V_REF_CENTER
  );
  const exitQuads = buildRibbon(exitCenter, (t) => vExitWidth(t, scale));
  const exitFills = exitQuads.map(quad => ({ points: quad, pressure: 0.85 }));

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

function exportOutlines(overrides) {
  return { stroke: 'ribbon', exit: 'ribbon' };
}

export default {
  letter: 'v',
  build,
  exportOutlines,
};
