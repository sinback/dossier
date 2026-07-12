/**
 * glyphs/x.js — Matlack lowercase 'x'.
 * Per-letter descriptor module; see glyphs/t.js for the pattern.
 */
import {
  resolveOffset, buildRibbon, smoothStep, sampleSegments,
} from './helpers.js';

const X_REF_CENTER = { x: 65, y: 50 };  // crossing point

// Right crescent: upper-right → center → lower-right
const X_RIGHT_SEGS = [
  [[92.38,34.37],[93.06,35.01],[96.05,28.55],[94.22,26.81]],
  [[94.22,26.81],[94.73,25.08],[77.88,30.71],[76.11,36.68]],
  [[76.11,36.68],[75.37,36.51],[64.58,51.34],[65.13,51.58]],
  [[65.13,51.58],[65.11,51.67],[55.33,64.98],[60.31,69.40]],
  [[60.31,69.40],[59.63,69.81],[66.05,75.56],[67.49,74.67]],
  [[67.49,74.67],[67.49,74.67],[74.23,74.30],[74.23,74.30]],
  [[74.23,74.30],[74.23,74.30],[97.68,63.73],[97.68,63.73]],
];

// Left crescent: upper-left → center → lower-left
const X_LEFT_SEGS = [
  [[38.89,36.59],[38.62,36.04],[65.47,17.26],[67.42,21.23]],
  [[67.42,21.23],[69.04,21.09],[69.56,40.82],[67.41,41.01]],
  [[67.41,41.01],[68.42,41.55],[55.54,59.93],[53.19,58.67]],
  [[53.19,58.67],[53.83,60.05],[28.16,73.52],[27.47,71.72]],
  [[27.47,71.72],[27.57,72.25],[16.15,71.91],[16.86,68.45]],
  [[16.86,68.45],[12.61,67.31],[22.25,52.59],[24.56,53.21]],
];

const X_LEFT_OFFSET = { dx: 0, dy: 0 };

// Symmetric lens width: thin at tips, fat in the middle.
// Minimum width 1.0 to prevent sub-pixel disappearance at small zoom levels.
function xCrescentWidth(t, scale) {
  const d = Math.abs(t - 0.50);
  if (d < 0.10) return 5.0 * scale;
  if (d < 0.35) return smoothStep(5.0, 2.0, (d - 0.10) / 0.25) * scale;
  return smoothStep(2.0, 1.0, (d - 0.35) / 0.15) * scale;
}

function build(cx, cy, scale, dpr, overrides) {
  // Right crescent
  const rightCenter = sampleSegments(
    X_RIGHT_SEGS,
    Array.from({ length: X_RIGHT_SEGS.length }, (_, i) => i),
    12, cx, cy, scale, X_REF_CENTER
  );
  const rightQuads = buildRibbon(rightCenter, (t) => xCrescentWidth(t, scale));
  const rightFills = rightQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  // Left crescent (with position override)
  const leftOff = resolveOffset('leftCrescent', X_LEFT_OFFSET, overrides, dpr);
  const leftCenter = sampleSegments(
    X_LEFT_SEGS,
    Array.from({ length: X_LEFT_SEGS.length }, (_, i) => i),
    12, cx + leftOff.dx, cy + leftOff.dy, scale, X_REF_CENTER
  );
  const leftQuads = buildRibbon(leftCenter, (t) => xCrescentWidth(t, scale));
  const leftFills = leftQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  return {
    bowls: [
    ],
    fills: [
      ...rightFills,
    ...leftFills,
    ],
  };
}

function exportOutlines(overrides) {
  return { rightCrescent: 'ribbon', leftCrescent: 'ribbon' };
}

export default {
  letter: 'x',
  build,
  exportOutlines,
};
