/**
 * glyphs/w.js — Matlack lowercase 'w'.
 * Per-letter descriptor module; see glyphs/t.js for the pattern.
 */
import {
  resolveOffset, scalePolygon, buildRibbon, buildTaperedRibbon, smoothStep, sampleSegments,
} from './helpers.js';

const W_REF_CENTER = { x: 43, y: 32 };  // entrance flick end / first descent top

// Entrance flick — extended further left and steepened to separate
// from the first descent visually.
const W_ENTRANCE_SEGS = [
  [[-5,78],[-5,78],[42.95,31.91],[42.95,31.91]],
];

const W_ENTRANCE = { startWidth: 1.0, taperPower: 1.7, liftPoint: 1.0 };

// Combined stroke: initial downstroke → second flick → second downstroke → third flick
const W_STROKE_SEGS = [
  // Initial downstroke
  [[44.45,32.90],[44.02,32.90],[10.60,68.37],[17.49,70.34]],
  // Second flick (swoops back up-right)
  [[17.75,70.95],[17.61,70.84],[21.73,78.17],[22.64,78.85]],
  [[22.64,78.85],[31.57,84.37],[82.61,35.35],[81.78,34.80]],
  // Second downstroke
  [[81.99,34.88],[81.99,34.88],[53.62,61.64],[57.58,65.04]],
  [[57.58,65.04],[56.39,65.49],[58.29,71.36],[61.55,70.13]],
  // Third flick (swoops up to blob)
  [[62.28,70.17],[63.40,73.47],[77.91,72.53],[77.69,71.87]],
  [[77.69,71.87],[85.14,74.26],[112.96,34.03],[111.61,33.60]],
];

// Width function: two descent cycles, like 'm' but with the flow reversed.
// descent → thin turnaround → rise → descent → thin turnaround → rise → thins to blob
function wStrokeWidth(t, scale) {
  // First descent: fat
  if (t < 0.12) return smoothStep(3.0, 5.0, t / 0.12) * scale;

  // First turnaround: thin
  if (t < 0.20) return smoothStep(5.0, 1.5, (t - 0.12) / 0.08) * scale;

  // First rise / second flick: thickening
  if (t < 0.35) return smoothStep(1.5, 4.0, (t - 0.20) / 0.15) * scale;

  // Transition to second descent
  if (t < 0.45) return smoothStep(4.0, 5.0, (t - 0.35) / 0.10) * scale;

  // Second descent: fat
  if (t < 0.55) return 5.0 * scale;

  // Second turnaround: thin
  if (t < 0.63) return smoothStep(5.0, 1.5, (t - 0.55) / 0.08) * scale;

  // Second rise / third flick: thickening then thinning to blob
  if (t < 0.78) return smoothStep(1.5, 4.0, (t - 0.63) / 0.15) * scale;
  if (t < 0.90) return smoothStep(4.0, 2.5, (t - 0.78) / 0.12) * scale;

  // Approaching blob: thin
  return smoothStep(2.5, 1.0, (t - 0.90) / 0.10) * scale;
}

// Ink blob at third peak
const W_BLOB_SEGS = [
  [[109.23,24.35],[108.06,24.31],[97.96,32.65],[99.07,32.68]],
  [[99.07,32.68],[97.85,33.74],[101.20,44.33],[102.88,43.06]],
  [[102.88,43.06],[102.94,44.62],[109.14,44.79],[109.12,44.08]],
  [[109.12,44.08],[109.43,44.79],[119.63,41.39],[118.97,39.92]],
  [[118.97,39.92],[120.24,40.15],[120.91,27.76],[120.52,27.70]],
  [[120.52,27.70],[121.28,26.01],[112.14,19.51],[110.11,24.05]],
];

const W_BLOB_OFFSET = { dx: -4, dy: -4 };  // review round 1, candidate 1

// Exit flick — extended further right for visibility
const W_EXIT_SEGS = [
  [[109.38,37.28],[109.59,37.54],[145.00,35.00],[145.00,35.00]],
];

const W_EXIT = { startWidth: 2.0, taperPower: 1.7, liftPoint: 0.90 };

const W_EXIT_OFFSET = { dx: 0, dy: 0 };

function build(cx, cy, scale, dpr, overrides) {
  // Combined stroke ribbon
  const strokeCenter = sampleSegments(
    W_STROKE_SEGS,
    Array.from({ length: W_STROKE_SEGS.length }, (_, i) => i),
    12, cx, cy, scale, W_REF_CENTER
  );
  const strokeQuads = buildRibbon(strokeCenter, (t) => wStrokeWidth(t, scale));
  const strokeFills = strokeQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  // Entrance flick (reversed taper)
  const entrCenter = sampleSegments(
    W_ENTRANCE_SEGS, [0], 12, cx, cy, scale, W_REF_CENTER
  );
  const entrReversed = [...entrCenter].reverse();
  const entrQuads = buildTaperedRibbon(
    entrReversed, 4.0 * scale, W_ENTRANCE.taperPower, W_ENTRANCE.liftPoint,
  );
  const entrFills = entrQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  // Ink blob
  const blobOff = resolveOffset('blob', W_BLOB_OFFSET, overrides, dpr);
  const blobScale = overrides.blob ?? {};
  let blob = sampleSegments(
    W_BLOB_SEGS,
    Array.from({ length: W_BLOB_SEGS.length }, (_, i) => i),
    12, cx + blobOff.dx, cy + blobOff.dy, scale, W_REF_CENTER
  );
  blob = scalePolygon(blob, blobScale.sx ?? 1, blobScale.sy ?? 1);

  // Exit flick
  const exitOff = resolveOffset('exitFlick', W_EXIT_OFFSET, overrides, dpr);
  const exitCenter = sampleSegments(
    W_EXIT_SEGS, [0], 12,
    cx + exitOff.dx, cy + exitOff.dy, scale, W_REF_CENTER
  );
  const exitQuads = buildTaperedRibbon(
    exitCenter, W_EXIT.startWidth * scale, W_EXIT.taperPower, W_EXIT.liftPoint,
  );
  const exitFills = exitQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  return {
    bowls: [
    ],
    fills: [
      ...strokeFills,
    ...entrFills,
    { points: blob, pressure: 0.85 },
    ...exitFills,
    ],
  };
}

function exportOutlines(overrides) {
  return { stroke: 'ribbon', blob: 'filled-blob' };
}

export default {
  letter: 'w',
  build,
  exportOutlines,
};
