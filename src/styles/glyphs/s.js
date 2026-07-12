/**
 * glyphs/s.js — Matlack lowercase 's'.
 * Per-letter descriptor module; see glyphs/t.js for the pattern.
 */
import {
  buildRibbon, buildTaperedRibbon, smoothStep, sampleSegments,
} from './helpers.js';

const S_REF_CENTER = { x: 68, y: 24 };  // entrance flick end / swoop start

// Entrance flick
const S_ENTRANCE_SEGS = [
  [[4.27,70.30],[4.27,70.30],[68.06,23.81],[68.31,24.20]],
];

const S_ENTRANCE = { startWidth: 1.0, taperPower: 1.7, liftPoint: 1.0 };

// Swoopy S-curve
const S_SWOOP_SEGS = [
  [[68.85,23.67],[67.85,22.85],[55.18,32.12],[57.52,33.90]],
  [[57.52,33.90],[60.61,34.28],[60.91,59.47],[55.03,58.49]],
  [[55.03,58.49],[56.07,60.15],[31.69,71.04],[30.74,69.50]],
  [[30.74,69.50],[30.18,70.83],[19.13,66.44],[20.95,62.60]],
  [[20.95,62.60],[16.98,61.44],[27.19,47.76],[28.33,48.08]],
];

// Width: nearly uniform, slight thinning at entry and exit
function sSwoopWidth(t, scale) {
  // Entry: thicken from junction
  if (t < 0.10) return smoothStep(3.5, 5.0, t / 0.10) * scale;

  // Main body: uniform fat
  if (t < 0.80) return 5.0 * scale;

  // Exit: slight thinning
  return smoothStep(5.0, 2.5, (t - 0.80) / 0.20) * scale;
}

function build(cx, cy, scale, dpr, overrides) {
  // Swoopy S-curve
  const swoopCenter = sampleSegments(
    S_SWOOP_SEGS,
    Array.from({ length: S_SWOOP_SEGS.length }, (_, i) => i),
    12, cx, cy, scale, S_REF_CENTER
  );
  const swoopQuads = buildRibbon(swoopCenter, (t) => sSwoopWidth(t, scale));
  const swoopFills = swoopQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  // Entrance flick (reversed taper)
  const entrCenter = sampleSegments(
    S_ENTRANCE_SEGS, [0], 12, cx, cy, scale, S_REF_CENTER
  );
  const entrReversed = [...entrCenter].reverse();
  const entrQuads = buildTaperedRibbon(
    entrReversed, 4.0 * scale, S_ENTRANCE.taperPower, S_ENTRANCE.liftPoint,
  );
  const entrFills = entrQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  return {
    bowls: [
    ],
    fills: [
      ...swoopFills,
    ...entrFills,
    ],
  };
}

function exportOutlines(overrides) {
  return { swoop: 'ribbon' };
}

export default {
  letter: 's',
  build,
  exportOutlines,
};
