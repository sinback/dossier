/**
 * matlackGlyphs.js — Letter geometry data and rendering for Matlack's hand.
 *
 * Each glyph is defined by:
 *   - Bowl: inner + outer ellipse params (from hand-traced references)
 *   - Downstroke: bezier outline segments (from hand-traced references)
 *   - Width/density functions that control ink distribution around the bowl
 *
 * All coordinates are in ref 09's 4x scale (image 132×104).
 * The inner ellipse center (55.1, 51.7) is the anchor point — when rendering,
 * this maps to the caller's (cx, cy).
 *
 * Usage:
 *   import { renderA } from './matlackGlyphs.js';
 *   renderA(renderer, cx, cy, size, dpr);
 */

// ── Reference coordinate system ──────────────────────────────────────────────
// All glyph data is in ref 09's 4x-upscaled pixel coords.
// To convert to canvas coords: canvas = (ref - REF_CENTER) * (size * dpr / 100)
const REF_CENTER = { x: 55.1, y: 51.7 };  // inner ellipse center, ref 09 at 4x

function refToCanvas(rx, ry, cx, cy, scale) {
  return {
    x: cx + (rx - REF_CENTER.x) * scale,
    y: cy + (ry - REF_CENTER.y) * scale,
  };
}

// ── Cubic bezier sampler ─────────────────────────────────────────────────────
function sampleBezier(p0, p1, p2, p3, n, cx, cy, scale) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const rx = u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0];
    const ry = u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1];
    pts.push(refToCanvas(rx, ry, cx, cy, scale));
  }
  return pts;
}

// ── Glyph data: lowercase 'a' ───────────────────────────────────────────────
// Source: sinback's hand traces on ref 09 (4x upscaled Declaration facsimile)

const A_BOWL = {
  // Inner ellipse (counter / negative space)
  inner: { cx: 55.1, cy: 51.7, a: 32.8, b: 14.1, tilt: -44.9 },
  // Outer ellipse (ink outer edge)
  outer: { cx: 51.7, cy: 50.2, a: 47.9, b: 26.5, tilt: -40.3 },
};

// Downstroke outline: 8 cubic bezier segments forming a closed path.
// Segs 0-1: top loop (omitted from render — too thin to fill, TODO as hairline)
// Segs 2-7: body + flick + left edge (rendered as filled polygon)
const A_DOWNSTROKE_SEGS = [
  [[91.91,23.16],[90.96,21.94],[103.61,11.21],[106.13,14.45]],  // 0: loop up
  [[106.13,14.45],[114.07,15.68],[106.49,31.93],[103.90,31.53]], // 1: loop down
  [[103.90,31.53],[101.87,42.03],[77.43,75.10],[78.97,67.12]],  // 2: descent
  [[78.97,67.12],[76.75,69.71],[90.97,75.37],[92.22,73.90]],    // 3: bottom curve
  [[92.22,73.90],[96.41,75.43],[107.74,68.41],[107.18,68.42]],  // 4: flick start
  [[107.18,68.42],[109.75,70.97],[88.02,90.49],[83.93,86.95]],  // 5: flick bottom
  [[83.93,86.95],[82.72,88.15],[51.45,76.09],[57.73,69.87]],    // 6: flick return
  [[57.73,69.87],[57.57,66.76],[91.66,18.32],[91.91,23.16]],    // 7: left edge
];

// Grid-searched offset for downstroke relative to bowl (in CSS px before DPR)
const A_DOWNSTROKE_OFFSET = { dx: 4, dy: 2 };

// ── Bowl width function ──────────────────────────────────────────────────────
// Controls how much of the outer-inner gap to fill with ink.
// 1.0 = full stroke width, 0.0 = paper-thin.
// Phase offset (~10° CCW) aligns the thickness pattern with Matlack's references.
const BOWL_PHASE = 0.03;

function aBowlWidth(arcFracRaw) {
  const f = (arcFracRaw + BOWL_PHASE) % 1.0;
  if (f < 0.08) return 0.45;                                      // upper-right
  if (f < 0.25) return 0.15;                                      // segment 1: thin top
  if (f < 0.55) { const t = (f - 0.25) / 0.30; return 0.15 + 0.85 * t * t; }  // segment 2: thin→fat
  if (f < 0.75) return 1.0;                                       // bottom-left: peak
  if (f < 0.92) { const t = (f - 0.75) / 0.17; return 1.0 - 0.55 * t; }       // segment 3: fat→thin
  return 0.45;                                                     // lower-right
}

// ── Bowl density function ────────────────────────────────────────────────────
// Mostly uniform dark ink. Width does the talking.
function aBowlDensity(arcFracRaw) {
  const f = (arcFracRaw + BOWL_PHASE) % 1.0;
  if (f > 0.10 && f < 0.25) return 0.65;  // segment 1: slightly lighter
  return 0.85;
}

// ── Build downstroke body (filled polygon, segs 2-7) ─────────────────────────
function buildADownstrokeBody(cx, cy, scale) {
  const body = [];
  for (let si = 2; si <= 7; si++) {
    const pts = sampleBezier(...A_DOWNSTROKE_SEGS[si], 12, cx, cy, scale);
    const start = si === 2 ? 0 : 1;
    for (let i = start; i < pts.length; i++) body.push(pts[i]);
  }
  return body;
}

// ── Scale ellipse params from ref coords to canvas coords ────────────────────
function scaleEllipse(e, cx, cy, scale) {
  return {
    cx: cx + (e.cx - REF_CENTER.x) * scale,
    cy: cy + (e.cy - REF_CENTER.y) * scale,
    a: e.a * scale,
    b: e.b * scale,
    tilt: e.tilt,
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Render a Matlack-style lowercase 'a'.
 *
 * @param {object} renderer - from createStrokeRenderer(gl)
 * @param {number} cx - canvas x center (pixels, already DPR-scaled)
 * @param {number} cy - canvas y center
 * @param {number} size - font size in CSS pixels (before DPR)
 * @param {number} dpr - window.devicePixelRatio
 */
export function renderA(renderer, cx, cy, size, dpr) {
  const s = size * dpr;
  const scale = s / 100;

  const inner = scaleEllipse(A_BOWL.inner, cx, cy, scale);
  const outer = scaleEllipse(A_BOWL.outer, cx, cy, scale);

  // Downstroke body with grid-searched offset
  const dsCx = cx + A_DOWNSTROKE_OFFSET.dx * dpr;
  const dsCy = cy + A_DOWNSTROKE_OFFSET.dy * dpr;
  const body = buildADownstrokeBody(dsCx, dsCy, scale);

  renderer.drawBowl(outer, inner, {
    densityFn: aBowlDensity,
    widthFn: aBowlWidth,
    extraFills: [{ points: body, pressure: 0.85 }],
  });
}

/**
 * Render a Matlack 'a' with animation progress.
 * progress 0→1 controls how much of the letter has been drawn:
 *   0.00–0.70: bowl arc sweeps CCW
 *   0.70–1.00: downstroke body reveals top-to-bottom
 *
 * @param {number} progress - [0, 1]
 */
export function renderAAnimated(renderer, cx, cy, size, dpr, progress) {
  const s = size * dpr;
  const scale = s / 100;

  const inner = scaleEllipse(A_BOWL.inner, cx, cy, scale);
  const outer = scaleEllipse(A_BOWL.outer, cx, cy, scale);

  const dsCx = cx + A_DOWNSTROKE_OFFSET.dx * dpr;
  const dsCy = cy + A_DOWNSTROKE_OFFSET.dy * dpr;

  if (progress <= 0.70) {
    // Bowl phase: sweep the arc
    const bowlProgress = progress / 0.70;
    renderer.drawBowl(outer, inner, {
      densityFn: aBowlDensity,
      widthFn: aBowlWidth,
      progress: bowlProgress,
    });
  } else {
    // Downstroke phase: bowl complete, reveal downstroke body progressively
    const dsProgress = (progress - 0.70) / 0.30;
    const fullBody = buildADownstrokeBody(dsCx, dsCy, scale);

    // Reveal body vertices progressively (top to bottom)
    const showCount = Math.max(3, Math.ceil(fullBody.length * dsProgress));
    const partialBody = fullBody.slice(0, showCount);

    renderer.drawBowl(outer, inner, {
      densityFn: aBowlDensity,
      widthFn: aBowlWidth,
      progress: 1.0,
      extraFills: partialBody.length >= 3 ? [{ points: partialBody, pressure: 0.85 }] : undefined,
    });
  }
}

// ── Reference data for DOM overlays ──────────────────────────────────────────
// Exported so MatlackCanvas can render SVG ellipses on reference images.
export const ELLIPSE_DATA = {
  '01': { w: 124, h: 100,
          inner: { cx: 51.7, cy: 46.4, a: 37.8, b: 17.2, tilt: -47.2 },
          outer: { cx: 51.4, cy: 46.6, a: 50.5, b: 29.1, tilt: -37.3 }},
  '02': { w: 104, h: 120,
          inner: { cx: 45.1, cy: 57.0, a: 33.2, b: 10.1, tilt: -51.7 },
          outer: null },
  '03': null,
  '04': { w: 148, h: 120, inner: null,
          outer: { cx: 52.0, cy: 45.0, a: 50.7, b: 20.5, tilt: -41.4 }},
  '05': { w: 144, h: 128,
          inner: { cx: 62.9, cy: 50.7, a: 42.4, b: 19.5, tilt: -44.6 },
          outer: { cx: 59.1, cy: 50.5, a: 61.1, b: 32.8, tilt: -39.9 }},
  '06': { w: 100, h: 120, inner: null, outer: null },
  '07': null,
  '08': { w: 156, h: 148, inner: null, outer: null },
  '09': { w: 132, h: 104,
          inner: { cx: 55.1, cy: 51.7, a: 32.8, b: 14.1, tilt: -44.9 },
          outer: { cx: 51.7, cy: 50.2, a: 47.9, b: 26.5, tilt: -40.3 }},
  '10': { w: 120, h: 112,
          inner: { cx: 55.7, cy: 63.7, a: 35.7, b: 14.0, tilt: -41.6 },
          outer: { cx: 56.0, cy: 61.6, a: 54.3, b: 26.4, tilt: -38.6 }},
};
