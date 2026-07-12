/**
 * glyphs/q.js — Matlack lowercase 'q'.
 * Per-letter descriptor module; see glyphs/t.js for the pattern.
 */
import {
  refToCanvas, resolveOffset, smoothStep, scaleEllipse, sampleEllipse, buildBar, resolveRefOffset, BOWL_PHASE, ARC_LIFT, ARC_PRESS, ARC_RISE,
} from './helpers.js';

const Q_REF_CENTER = { x: 36.6, y: 40.3 };  // inner ellipse center

const Q_BOWL = {
  inner: {
    cx: 36.6, cy: 40.3,
    a: 21.9, b: 7.7, tilt: -48.6    // tilt in hand's range, aspect 0.35
  },
  outer: {
    cx: 30.9, cy: 46.0,
    a: 31.9, b: 13.1, tilt: -49.1   // tilt diff 0.4° — nearly zero, like 'o'
  },
};

// Downstroke: straight line from top-right to bottom-left (descender).
const Q_DOWNSTROKE = {
  x1: 67.33, y1: 14.62,   // top (starts above bowl)
  x2: 6.55,  y2: 111.00,  // bottom (extends below — descender)
};

const Q_DOWNSTROKE_HALF_WIDTH = 6.5;  // measured from reference image

const Q_DOWNSTROKE_OFFSET = { dx: 0, dy: 4 };

// 'q' bowl width: nearly uniform (tilt diff ~0°, like 'o').
// Top is fat (0.80) to merge with downstroke, same approach as 'd'.
function qBowlWidth(arcFracRaw) {
  const f = (arcFracRaw + BOWL_PHASE) % 1.0;

  // Fat top — merges with downstroke
  if (f < ARC_LIFT) return 0.80;

  // Left side: fat top→peak
  if (f < ARC_PRESS) { const t = (f - ARC_LIFT) / 0.33; return smoothStep(0.80, 1.0, t); }

  // Bottom-left: peak
  if (f < ARC_RISE) return 1.0;

  // Bottom-right: fat→moderate
  if (f < 0.85) { return smoothStep(1.0, 0.45, (f - ARC_RISE) / 0.07) };

  // Upper-right: thin, returning to top
  return 0.80;
}

function qBowlDensity(arcFracRaw) {
  const f = (arcFracRaw + BOWL_PHASE) % 1.0;
  if (f < 0.20) return 0.70;
  return 0.85;
}

/**
 * Render a Matlack-style lowercase 'q'.
 * Components: bowl, downstroke (descender).
 */
function build(cx, cy, scale, dpr, overrides) {
  const inner = scaleEllipse(Q_BOWL.inner, cx, cy, scale, Q_REF_CENTER);
  const outer = scaleEllipse(Q_BOWL.outer, cx, cy, scale, Q_REF_CENTER);

  // Downstroke: straight fat bar from top to bottom (descender)
  const dsOff = resolveOffset('downstroke', Q_DOWNSTROKE_OFFSET, overrides, dpr);
  const hw = Q_DOWNSTROKE_HALF_WIDTH * scale;
  const p0 = refToCanvas(Q_DOWNSTROKE.x1, Q_DOWNSTROKE.y1, cx, cy, scale, Q_REF_CENTER);
  const p1 = refToCanvas(Q_DOWNSTROKE.x2, Q_DOWNSTROKE.y2, cx, cy, scale, Q_REF_CENTER);
  p0.x += dsOff.dx; p0.y += dsOff.dy;
  p1.x += dsOff.dx; p1.y += dsOff.dy;
  const dx = p1.x - p0.x, dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy);
  const nx = -dy / len * hw, ny = dx / len * hw;
  const downstroke = [
    { x: p0.x + nx, y: p0.y + ny },
    { x: p1.x + nx, y: p1.y + ny },
    { x: p1.x - nx, y: p1.y - ny },
    { x: p0.x - nx, y: p0.y - ny },
  ];

  return {
    bowls: [
      {
        outer: outer,
        inner: inner,
        widthFn: qBowlWidth,
        densityFn: qBowlDensity,
        overlayFills: [
      { points: downstroke, pressure: 0.85 },
    ],
      },
    ],
    fills: [
    ],
  };
}

function exportOutlines(overrides) {
  const dsOff = resolveRefOffset('downstroke', Q_DOWNSTROKE_OFFSET, overrides);
  const downstroke = buildBar(
    Q_DOWNSTROKE.x1 + dsOff.dx, Q_DOWNSTROKE.y1 + dsOff.dy,
    Q_DOWNSTROKE.x2 + dsOff.dx, Q_DOWNSTROKE.y2 + dsOff.dy,
    Q_DOWNSTROKE_HALF_WIDTH,
  );
  return {
    bowl: { inner: sampleEllipse(Q_BOWL.inner), outer: sampleEllipse(Q_BOWL.outer) },
    downstroke,
  };
}

export default {
  letter: 'q',
  build,
  exportOutlines,
  outerEllipse: { outer: Q_BOWL.outer, refCenter: Q_REF_CENTER },
};
