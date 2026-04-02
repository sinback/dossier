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

// ── Smooth interpolation ─────────────────────────────────────────────────────
// Cosine ease between two values. t clamped to [0,1].
// Used everywhere width/density transitions between zones to avoid sharp
// corners in the rendered bowl. Sharp corners = visible angular artifacts
// where the variable inner cutout changes direction abruptly.
function smoothStep(a, b, t) {
  const s = t < 0 ? 0 : t > 1 ? 1 : t;
  return a + (b - a) * (0.5 - 0.5 * Math.cos(s * Math.PI));
}

// ── 'a' bowl width function ──────────────────────────────────────────────────
// Returns a value [0, 1] controlling how much of the outer-inner ellipse gap
// to fill with ink at each position around the bowl.
//
//   1.0 = full stroke width (inner cutout stays at its base ellipse size)
//   0.0 = zero stroke width (inner cutout inflates all the way to the outer ellipse)
//
// arcFrac goes 0→1 around the ellipse. After the outer ellipse's tilt (-40°),
// arcFrac 0.0 is the upper-right on screen. Going CCW:
//   ~0.00-0.05: upper-right (where downstroke overlaps)
//   ~0.05-0.22: top of bowl (segment 1 — thin, pen moving fast)
//   ~0.22-0.55: left side going down (segment 2 — thickening, pen decelerating)
//   ~0.55-0.75: bottom-left (peak width — pen at slowest, most ink deposited)
//   ~0.75-0.92: bottom going right (segment 3 — thinning, pen accelerating)
//   ~0.92-1.00: lower-right (returns to downstroke zone)
//
// BOWL_PHASE shifts everything ~10° CCW to align with Matlack's references.
// The thin floor (0.20) must be high enough to remain visible at small font sizes.
function aBowlWidth(arcFracRaw) {
  const f = (arcFracRaw + BOWL_PHASE) % 1.0;
  if (f < 0.05) return smoothStep(0.45, 0.45, f / 0.05);          // upper-right: moderate, stable
  if (f < 0.12) return smoothStep(0.45, 0.20, (f - 0.05) / 0.07); // ease DOWN into thin zone
  if (f < 0.22) return 0.20;                                       // segment 1: thin top (floor)
  if (f < 0.55) { const t = (f - 0.22) / 0.33; return smoothStep(0.20, 1.0, t); }  // segment 2: ease UP thin→fat
  if (f < 0.75) return 1.0;                                        // bottom-left: full width (peak)
  if (f < 0.92) return smoothStep(1.0, 0.45, (f - 0.75) / 0.17);  // segment 3: ease DOWN fat→moderate
  return smoothStep(0.45, 0.45, (f - 0.92) / 0.08);               // lower-right: moderate, stable
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

// ── Downstroke centerline (pen path, not outline) ────────────────────────────
// From sinback's "Downstroke" trace on ref 09 — the path the pen tip follows.
const A_DOWNSTROKE_CENTERLINE = [
  [[87.61,37.96],[90.61,39.75],[102.82,24.65],[100.02,22.98]],  // loop up
  [[100.02,22.98],[97.03,25.90],[64.18,76.16],[71.55,68.92]],   // main descent
  [[71.55,68.92],[65.30,79.23],[82.65,84.17],[83.47,82.79]],    // bottom curve
  [[83.47,82.79],[85.15,85.13],[103.10,77.45],[101.22,74.84]],  // exit flick
];

function buildADownstrokeCenterline(cx, cy, scale) {
  const pts = [];
  for (let si = 0; si < A_DOWNSTROKE_CENTERLINE.length; si++) {
    const seg = A_DOWNSTROKE_CENTERLINE[si];
    const samples = sampleBezier(seg[0], seg[1], seg[2], seg[3], 12, cx, cy, scale);
    const start = si === 0 ? 0 : 1;
    for (let i = start; i < samples.length; i++) pts.push(samples[i]);
  }
  return pts;
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
 * Map linear time to non-linear arc progress (velocity variation).
 * Fast at top (segment 1), slow through bottom-left (segment 2 end),
 * medium through segment 3. Makes the bowl feel hand-drawn, not robotic.
 */
function bowlTimingCurve(linearT) {
  // Piecewise: fast start, decelerate in the middle, accelerate at end
  if (linearT < 0.25) {
    // Segment 1 (top): fast — cover 35% of arc in 25% of time
    return (linearT / 0.25) * 0.35;
  } else if (linearT < 0.65) {
    // Segment 2 (left→bottom-left): slow — cover 35% of arc in 40% of time
    const t = (linearT - 0.25) / 0.40;
    return 0.35 + t * 0.35;
  } else {
    // Segment 3 + finish: medium — cover 30% of arc in 35% of time
    const t = (linearT - 0.65) / 0.35;
    return 0.70 + t * 0.30;
  }
}

/**
 * Render a Matlack 'a' with animation progress.
 * progress 0→1 controls how much of the letter has been drawn:
 *   0.00–0.65: bowl arc sweeps CCW with velocity variation
 *   0.65–1.00: downstroke reveals along centerline path
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

  if (progress <= 0.65) {
    // Bowl phase: sweep with velocity variation
    const linearT = progress / 0.65;
    const bowlProgress = bowlTimingCurve(linearT);
    renderer.drawBowl(outer, inner, {
      densityFn: aBowlDensity,
      widthFn: aBowlWidth,
      progress: bowlProgress,
    });
  } else {
    // Downstroke phase: fade in the filled polygon.
    const dsProgress = (progress - 0.65) / 0.35;
    const fullBody = buildADownstrokeBody(dsCx, dsCy, scale);
    const dsPressure = 0.85 * dsProgress;

    renderer.drawBowl(outer, inner, {
      densityFn: aBowlDensity,
      widthFn: aBowlWidth,
      progress: 1.0,
      extraFills: [{ points: fullBody, pressure: dsPressure }],
    });
  }
}

/**
 * Fade bowl in, then fade downstroke in. No sweep — just opacity.
 * progress 0→0.5: bowl fades from 0 to full
 * progress 0.5→1: downstroke fades from 0 to full (bowl stays)
 */
export function renderAFadeBowlThenStroke(renderer, cx, cy, size, dpr, progress) {
  const s = size * dpr;
  const scale = s / 100;

  const inner = scaleEllipse(A_BOWL.inner, cx, cy, scale);
  const outer = scaleEllipse(A_BOWL.outer, cx, cy, scale);
  const dsCx = cx + A_DOWNSTROKE_OFFSET.dx * dpr;
  const dsCy = cy + A_DOWNSTROKE_OFFSET.dy * dpr;

  if (progress <= 0.5) {
    // Bowl fading in
    const bowlAlpha = progress / 0.5;
    const fadeDensity = (f) => aBowlDensity(f) * bowlAlpha;
    renderer.drawBowl(outer, inner, {
      densityFn: fadeDensity,
      widthFn: aBowlWidth,
    });
  } else {
    // Bowl complete, downstroke fading in
    const dsAlpha = (progress - 0.5) / 0.5;
    const fullBody = buildADownstrokeBody(dsCx, dsCy, scale);
    renderer.drawBowl(outer, inner, {
      densityFn: aBowlDensity,
      widthFn: aBowlWidth,
      extraFills: [{ points: fullBody, pressure: 0.85 * dsAlpha }],
    });
  }
}

/**
 * Fade entire letter (bowl + downstroke) from 0 to full simultaneously.
 */
export function renderAFadeAll(renderer, cx, cy, size, dpr, progress) {
  const s = size * dpr;
  const scale = s / 100;

  const inner = scaleEllipse(A_BOWL.inner, cx, cy, scale);
  const outer = scaleEllipse(A_BOWL.outer, cx, cy, scale);
  const dsCx = cx + A_DOWNSTROKE_OFFSET.dx * dpr;
  const dsCy = cy + A_DOWNSTROKE_OFFSET.dy * dpr;
  const fullBody = buildADownstrokeBody(dsCx, dsCy, scale);

  const fadeDensity = (f) => aBowlDensity(f) * progress;
  renderer.drawBowl(outer, inner, {
    densityFn: fadeDensity,
    widthFn: aBowlWidth,
    extraFills: [{ points: fullBody, pressure: 0.85 * progress }],
  });
}

// ── Glyph data: lowercase 'b' ───────────────────────────────────────────────
// 'b' = tall vertical stroke + bowl on lower-right.
// The bowl is like 'a's bowl mirrored — fat on bottom-right, thin at top
// where it meets the vertical. The vertical and bowl share the left edge.
//
// No hand-traced data yet — estimated from 'a' bowl params + visual analysis
// of refs b/01 and b/02. All coords in a normalized system where the letter
// center is (0, 0) and scale = size * dpr / 100.

// 'b' bowl: hand-traced from ref b/01 (4x scale, image 140×196).
// Residuals < 0.06 — genuinely elliptical.
const B_BOWL = {
  inner: { cx: 34.7, cy: 149.2, a: 26.6, b: 11.0, tilt: -43.5 },
  outer: { cx: 34.8, cy: 145.0, a: 50.3, b: 21.1, tilt: -42.2 },
};
const B_REF_CENTER = { x: 34.7, y: 149.2 };  // inner center as anchor

// Stroke path: hand-traced centerline from ref b/01
const B_STROKE_SEGS = [
  [[98.60,25.79],[100.19,21.41],[118.55,16.67],[117.18,20.42]],  // top curve
  [[117.18,20.42],[119.68,33.60],[26.49,121.96],[33.99,120.26]], // main descent
];

// Stroke outline: hand-traced ink boundary from ref b/01
const B_STROKE_OUTLINE_SEGS = [
  [[99.52,27.61],[99.52,27.61],[93.87,29.46],[93.87,29.46]],
  [[93.87,29.46],[91.90,27.52],[98.88,20.17],[99.39,20.69]],
  [[99.39,20.69],[101.16,17.61],[116.79,16.29],[116.04,17.59]],
  [[116.04,17.59],[118.15,15.21],[127.19,21.21],[120.78,28.76]],
  [[120.78,28.76],[103.02,45.51],[82.25,70.67],[83.67,69.36]],
  [[83.67,69.36],[69.50,80.87],[51.94,110.35],[56.08,107.20]],
  [[56.08,107.20],[56.33,107.20],[17.11,129.01],[17.11,129.01]],
  [[17.11,129.01],[12.70,128.76],[66.66,67.82],[68.08,67.90]],
  [[68.08,67.90],[65.90,70.33],[94.72,49.63],[96.81,47.30]],
  [[96.81,47.30],[96.81,47.30],[109.99,32.16],[109.99,32.16]],
  [[109.99,32.16],[112.24,27.99],[99.17,26.60],[96.91,30.62]],
];

// Width function: 'a's width function but mirrored in arc space.
// arcFrac 0.5 (left side in normal) becomes the thin part (where stem is),
// arcFrac 0.0 (right side) and 0.75 (bottom) become the fat parts.
// ── 'b' bowl width function ──────────────────────────────────────────────────
// Same structure as 'a' but mirrored in arc space: (1 - arcFrac) flips
// the width profile horizontally so fat is on the right instead of left.
//
// 'b' bowl is smaller than 'a', so the thin floor is higher (0.30) to
// ensure the thin part survives at realistic font sizes. If this floor
// is too low, the thin part of the bowl vanishes when the browser
// downsamples the canvas at small zoom levels.
function bBowlWidth(arcFracRaw) {
  const f = (1.0 - arcFracRaw + BOWL_PHASE + 1) % 1.0;
  if (f < 0.05) return smoothStep(0.45, 0.45, f / 0.05);
  if (f < 0.12) return smoothStep(0.45, 0.30, (f - 0.05) / 0.07);
  if (f < 0.22) return 0.30;                                       // thin floor — higher than 'a'
  if (f < 0.55) { const t = (f - 0.22) / 0.33; return smoothStep(0.30, 1.0, t); }
  if (f < 0.75) return 1.0;
  if (f < 0.92) return smoothStep(1.0, 0.45, (f - 0.75) / 0.17);
  return smoothStep(0.45, 0.45, (f - 0.92) / 0.08);
}

function bBowlDensity(arcFracRaw) {
  const f = (1.0 - arcFracRaw + BOWL_PHASE + 1) % 1.0;
  if (f > 0.10 && f < 0.25) return 0.65;
  return 0.85;
}

function bSampleBezier(p0, p1, p2, p3, n, cx, cy, scale) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const rx = u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0];
    const ry = u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1];
    pts.push({
      x: cx + (rx - B_REF_CENTER.x) * scale,
      y: cy + (ry - B_REF_CENTER.y) * scale,
    });
  }
  return pts;
}

function buildBStrokeOutline(cx, cy, scale) {
  const body = [];
  for (let si = 0; si < B_STROKE_OUTLINE_SEGS.length; si++) {
    const pts = bSampleBezier(...B_STROKE_OUTLINE_SEGS[si], 12, cx, cy, scale);
    const start = si === 0 ? 0 : 1;
    for (let i = start; i < pts.length; i++) body.push(pts[i]);
  }
  return body;
}

/**
 * Render a Matlack-style lowercase 'b'.
 * Vertical stroke (from hand-traced outline) + bowl (two-ellipse model).
 *
 * cx, cy = center of the BOWL. The stroke extends above.
 */
export function renderB(renderer, cx, cy, size, dpr) {
  const s = size * dpr;
  const scale = s / 100;

  const inner = {
    cx: cx,
    cy: cy,
    a: B_BOWL.inner.a * scale, b: B_BOWL.inner.b * scale,
    tilt: B_BOWL.inner.tilt,
  };
  const outer = {
    cx: cx + (B_BOWL.outer.cx - B_BOWL.inner.cx) * scale,
    cy: cy + (B_BOWL.outer.cy - B_BOWL.inner.cy) * scale,
    a: B_BOWL.outer.a * scale, b: B_BOWL.outer.b * scale,
    tilt: B_BOWL.outer.tilt,
  };

  // Stroke outline as filled polygon
  const strokeBody = buildBStrokeOutline(cx, cy, scale);

  renderer.drawBowl(outer, inner, {
    densityFn: bBowlDensity,
    widthFn: bBowlWidth,
    extraFills: [{ points: strokeBody, pressure: 0.85 }],
  });
}

// ── Reference data for DOM overlays ──────────────────────────────────────────
// Exported so MatlackCanvas can render SVG ellipses on reference images.
// Ellipse data for 'b' reference images (4x scale)
export const B_ELLIPSE_DATA = {
  '01': { w: 140, h: 196,  // ★ hand-traced
          inner: { cx: 34.7, cy: 149.2, a: 26.6, b: 11.0, tilt: -43.5 },
          outer: { cx: 34.8, cy: 145.0, a: 50.3, b: 21.1, tilt: -42.2 }},
  '02': { w: 140, h: 184, inner: null, outer: null },
};

// Ellipse data for 'a' reference images (4x scale)
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
