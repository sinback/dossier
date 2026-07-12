/**
 * glyphs/a.js — Matlack lowercase 'a'.
 * Per-letter descriptor module; see glyphs/t.js for the pattern.
 */
import {
  resolveOffset, smoothStep, scaleEllipse, sampleSegments, sampleEllipse, resolveRefOffset, BOWL_PHASE, ARC_LIFT, ARC_PRESS, ARC_RISE,
} from './helpers.js';

// Reference anchor: the center of 'a's inner (counter) ellipse in ref 09.
// All 'a' coordinates are relative to this point.
// Image: matlack/reference/lowercase/a_4x/09.png (132×104 at 4x)
const A_REF_CENTER = { x: 55.1, y: 51.7 };

// ── 'a' bowl ellipses ────────────────────────────────────────────────────────
// Hand-traced by sinback in GIMP, validated with moment fitting.
// Residuals < 0.08 — the traces are genuinely elliptical.
// See bowl-ellipse-model.md for cross-letter analysis.
const A_BOWL = {
  inner: {
    cx: 55.1,   // x center in ref coords (= A_REF_CENTER.x, so maps to cx)
    cy: 51.7,   // y center in ref coords (= A_REF_CENTER.y, so maps to cy)
    a: 32.8,    // semi-major axis (px at 4x). Along the tilt direction.
    b: 14.1,    // semi-minor axis (px at 4x). Perpendicular to tilt.
    tilt: -44.9 // degrees from horizontal. Negative = tilted upper-left to lower-right.
  },
  outer: {
    cx: 51.7,   // slightly left of inner center (offset: -3.4 px at 4x)
    cy: 50.2,   // slightly above inner center (offset: -1.5 px at 4x)
    a: 47.9,    // larger than inner (ratio: 1.46×) — the gap = stroke width
    b: 26.5,    // larger than inner (ratio: 1.88×) — wider gap perpendicular to tilt
    tilt: -40.3 // 4.6° less tilted than inner — THIS creates the thin-top/fat-bottom effect
  },
};

// ── 'a' downstroke outline ───────────────────────────────────────────────────
// 8 cubic bezier segments forming a closed path around the downstroke ink.
// Traced from sinback's "Downstroke Outline" path on ref a/09.
//
// Segments 0-1: the top loop (pen goes up before going down — Matlack quirk).
//   Currently OMITTED from rendering — too thin to fill properly.
//
// Segments 2-7: the main body (descent + flick + left edge).
//   Rendered as a filled polygon via ear-clipping triangulation.
//   This shape merges with the bowl in the coverage FBO (MAX blend).
const A_DOWNSTROKE_SEGS = [
  [[91.91,23.16],[90.96,21.94],[103.61,11.21],[106.13,14.45]],  // 0: loop up-right
  [[106.13,14.45],[114.07,15.68],[106.49,31.93],[103.90,31.53]], // 1: loop back down
  [[103.90,31.53],[101.87,42.03],[77.43,75.10],[78.97,67.12]],  // 2: main descent (diagonal)
  [[78.97,67.12],[76.75,69.71],[90.97,75.37],[92.22,73.90]],    // 3: bottom curve
  [[92.22,73.90],[96.41,75.43],[107.74,68.41],[107.18,68.42]],  // 4: flick start (rightward)
  [[107.18,68.42],[109.75,70.97],[88.02,90.49],[83.93,86.95]],  // 5: flick bottom (curves down)
  [[83.93,86.95],[82.72,88.15],[51.45,76.09],[57.73,69.87]],    // 6: flick return (leftward)
  [[57.73,69.87],[57.57,66.76],[91.66,18.32],[91.91,23.16]],    // 7: left edge (back to start)
];

// Offset applied to the downstroke position relative to the bowl center.
// Found via 3×3 then 5×3 grid search with sinback + Chris evaluating.
// Units: CSS pixels before DPR scaling. Applied as: dsCx = cx + dx * dpr.
const A_DOWNSTROKE_OFFSET = {
  dx: 4,  // shift right 4 CSS pixels
  dy: 2,  // shift down 2 CSS pixels
};

// ── 'a' bowl width function ──────────────────────────────────────────────────
// Returns [0, 1] controlling how much of the outer-inner ellipse gap to fill.
//   1.0 = full stroke width (inner cutout stays at base size)
//   0.0 = invisible (inner cutout inflates to match outer)
//
// arcFrac goes 0→1 around the ellipse. After the outer's tilt (~-40°),
// arcFrac 0.0 lands at upper-right on screen. Going CCW:
//   ~0.00-0.05: upper-right (downstroke overlap zone)
//   ~0.05-0.22: top (segment 1 — thin, fast pen)
//   ~0.22-0.55: left side going down (segment 2 — thickening, pen decelerating)
//   ~0.55-0.75: bottom-left (peak — pen slowest, most ink)
//   ~0.75-0.92: bottom going right (segment 3 — thinning, pen accelerating)
//   ~0.92-1.00: lower-right (back to downstroke zone)
//
// BOWL_PHASE (0.03) shifts everything ~10° CCW to match Matlack's references.
// Thin floor (0.20): minimum width that remains visible at small font sizes.
//   Too low → thin part vanishes at realistic zoom. Too high → no thin/fat contrast.
function aBowlWidth(arcFracRaw) {
  const f = (arcFracRaw + BOWL_PHASE) % 1.0;

  // Zone: upper-right (downstroke territory). Moderate, stable width.
  // Value 0.45: enough to see ink but not as thick as the fat zones.
  if (f < 0.05) return smoothStep(0.45, 0.45, f / 0.05);

  // Transition: ease from moderate (0.45) DOWN to thin (0.20).
  // Duration: 7% of arc (~25°). Cosine ease prevents sharp corner.
  if (f < 0.12) return smoothStep(0.45, 0.20, (f - 0.05) / 0.07);

  // Zone: segment 1 — thin top. Pen is moving fast here.
  // Floor 0.20 = 20% of max gap. Visible but clearly thinner than the fat zones.
  if (f < ARC_LIFT) return 0.20;

  // Transition: segment 2 — thin→fat. Pen decelerates through the left side.
  // Duration: 33% of arc (~120°). Cosine ease for smooth thickening.
  if (f < ARC_PRESS) { const t = (f - ARC_LIFT) / 0.33; return smoothStep(0.20, 1.0, t); }

  // Zone: bottom-left — peak width. Maximum ink deposit, pen at slowest.
  if (f < ARC_RISE) return 1.0;

  // Transition: segment 3 — fat→moderate. Pen accelerates out of the bottom.
  // Duration: 14% of arc (~50°). Eases back to the moderate downstroke zone.
  if (f < 0.92) return smoothStep(1.0, 0.45, (f - ARC_RISE) / 0.14);

  // Zone: lower-right — moderate, returning to downstroke territory.
  return smoothStep(0.45, 0.45, (f - 0.92) / 0.08);
}

// ── 'a' bowl density function ────────────────────────────────────────────────
// Controls ink darkness [0, 1] independent of width.
// Mostly uniform (0.85 = dark ink) since width carries the penmanship intent.
// Only the thin top (segment 1) is slightly lighter (0.65) to reinforce
// the visual impression of fast, light pen movement there.
function aBowlDensity(arcFracRaw) {
  const f = (arcFracRaw + BOWL_PHASE) % 1.0;
  if (f > 0.10 && f < 0.25) return 0.65;  // segment 1: slightly lighter ink
  return 0.85;                              // everywhere else: solid dark
}

// Build the downstroke body as a closed polygon (segs 2-7, skip the loop).
// Returns array of {x, y} in canvas coords.
function buildADownstrokeBody(cx, cy, scale) {
  return sampleSegments(
    A_DOWNSTROKE_SEGS,
    [2, 3, 4, 5, 6, 7],  // skip segs 0-1 (the loop)
    12,                    // 12 samples per bezier segment
    cx, cy, scale, A_REF_CENTER
  );
}

/**
 * Render a Matlack-style lowercase 'a'.
 * Components: bowl, downstroke.
 */
function build(cx, cy, scale, dpr, overrides) {
  const inner = scaleEllipse(A_BOWL.inner, cx, cy, scale, A_REF_CENTER);
  const outer = scaleEllipse(A_BOWL.outer, cx, cy, scale, A_REF_CENTER);

  const dsOff = resolveOffset('downstroke', A_DOWNSTROKE_OFFSET, overrides, dpr);
  const body = buildADownstrokeBody(cx + dsOff.dx, cy + dsOff.dy, scale);

  return {
    bowls: [
      {
        outer: outer,
        inner: inner,
        widthFn: aBowlWidth,
        densityFn: aBowlDensity,
        extraFills: [{ points: body, pressure: 0.85 }],
      },
    ],
    fills: [
    ],
  };
}

function exportOutlines(overrides) {
  const dsOff = resolveRefOffset('downstroke', A_DOWNSTROKE_OFFSET, overrides);
  // Downstroke body: sample bezier segments in ref coords (cx=0, cy=0 relative to REF_CENTER)
  const body = sampleSegments(
    A_DOWNSTROKE_SEGS,
    [2, 3, 4, 5, 6, 7],
    12, dsOff.dx, dsOff.dy, 1, { x: 0, y: 0 }
  ).map(p => [p.x + A_REF_CENTER.x, p.y + A_REF_CENTER.y]);

  return {
    bowl: { inner: sampleEllipse(A_BOWL.inner), outer: sampleEllipse(A_BOWL.outer) },
    downstroke: body,
  };
}

export default {
  letter: 'a',
  build,
  exportOutlines,
  outerEllipse: { outer: A_BOWL.outer, refCenter: A_REF_CENTER },
};
