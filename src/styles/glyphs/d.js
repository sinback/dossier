/**
 * glyphs/d.js — Matlack lowercase 'd'.
 * Per-letter descriptor module; see glyphs/t.js for the pattern.
 */
import {
  refToCanvas, resolveOffset, buildTaperedRibbon, smoothStep, scaleEllipse, sampleSegments, sampleEllipse, buildBar, resolveRefOffset, BOWL_PHASE, ARC_LIFT, ARC_PRESS, ARC_RISE,
} from './helpers.js';

const D_REF_CENTER = { x: 41.2, y: 121.2 };  // inner ellipse center

const D_BOWL = {
  inner: {
    cx: 41.2, cy: 121.2,
    a: 28.8, b: 10.8, tilt: -44.5   // tilt in hand's range, aspect 0.38
  },
  outer: {
    cx: 38.0, cy: 123.3,
    a: 39.5, b: 15.9, tilt: -38.2   // tilt diff 5.4° — like 'a', dramatic variation
  },
};

// Downstroke: straight line from top-right to bottom-left.
// Endpoints from hand-traced path d/01.
const D_DOWNSTROKE = {
  x1: 139.45, y1: 5.14,    // top (extends well above bowl — ascender)
  x2: 53.86,  y2: 134.02,  // bottom (meets bowl)
};

const D_DOWNSTROKE_HALF_WIDTH = 4.5;  // measured from reference image

// Offset for downstroke position relative to bowl center (grid-searchable).
const D_DOWNSTROKE_OFFSET = { dx: 0, dy: 0 };

// ── 'd' flick (bottom-right exit curve) ──────────────────────────────────────
// Short curve at the base of the downstroke, extending right.
// Hand-traced from d/01. Starts within ~1px of downstroke bottom endpoint.
const D_FLICK_SEGS = [
  [[54.18,134.93],[53.22,135.28],[51.94,144.30],[54.91,143.23]],
  [[54.91,143.23],[55.17,145.03],[64.41,146.01],[64.23,144.76]],
  [[64.23,144.76],[68.35,145.68],[82.92,142.69],[80.41,142.13]],
  [[80.41,142.13],[80.41,142.13],[116.08,123.91],[116.08,123.91]],
];

// Flick taper parameters:
//   startWidth: half-width at the base (should match departing stroke)
//   taperPower: exponent for power-law decay (~1.7 for Matlack's hand)
//   liftPoint:  fraction of path where ink stops (1.0 = full path tapers)
const D_FLICK = {
  startWidth: D_DOWNSTROKE_HALF_WIDTH,  // match the downstroke thickness
  taperPower: 1.7,
  liftPoint: 0.85,  // taper over 85% of the path
};

// 'd' bowl width: same as 'a' — thick bottom-left, thin top.
// The tilt diff (5.4°) already creates good variation; widthFn reinforces it.
// Top is fat (0.80) to merge with downstroke.
function dBowlWidth(arcFracRaw) {
  const f = (arcFracRaw + BOWL_PHASE) % 1.0;

  // Fat top — merges with downstroke
  if (f < ARC_LIFT) return 0.80;

  // Left side: thin→fat
  if (f < ARC_PRESS) { const t = (f - 0.26) / 0.36; return smoothStep(0.80, 1.0, t); }

  // Bottom-left: peak
  if (f < ARC_RISE) return 1.0;

  // Bottom-right: fat→moderate
  return smoothStep(1.0, 0.45, (f - ARC_RISE) / 0.10);
}

function dBowlDensity(arcFracRaw) {
  const f = (arcFracRaw + BOWL_PHASE) % 1.0;
  if (f > 0.10 && f < 0.25) return 0.65;
  return 0.85;
}

function build(cx, cy, scale, dpr, overrides) {
  const inner = scaleEllipse(D_BOWL.inner, cx, cy, scale, D_REF_CENTER);
  const outer = scaleEllipse(D_BOWL.outer, cx, cy, scale, D_REF_CENTER);

  // Downstroke: straight fat bar from top to bottom
  const dsOff = resolveOffset('downstroke', D_DOWNSTROKE_OFFSET, overrides, dpr);
  const hw = D_DOWNSTROKE_HALF_WIDTH * scale;
  const p0 = refToCanvas(D_DOWNSTROKE.x1, D_DOWNSTROKE.y1, cx, cy, scale, D_REF_CENTER);
  const p1 = refToCanvas(D_DOWNSTROKE.x2, D_DOWNSTROKE.y2, cx, cy, scale, D_REF_CENTER);
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

  // Flick: tapered ribbon anchored to the downstroke's bottom endpoint.
  // Sample the bezier path in ref coords, then shift so the flick's start
  // matches p1 (the downstroke bottom) exactly — stays connected when
  // downstroke offset is grid-searched.
  const flickRef = sampleSegments(
    D_FLICK_SEGS, [0, 1, 2, 3], 12, cx, cy, scale, D_REF_CENTER
  );
  // Nudge anchor slightly up the downstroke direction so the flick's
  // first quad overlaps the fat bar by ~2px, eliminating the seam gap.
  const dsNx = (p0.x - p1.x) / len, dsNy = (p0.y - p1.y) / len;  // unit vector up the downstroke
  const overlap = 2 * scale;
  const anchorDx = (p1.x + dsNx * overlap) - flickRef[0].x;
  const anchorDy = (p1.y + dsNy * overlap) - flickRef[0].y;
  const flickCenter = flickRef.map(p => ({ x: p.x + anchorDx, y: p.y + anchorDy }));
  const flick = buildTaperedRibbon(
    flickCenter,
    D_FLICK.startWidth * scale,
    D_FLICK.taperPower,
    D_FLICK.liftPoint,
  );

  // flick is an array of quads — each quad is 4 {x,y} points
  const flickFills = flick.map(quad => ({ points: quad, pressure: 0.85 }));

  return {
    bowls: [
      {
        outer: outer,
        inner: inner,
        widthFn: dBowlWidth,
        densityFn: dBowlDensity,
        overlayFills: [
      { points: downstroke, pressure: 0.85 },
      ...flickFills,
    ],
      },
    ],
    fills: [
    ],
  };
}

function exportOutlines(overrides) {
  const dsOff = resolveRefOffset('downstroke', D_DOWNSTROKE_OFFSET, overrides);
  const downstroke = buildBar(
    D_DOWNSTROKE.x1 + dsOff.dx, D_DOWNSTROKE.y1 + dsOff.dy,
    D_DOWNSTROKE.x2 + dsOff.dx, D_DOWNSTROKE.y2 + dsOff.dy,
    D_DOWNSTROKE_HALF_WIDTH,
  );
  return {
    bowl: { inner: sampleEllipse(D_BOWL.inner), outer: sampleEllipse(D_BOWL.outer) },
    downstroke,
  };
}

export default {
  letter: 'd',
  build,
  exportOutlines,
  outerEllipse: { outer: D_BOWL.outer, refCenter: D_REF_CENTER },
};
