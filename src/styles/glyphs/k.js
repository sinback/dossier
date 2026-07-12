/**
 * glyphs/k.js — Matlack lowercase 'k'.
 * Per-letter descriptor module; see glyphs/t.js for the pattern.
 */
import {
  refToCanvas, resolveOffset, buildRibbon, buildTaperedRibbon, smoothStep, scaleEllipse, sampleSegments, sampleEllipse, BOWL_PHASE,
} from './helpers.js';
import { fBarBowlDensity } from './f.js';

const K_REF_CENTER = { x: 52.13, y: 73.38 };  // entrance flick end / downstroke top

// Bar-bowl (tall stem)
const K_BAR_BOWL = {
  inner: {
    cx: 82.1, cy: 37.5,
    a: 28.0, b: 3.8, tilt: -52.5
  },
  outer: {
    cx: 73.3, cy: 48.5,
    a: 44.8, b: 5.8, tilt: -50.5   // tilt diff 2.8°
  },
};

// Bar-bowl width: higher floor than 'f' to stay visible at small sizes.
function kBarBowlWidth(arcFracRaw) {
  const f = (arcFracRaw + BOWL_PHASE) % 1.0;
  if (f < 0.10) return smoothStep(0.55, 0.75, f / 0.10);
  if (f < 0.40) return smoothStep(0.75, 1.0, (f - 0.10) / 0.30);
  if (f < 0.60) return 1.0;
  if (f < 0.90) return smoothStep(1.0, 0.75, (f - 0.60) / 0.30);
  return smoothStep(0.75, 0.55, (f - 0.90) / 0.10);
}

const kBarBowlDensity = fBarBowlDensity;

// Downstroke (fat bar)
const K_DOWNSTROKE = {
  x1: 53.70, y1: 72.68,
  x2: 24.11, y2: 113.87,
};

const K_DOWNSTROKE_HALF_WIDTH = 4.5;

const K_DOWNSTROKE_OFFSET = { dx: 0, dy: 0 };

// Entrance flick
const K_ENTRANCE_SEGS = [
  [[8.81,104.60],[8.81,104.60],[52.13,73.38],[52.13,73.38]],
];

const K_ENTRANCE = { startWidth: 1.0, taperPower: 1.7, liftPoint: 1.0 };

// Upper crescent (partial arc, like 'c')
const K_CRESCENT = {
  inner: {
    cx: 55.3, cy: 89.5,
    a: 8.9, b: 6.0, tilt: -51.1
  },
  outer: {
    cx: 54.9, cy: 90.0,
    a: 13.6, b: 10.0, tilt: -42.9  // tilt diff 0.3° — very uniform
  },
};

// Crescent width: nearly complete arc with a narrow gap at the bottom-left
// where it meets the downstroke. The crescent needs to wrap far enough
// to connect with the exit stroke below.
function kCrescentWidth(arcFracRaw) {
  const f = (arcFracRaw + BOWL_PHASE) % 1.0;
  // Narrow gap at bottom-left only (where the downstroke passes through)
  if (f > 0.60 && f < 0.72) return 0;
  if (f > 0.52 && f <= 0.60) return smoothStep(0.80, 0, (f - 0.52) / 0.08);
  if (f >= 0.72 && f < 0.80) return smoothStep(0, 0.80, (f - 0.72) / 0.08);
  // Everything else: solid
  return 0.80;
}

function kCrescentDensity() { return 0.85; }

// Exit stroke (variable-width ribbon from crescent to exit)
const K_EXIT_SEGS = [
  [[45.90,96.49],[45.39,96.49],[42.07,109.31],[43.63,109.31]],
  [[43.63,109.31],[42.88,109.31],[44.82,116.17],[46.76,116.16]],
  [[46.76,116.16],[46.01,117.47],[54.02,117.71],[54.19,117.26]],
  [[54.19,117.26],[56.16,118.00],[68.32,109.06],[68.02,108.92]],
];

const K_EXIT_OFFSET = { dx: 0, dy: -4 };  // review round 1, candidate 2

// Exit stroke width: starts moderate, thins to hairline
function kExitWidth(t, scale) {
  if (t < 0.15) return 3.0 * scale;
  if (t < 0.50) return smoothStep(3.0, 4.0, (t - 0.15) / 0.35) * scale;
  if (t < 0.70) return 4.0 * scale;
  if (t < 0.90) return smoothStep(4.0, 0.7, (t - 0.70) / 0.20) * scale;
  return 0.7 * scale;
}

/**
 * Render a Matlack-style lowercase 'k'.
 * Components: entrance flick + bar-bowl + downstroke + upper crescent + exit stroke.
 */
function build(cx, cy, scale, dpr, overrides) {
  // ── Bar-bowl (tall stem) ──────────────────────────────────────
  const bbInner = scaleEllipse(K_BAR_BOWL.inner, cx, cy, scale, K_REF_CENTER);
  const bbOuter = scaleEllipse(K_BAR_BOWL.outer, cx, cy, scale, K_REF_CENTER);

  // ── Downstroke (fat bar) ──────────────────────────────────────
  const dsOff = resolveOffset('downstroke', K_DOWNSTROKE_OFFSET, overrides, dpr);
  const hw = K_DOWNSTROKE_HALF_WIDTH * scale;
  const p0 = refToCanvas(K_DOWNSTROKE.x1, K_DOWNSTROKE.y1, cx, cy, scale, K_REF_CENTER);
  const p1 = refToCanvas(K_DOWNSTROKE.x2, K_DOWNSTROKE.y2, cx, cy, scale, K_REF_CENTER);
  p0.x += dsOff.dx; p0.y += dsOff.dy;
  p1.x += dsOff.dx; p1.y += dsOff.dy;
  const ddx = p1.x - p0.x, ddy = p1.y - p0.y;
  const dlen = Math.hypot(ddx, ddy);
  const dnx = -ddy / dlen * hw, dny = ddx / dlen * hw;
  const downstroke = [
    { x: p0.x + dnx, y: p0.y + dny },
    { x: p1.x + dnx, y: p1.y + dny },
    { x: p1.x - dnx, y: p1.y - dny },
    { x: p0.x - dnx, y: p0.y - dny },
  ];

  // ── Entrance flick (reversed taper) ───────────────────────────
  const entrCenter = sampleSegments(
    K_ENTRANCE_SEGS, [0], 12, cx, cy, scale, K_REF_CENTER
  );
  const entrReversed = [...entrCenter].reverse();
  const entrQuads = buildTaperedRibbon(
    entrReversed,
    K_DOWNSTROKE_HALF_WIDTH * scale,
    K_ENTRANCE.taperPower,
    K_ENTRANCE.liftPoint,
  );
  const entrFills = entrQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  // ── Upper crescent (partial arc, like 'c') ────────────────────
  // Apply rotation override (dtheta in degrees, clockwise positive)
  const crRotation = overrides.crescent?.dtheta ?? 39;  // review: 39° CW
  const crOff = resolveOffset('crescent', { dx: -4, dy: -4 }, overrides, dpr);  // review round 3
  const crInnerData = { ...K_CRESCENT.inner, tilt: K_CRESCENT.inner.tilt + crRotation };
  const crOuterData = { ...K_CRESCENT.outer, tilt: K_CRESCENT.outer.tilt + crRotation };
  const crInner = scaleEllipse(crInnerData, cx + crOff.dx, cy + crOff.dy, scale, K_REF_CENTER);
  const crOuter = scaleEllipse(crOuterData, cx + crOff.dx, cy + crOff.dy, scale, K_REF_CENTER);

  // ── Exit stroke (variable-width ribbon) ────────────────────────
  const exitOff = resolveOffset('exitStroke', K_EXIT_OFFSET, overrides, dpr);
  const exitCenter = sampleSegments(
    K_EXIT_SEGS, [0, 1, 2, 3], 12,
    cx + exitOff.dx, cy + exitOff.dy, scale, K_REF_CENTER
  );
  const exitQuads = buildRibbon(exitCenter, (t) => kExitWidth(t, scale));
  const exitFills = exitQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  return {
    bowls: [
      {
        outer: bbOuter,
        inner: bbInner,
        widthFn: kBarBowlWidth,
        densityFn: kBarBowlDensity,
        overlayFills: [
      { points: downstroke, pressure: 0.85 },
      ...entrFills,
    ],
      },
      {
        outer: crOuter,
        inner: crInner,
        widthFn: kCrescentWidth,
        densityFn: kCrescentDensity,
        overlayFills: exitFills,
      },
    ],
    fills: [
    ],
  };
}

function exportOutlines(overrides) {
  return { barBowl: { inner: sampleEllipse(K_BAR_BOWL.inner), outer: sampleEllipse(K_BAR_BOWL.outer) }, crescent: { inner: sampleEllipse(K_CRESCENT.inner), outer: sampleEllipse(K_CRESCENT.outer) } };
}

export default {
  letter: 'k',
  build,
  exportOutlines,
};
