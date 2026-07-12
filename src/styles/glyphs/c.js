/**
 * glyphs/c.js — Matlack lowercase 'c'.
 * Per-letter descriptor module; see glyphs/t.js for the pattern.
 */
import {
  resolveOffset, scalePolygon, buildTaperedRibbon, smoothStep, scaleEllipse, sampleSegments, sampleEllipse, BOWL_PHASE, ARC_LIFT, ARC_PRESS, ARC_RISE,
} from './helpers.js';

// Reference anchor: center of 'c's inner ellipse in ref c/02 (68×78, 1x).
const C_REF_CENTER = { x: 40.5, y: 43.1 };

// ── 'c' bowl ellipses ────────────────────────────────────────────────────────
// Hand-traced arcs fitted with tilt constrained to known hand range.
// Outer residual 0.178, inner 0.125 — higher than full bowls due to partial arc.
const C_BOWL = {
  inner: {
    cx: 40.5,
    cy: 43.1,
    a: 24.6,
    b: 16.4,
    tilt: -52.0
  },
  outer: {
    cx: 30.8,
    cy: 42.1,
    a: 35.0,
    b: 19.7,
    tilt: -52.0
  },
};

// ── 'c' top blob (entry ink pooling) ─────────────────────────────────────────
// Closed bezier loop where the pen pauses at the top of the arc.
// Hand-traced from c/02. Rendered as a filled polygon.
const C_TOP_BLOB_SEGS = [
  [[48.97,10.11],[48.97,10.11],[45.13,19.64],[45.13,19.64]],
  [[45.13,19.64],[43.98,19.57],[43.23,29.91],[46.29,30.09]],
  [[46.29,30.09],[47.87,32.36],[57.77,20.41],[57.14,19.50]],
  [[57.14,19.50],[64.23,8.85],[52.53,4.77],[48.97,10.11]],
];

// ── 'c' bottom flick (exit curve) ────────────────────────────────────────────
// Short curved stroke at the bottom-right exit of the arc.
// Hand-traced from c/02. Rendered as a tapered ribbon.
const C_FLICK_SEGS = [
  [[27.39,67.26],[28.24,67.12],[36.83,67.84],[36.83,67.84]],
  [[36.83,67.84],[36.83,67.84],[48.94,59.57],[48.94,59.57]],
];

const C_FLICK = {
  startWidth: 4.55,   // from review grid candidate 3
  taperPower: 0.63,   // gentle decay — thin stroke persists
  liftPoint: 0.95,
};

const C_FLICK_OFFSET = { dx: -4, dy: 0 };

// ── 'c' bowl width function ──────────────────────────────────────────────────
// Like 'a' but with the right side (~0.85-0.15 in arcFrac) tapered to zero.
// The gap creates the open mouth of the 'c'.
// Taper at endpoints prevents a hard edge where the stroke cuts off.
function cBowlWidth(arcFracRaw) {
  const f = (arcFracRaw + BOWL_PHASE) % 1.0;

  // Gap region: wide open mouth on the right side.
  // Exit taper (bottom-right): arc fades in slowly.
  if (f < 0.14) return smoothStep(0, 0.20, f / 0.14);

  // Entry taper (top → top-right): arc fades out early, well before
  // the right side, so the gap is wide and 'c' reads as open, not 'o'.
  // Blob handles all visual weight in the top-right.
  if (f > 0.82) return 0;                                        // gap: fully open
  if (f > 0.65) return smoothStep(0.25, 0, (f - 0.65) / 0.17);  // taper into gap

  // Thin top
  if (f < ARC_LIFT) return 0.25;

  // Left side: thin→fat
  if (f < ARC_PRESS) { const t = (f - ARC_LIFT) / (ARC_PRESS - ARC_LIFT); return smoothStep(0.25, 1.0, t); }

  // Bottom-left: peak
  if (f < ARC_RISE) return 1.0;

  // Bottom-right: fat→thin approaching the exit
  return smoothStep(1.0, 0.25, (f - ARC_RISE) / 0.12);
}

function cBowlDensity(arcFracRaw) {
  const f = (arcFracRaw + BOWL_PHASE) % 1.0;
  // Fade density at exit taper only — entry stays solid to merge with blob
  if (f < 0.05) return smoothStep(0, 0.75, f / 0.05);
  if (f < 0.20) return 0.70;
  return 0.85;
}

/**
 * Render a Matlack-style lowercase 'c'.
 * Components: bowl (partial arc), topBlob (filled), bottomHairline (thin stroke).
 */
function build(cx, cy, scale, dpr, overrides) {
  const inner = scaleEllipse(C_BOWL.inner, cx, cy, scale, C_REF_CENTER);
  const outer = scaleEllipse(C_BOWL.outer, cx, cy, scale, C_REF_CENTER);

  // Top blob: sample bezier segments into a filled polygon
  const blobOff = resolveOffset('topBlob', { dx: 0, dy: 0 }, overrides, dpr);
  const blobScale = overrides.topBlob ?? {};
  let blob = sampleSegments(
    C_TOP_BLOB_SEGS,
    [0, 1, 2, 3],
    12, cx + blobOff.dx, cy + blobOff.dy, scale, C_REF_CENTER
  );
  blob = scalePolygon(blob, blobScale.sx ?? 1, blobScale.sy ?? 1);

  // Bottom flick: tapered ribbon (params + offset overrideable via review grid)
  const flickParams = overrides.flick ?? C_FLICK;
  const flickOff = resolveOffset('flickPos', C_FLICK_OFFSET, overrides, dpr);
  const flickCenter = sampleSegments(
    C_FLICK_SEGS, [0, 1], 12, cx + flickOff.dx, cy + flickOff.dy, scale, C_REF_CENTER
  );
  const flickQuads = buildTaperedRibbon(
    flickCenter,
    (flickParams.startWidth ?? C_FLICK.startWidth) * scale,
    flickParams.taperPower ?? C_FLICK.taperPower,
    flickParams.liftPoint ?? C_FLICK.liftPoint,
  );
  const flickScale = overrides.flick ?? {};
  const flickFills = flickQuads.map(quad => ({
    points: scalePolygon(quad, flickScale.sx ?? 1, flickScale.sy ?? 1),
    pressure: 0.85,
  }));

  return {
    bowls: [
      {
        outer: outer,
        inner: inner,
        widthFn: cBowlWidth,
        densityFn: cBowlDensity,
        overlayFills: [
      { points: blob, pressure: 0.85 },
      ...flickFills,
    ],
      },
    ],
    fills: [
    ],
  };
}

function exportOutlines() {
  return {
    bowl: { inner: sampleEllipse(C_BOWL.inner), outer: sampleEllipse(C_BOWL.outer) },
  };
}

export default {
  letter: 'c',
  build,
  exportOutlines,
  outerEllipse: { outer: C_BOWL.outer, refCenter: C_REF_CENTER },
};
