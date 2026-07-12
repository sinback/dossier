/**
 * glyphs/j.js — Matlack lowercase 'j'.
 * Per-letter descriptor module; see glyphs/t.js for the pattern.
 */
import {
  resolveOffset, buildRibbon, buildTaperedRibbon, smoothStep, scaleEllipse, sampleSegments, sampleEllipse, BOWL_PHASE,
} from './helpers.js';

// REF_CENTER at x-height midline so 'j' aligns vertically with other letters.
// Original junction was (112.22, 156.02); entrance flick meets downstroke at y≈97.
const J_REF_CENTER = { x: 139, y: 97 };

const J_BAR_BOWL = {
  inner: {
    cx: 66.6, cy: 198.7,
    a: 40.0, b: 6.6, tilt: -42.6   // FAIR fit (egg GOOD at 0.035)
  },
  outer: {
    cx: 72.0, cy: 192.9,
    a: 62.4, b: 13.9, tilt: -41.2  // GOOD fit (0.084), tilt diff 3.8°
  },
};

// Bar-bowl width — moderate variation (tilt diff 3.8°)
function jBarBowlWidth(arcFracRaw) {
  const f = (arcFracRaw + BOWL_PHASE) % 1.0;
  if (f < 0.10) return smoothStep(0.45, 0.70, f / 0.10);
  if (f < 0.40) return smoothStep(0.70, 1.0, (f - 0.10) / 0.30);
  if (f < 0.60) return 1.0;
  if (f < 0.90) return smoothStep(1.0, 0.70, (f - 0.60) / 0.30);
  return smoothStep(0.70, 0.45, (f - 0.90) / 0.10);
}

function jBarBowlDensity() { return 0.85; }

// Downstroke (fat bar from top down to bar-bowl)
const J_DOWNSTROKE_SEGS = [
  [[155.11,78.54],[155.11,78.54],[139.01,97.49],[139.01,97.49]],
  [[139.01,97.49],[132.43,104.48],[107.70,159.56],[109.39,157.77]],
];

const J_DOWNSTROKE_HALF_WIDTH = 5.0;

const J_DOWNSTROKE_OFFSET = { dx: 4, dy: -4 };  // review round 1, candidate 3

// Dot
const J_DOT_SEGS = [
  [[193.80,10.52],[192.68,10.27],[185.10,18.39],[185.90,18.57]],
  [[185.90,18.57],[184.69,19.90],[185.42,26.24],[186.18,25.39]],
  [[186.18,25.39],[184.70,26.12],[189.20,28.42],[193.06,26.63]],
  [[193.06,26.63],[195.03,24.88],[201.91,16.75],[201.23,17.42]],
  [[201.23,17.42],[201.58,17.58],[203.53,10.07],[202.23,9.56]],
  [[202.23,9.56],[200.26,8.49],[193.24,9.75],[194.58,10.57]],
];

const J_DOT_OFFSET = { dx: 0, dy: 0 };

// Entrance flick
const J_ENTRANCE_SEGS = [
  [[94.50,130.54],[94.50,130.54],[141.85,97.40],[141.85,97.40]],
];

const J_ENTRANCE = {
  startWidth: 1.0,
  taperPower: 1.7,
  liftPoint: 1.0,
};

// Exit flick
const J_EXIT_SEGS = [
  [[114.58,145.95],[115.26,146.07],[161.50,119.55],[161.50,119.55]],
];

const J_EXIT = {
  startWidth: 3.0,
  taperPower: 1.7,
  liftPoint: 0.85,
};

const J_EXIT_OFFSET = { dx: 3, dy: 4 };  // review round 3 (fine), candidate 4

/**
 * Render a Matlack-style lowercase 'j'.
 * Components: dot + entrance flick + downstroke + bar-bowl (bottom loop) + exit flick.
 */
function build(cx, cy, scale, dpr, overrides) {
  // ── Bar-bowl (bottom loop) ────────────────────────────────────
  const inner = scaleEllipse(J_BAR_BOWL.inner, cx, cy, scale, J_REF_CENTER);
  const outer = scaleEllipse(J_BAR_BOWL.outer, cx, cy, scale, J_REF_CENTER);

  // ── Downstroke (curved, rendered as constant-width ribbon) ────
  const dsOff = resolveOffset('downstroke', J_DOWNSTROKE_OFFSET, overrides, dpr);
  const dsCenter = sampleSegments(
    J_DOWNSTROKE_SEGS, [0, 1], 12,
    cx + dsOff.dx, cy + dsOff.dy, scale, J_REF_CENTER
  );
  const dsQuads = buildRibbon(dsCenter, () => J_DOWNSTROKE_HALF_WIDTH * scale);
  const dsFills = dsQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  // ── Entrance flick (reversed taper) ───────────────────────────
  const entrCenter = sampleSegments(
    J_ENTRANCE_SEGS, [0], 12, cx, cy, scale, J_REF_CENTER
  );
  const entrReversed = [...entrCenter].reverse();
  const entrQuads = buildTaperedRibbon(
    entrReversed,
    J_DOWNSTROKE_HALF_WIDTH * scale,
    J_ENTRANCE.taperPower,
    J_ENTRANCE.liftPoint,
  );
  const entrFills = entrQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  // ── Exit flick (tapered ribbon from bar-bowl junction) ────────
  const exitOff = resolveOffset('exitFlick', J_EXIT_OFFSET, overrides, dpr);
  const exitCenter = sampleSegments(
    J_EXIT_SEGS, [0], 12, cx + exitOff.dx, cy + exitOff.dy, scale, J_REF_CENTER
  );
  const exitQuads = buildTaperedRibbon(
    exitCenter,
    J_EXIT.startWidth * scale,
    J_EXIT.taperPower,
    J_EXIT.liftPoint,
  );
  const exitFills = exitQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  // ── Dot ────────────────────────────────────────────────────────
  const dotOff = resolveOffset('dot', J_DOT_OFFSET, overrides, dpr);
  const dot = sampleSegments(
    J_DOT_SEGS, [0, 1, 2, 3, 4, 5], 12,
    cx + dotOff.dx, cy + dotOff.dy, scale, J_REF_CENTER
  );

  return {
    bowls: [
      {
        outer: outer,
        inner: inner,
        widthFn: jBarBowlWidth,
        densityFn: jBarBowlDensity,
        overlayFills: [
      ...dsFills,
      ...entrFills,
      ...exitFills,
      { points: dot, pressure: 0.85 },
    ],
      },
    ],
    fills: [
    ],
  };
}

function exportOutlines(overrides) {
  return { barBowl: { inner: sampleEllipse(J_BAR_BOWL.inner), outer: sampleEllipse(J_BAR_BOWL.outer) } };
}

export default {
  letter: 'j',
  build,
  exportOutlines,
};
