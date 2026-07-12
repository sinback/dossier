/**
 * glyphs/i.js — Matlack lowercase 'i'.
 * Per-letter descriptor module; see glyphs/t.js for the pattern.
 */
import {
  resolveOffset, buildTaperedRibbon, sampleSegments,
} from './helpers.js';

const I_REF_CENTER = { x: 64.73, y: 69.56 };  // downstroke start

// Dot — small filled blob above the stroke. Matlack places these with
// disturbing consistency.
const I_DOT_SEGS = [
  [[92.43,7.14],[90.46,6.82],[87.37,16.67],[90.21,17.13]],
  [[90.21,17.13],[88.92,17.68],[89.20,24.98],[96.37,21.87]],
  [[96.37,21.87],[97.95,23.04],[108.73,12.87],[106.41,10.73]],
  [[106.41,10.73],[107.15,8.31],[104.17,4.24],[104.17,4.24]],
  [[104.17,4.24],[99.86,2.17],[91.80,6.84],[92.43,7.14]],
];

const I_DOT_OFFSET = { dx: 0, dy: 0 };

// Downstroke centerline
const I_DOWNSTROKE_SEGS = [
  [[64.73,69.56],[64.64,69.52],[26.29,117.96],[32.49,120.94]],
  [[32.49,120.94],[31.53,122.16],[43.40,124.72],[46.15,121.23]],
  [[46.15,121.23],[46.15,121.23],[85.89,86.53],[85.89,86.53]],
];

// Simple power taper — no piecewise needed. Starts fat, tapers at the exit.
const I_DOWNSTROKE = {
  startWidth: 5.0,
  taperPower: 1.7,
  liftPoint: 0.85,
};

const I_DOWNSTROKE_OFFSET = { dx: -4, dy: 4 };  // review round 1, candidate 7

// Entrance flick
const I_ENTRANCE_SEGS = [
  [[13.87,114.35],[13.87,114.35],[52.00,85.52],[52.00,85.52]],
];

const I_ENTRANCE = {
  startWidth: 1.0,
  taperPower: 1.7,
  liftPoint: 1.0,
};

/**
 * Render a Matlack-style lowercase 'i'.
 * Components: entrance flick + downstroke (power taper) + dot (filled blob).
 * No bowl, no piecewise width function — just clean tapered ribbons.
 */
function build(cx, cy, scale, dpr, overrides) {
  // ── Downstroke (power taper ribbon) ───────────────────────────
  const dsOff = resolveOffset('downstroke', I_DOWNSTROKE_OFFSET, overrides, dpr);
  const dsCenter = sampleSegments(
    I_DOWNSTROKE_SEGS, [0, 1, 2], 12,
    cx + dsOff.dx, cy + dsOff.dy, scale, I_REF_CENTER
  );
  const dsQuads = buildTaperedRibbon(
    dsCenter,
    I_DOWNSTROKE.startWidth * scale,
    I_DOWNSTROKE.taperPower,
    I_DOWNSTROKE.liftPoint,
  );
  const dsFills = dsQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  // ── Entrance flick (reversed taper) ───────────────────────────
  const entrCenter = sampleSegments(
    I_ENTRANCE_SEGS, [0], 12, cx, cy, scale, I_REF_CENTER
  );
  const entrReversed = [...entrCenter].reverse();
  const entrQuads = buildTaperedRibbon(
    entrReversed,
    I_DOWNSTROKE.startWidth * scale,
    I_ENTRANCE.taperPower,
    I_ENTRANCE.liftPoint,
  );
  const entrFills = entrQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  // ── Dot (filled blob) ─────────────────────────────────────────
  const dotOff = resolveOffset('dot', I_DOT_OFFSET, overrides, dpr);
  const dot = sampleSegments(
    I_DOT_SEGS, [0, 1, 2, 3, 4], 12,
    cx + dotOff.dx, cy + dotOff.dy, scale, I_REF_CENTER
  );

  return {
    bowls: [
    ],
    fills: [
      ...dsFills,
    ...entrFills,
    { points: dot, pressure: 0.85 },
    ],
  };
}

function exportOutlines(overrides) {
  return { downstroke: 'tapered-ribbon', dot: 'filled-blob' };
}

export default {
  letter: 'i',
  build,
  exportOutlines,
};
