/**
 * glyphs/n.js — Matlack lowercase 'n'.
 * Per-letter descriptor module; see glyphs/t.js for the pattern.
 */
import {
  buildRibbon, buildTaperedRibbon, smoothStep, sampleSegments,
} from './helpers.js';

const N_REF_CENTER = { x: 34.90, y: 27.43 };  // hump centerline start

const N_HUMP_SEGS = [
  [[34.90,27.43],[35.65,26.70],[39.17,32.06],[38.12,33.08]],
  [[38.12,33.08],[39.22,34.44],[19.99,70.45],[17.70,69.58]],
  [[17.70,69.58],[17.69,69.58],[68.59,23.88],[69.85,24.86]],
  [[69.85,24.86],[69.76,24.69],[76.26,24.29],[76.90,25.49]],
  [[76.90,25.49],[77.08,25.32],[81.47,29.88],[81.00,31.02]],
  [[81.00,31.02],[81.63,31.64],[80.74,35.22],[80.44,34.92]],
  [[80.44,34.92],[81.95,36.72],[61.19,65.07],[61.11,64.97]],
  [[61.11,64.97],[60.49,65.00],[61.12,70.45],[62.95,70.38]],
  [[62.95,70.38],[62.45,70.52],[66.90,73.14],[68.79,72.60]],
  [[68.79,72.60],[68.63,72.96],[75.98,72.92],[76.45,71.90]],
  [[76.45,71.90],[76.84,72.65],[94.67,54.23],[94.15,53.24]],
];

const N_ENTRANCE_SEGS = [
  [[3.35,54.91],[3.31,54.89],[28.12,27.81],[28.98,28.18]],
  [[28.98,28.18],[28.83,27.81],[34.31,26.43],[34.74,27.45]],
];

const N_ENTRANCE = { startWidth: 1.0, taperPower: 1.7, liftPoint: 1.0 };

// Width function for single hump. Same pattern as one cycle of 'm'.
function nHumpWidth(t, scale) {
  // Initial blob/loop at top
  if (t < 0.05) return 3.0 * scale;

  // First descent (fat)
  if (t < 0.20) return smoothStep(3.0, 5.0, (t - 0.05) / 0.15) * scale;

  // Turnaround (thin)
  if (t < 0.30) return smoothStep(5.0, 1.5, (t - 0.20) / 0.10) * scale;

  // Hump rising
  if (t < 0.42) return smoothStep(1.5, 4.0, (t - 0.30) / 0.12) * scale;

  // Hump arch (fat)
  if (t < 0.55) return 4.0 * scale;

  // Descent
  if (t < 0.70) return smoothStep(4.0, 3.5, (t - 0.55) / 0.15) * scale;

  // Bottom loop
  if (t < 0.82) return smoothStep(3.5, 2.5, (t - 0.70) / 0.12) * scale;

  // Exit flick (hairline)
  return smoothStep(2.5, 0.7, (t - 0.82) / 0.18) * scale;
}

/**
 * Render a Matlack-style lowercase 'n'.
 * Components: entrance flick + single-hump ribbon.
 */
function build(cx, cy, scale, dpr, overrides) {
  const humpCenter = sampleSegments(
    N_HUMP_SEGS,
    Array.from({ length: N_HUMP_SEGS.length }, (_, i) => i),
    12, cx, cy, scale, N_REF_CENTER
  );
  const humpQuads = buildRibbon(humpCenter, (t) => nHumpWidth(t, scale));
  const humpFills = humpQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  const entrCenter = sampleSegments(
    N_ENTRANCE_SEGS, [0, 1], 12, cx, cy, scale, N_REF_CENTER
  );
  const entrReversed = [...entrCenter].reverse();
  const entrQuads = buildTaperedRibbon(
    entrReversed,
    4.0 * scale,
    N_ENTRANCE.taperPower,
    N_ENTRANCE.liftPoint,
  );
  const entrFills = entrQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  return {
    bowls: [
    ],
    fills: [
      ...humpFills,
    ...entrFills,
    ],
  };
}

function exportOutlines(overrides) {
  return { hump: 'single-stroke' };
}

export default {
  letter: 'n',
  build,
  exportOutlines,
};
