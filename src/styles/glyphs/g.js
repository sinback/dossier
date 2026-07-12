/**
 * glyphs/g.js — Matlack lowercase 'g'.
 * Per-letter descriptor module; see glyphs/t.js for the pattern.
 */
import {
  resolveOffset, buildRibbon, smoothStep, scaleEllipse, sampleSegments, sampleEllipse, BOWL_PHASE, ARC_LIFT, ARC_PRESS, ARC_RISE,
} from './helpers.js';

const G_REF_CENTER = { x: 92.4, y: 56.9 };  // inner ellipse center

const G_BOWL = {
  inner: {
    cx: 92.4, cy: 56.9,
    a: 28.0, b: 12.9, tilt: -50.5   // GOOD fit (0.061)
  },
  outer: {
    cx: 85.8, cy: 61.2,
    a: 39.6, b: 18.6, tilt: -41.7   // GOOD fit (0.063), tilt diff 8.8°
  },
};

// Bowl width: similar to 'a' — large tilt diff (8.8°) creates dramatic variation.
function gBowlWidth(arcFracRaw) {
  const f = (arcFracRaw + BOWL_PHASE) % 1.0;
  if (f < ARC_LIFT) return 0.20;
  if (f < ARC_PRESS) { const t = (f - ARC_LIFT) / (ARC_PRESS - ARC_LIFT); return smoothStep(0.20, 1.0, t); }
  if (f < ARC_RISE) return 1.0;
  if (f < 0.92) return smoothStep(1.0, 0.45, (f - ARC_RISE) / 0.14);
  return smoothStep(0.45, 0.20, (f - 0.92) / 0.08);
}

function gBowlDensity(arcFracRaw) {
  const f = (arcFracRaw + BOWL_PHASE) % 1.0;
  if (f > 0.10 && f < 0.25) return 0.65;
  return 0.85;
}

// Downstroke centerline — the pen path through the descender.
// Traced from 'g Downstroke' in g/01_paths.
const G_DOWNSTROKE_SEGS = [
  [[137.96,24.44],[137.96,24.44],[105.44,68.35],[105.44,68.35]],
  [[105.44,68.35],[105.44,68.35],[73.72,124.08],[73.72,124.08]],
  [[73.72,124.08],[76.04,131.94],[14.26,187.75],[11.95,180.16]],
  [[11.95,180.16],[10.14,180.62],[26.70,152.48],[28.32,151.81]],
  [[28.32,151.81],[30.12,151.93],[57.44,118.41],[64.22,117.49]],
  [[64.22,117.49],[63.80,115.29],[102.43,92.53],[102.46,92.68]],
  [[102.46,92.68],[102.46,92.68],[168.20,52.29],[168.20,52.29]],
];

const G_DOWNSTROKE_OFFSET = { dx: 0, dy: 0 };

// Width function for the downstroke ribbon.
// t = arc-length fraction along the centerline.
function gDownstrokeWidth(t, scale) {
  // Top entry: moderate width
  if (t < 0.05) return 3.0 * scale;

  // Main descender body: fat
  if (t < 0.15) return smoothStep(3.0, 5.5, (t - 0.05) / 0.10) * scale;
  if (t < 0.40) return 5.5 * scale;

  // Thinning into the wiggle/reversal
  if (t < 0.55) return smoothStep(5.5, 3.0, (t - 0.40) / 0.15) * scale;

  // Wiggle zone: moderate
  if (t < 0.65) return 3.0 * scale;

  // Thinning to hairline
  if (t < 0.80) return smoothStep(3.0, 0.7, (t - 0.65) / 0.15) * scale;

  // Hairline exit (past the outline)
  return 0.7 * scale;
}

function build(cx, cy, scale, dpr, overrides) {
  const inner = scaleEllipse(G_BOWL.inner, cx, cy, scale, G_REF_CENTER);
  const outer = scaleEllipse(G_BOWL.outer, cx, cy, scale, G_REF_CENTER);

  // Descender: variable-width ribbon following the wiggly centerline
  const dsOff = resolveOffset('downstroke', G_DOWNSTROKE_OFFSET, overrides, dpr);
  const dsCenter = sampleSegments(
    G_DOWNSTROKE_SEGS,
    [0, 1, 2, 3, 4, 5, 6],
    12, cx + dsOff.dx, cy + dsOff.dy, scale, G_REF_CENTER
  );
  const dsQuads = buildRibbon(dsCenter, (t) => gDownstrokeWidth(t, scale));
  const dsFills = dsQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  return {
    bowls: [
      {
        outer: outer,
        inner: inner,
        widthFn: gBowlWidth,
        densityFn: gBowlDensity,
        overlayFills: dsFills,
      },
    ],
    fills: [
    ],
  };
}

function exportOutlines(overrides) {
  return { bowl: { inner: sampleEllipse(G_BOWL.inner), outer: sampleEllipse(G_BOWL.outer) } };
}

export default {
  letter: 'g',
  build,
  exportOutlines,
};
