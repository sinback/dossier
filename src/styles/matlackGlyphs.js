/**
 * matlackGlyphs.js — Letter geometry data and rendering for Matlack's hand.
 *
 * Each glyph is defined by:
 *   - Bowl: inner + outer ellipse params (from hand-traced references)
 *   - Stroke: bezier outline segments (from hand-traced references)
 *   - Width/density functions that control ink distribution around the bowl
 *
 * COORDINATE SYSTEM:
 *   All raw glyph data is in 4x-upscaled pixel coords from reference images.
 *   Each letter has a REF_CENTER — the inner ellipse center in that image.
 *   When rendering, REF_CENTER maps to the caller's (cx, cy).
 *   Scale factor: (size * dpr) / 100. So at size=100, dpr=1, one ref-pixel = one canvas-pixel.
 *
 * TWO-ELLIPSE BOWL MODEL:
 *   The bowl of each letter is the area between two ellipses:
 *     outer ellipse = outer edge of ink
 *     inner ellipse = inner edge (counter / negative space)
 *   The renderer fills the outer, then punches out the inner.
 *   Width variation around the bowl comes from a widthFn that inflates
 *   the inner cutout in the thin zones (making the gap smaller there).
 *
 * ADDING A NEW LETTER:
 *   1. Hand-trace inner + outer bowl paths in GIMP on 4x upscaled ref
 *   2. Run moment fitting to get ellipse params (see bowl-ellipse-model.md)
 *   3. Hand-trace stroke outline (if the letter has a non-bowl stroke)
 *   4. Define X_BOWL, X_REF_CENTER, X_STROKE_OUTLINE_SEGS
 *   5. Write xBowlWidth() and xBowlDensity() (can start from 'a' and adjust)
 *   6. Write renderX() function
 *   7. Export from this file, import in MatlackCanvas.jsx
 *
 * Usage:
 *   import { renderA, renderB } from './matlackGlyphs.js';
 *   renderA(renderer, cx, cy, size, dpr);
 */

// ═════════════════════════════════════════════════════════════════════════════
// SHARED UTILITIES
// ═════════════════════════════════════════════════════════════════════════════

// ── Coordinate transform ─────────────────────────────────────────────────────
// Converts a point from reference image coords to canvas coords.
// refCenter: the anchor point in ref coords (maps to cx, cy on canvas).
// scale: (size * dpr) / 100 — how many canvas pixels per ref pixel.
function refToCanvas(rx, ry, cx, cy, scale, refCenter) {
  return {
    x: cx + (rx - refCenter.x) * scale,
    y: cy + (ry - refCenter.y) * scale,
  };
}

// ── Offset resolution ────────────────────────────────────────────────────────
// Returns { dx, dy } in DPR-scaled canvas pixels.
// If the overrides object has a key for this component, use it; otherwise fall
// back to the baked-in default. All values are CSS px before DPR.
function resolveOffset(componentName, defaults, overrides, dpr) {
  const raw = overrides[componentName] ?? defaults;
  return { dx: (raw.dx ?? 0) * dpr, dy: (raw.dy ?? 0) * dpr };
}

// ── Scale polygon around centroid ─────────────────────────────────────────────
// Scales an array of {x, y} points by (sx, sy) around their centroid.
// Used for review-grid scale variations on blobs, flicks, etc.
function scalePolygon(points, sx, sy) {
  if (!points.length || (sx === 1 && sy === 1)) return points;
  let mcx = 0, mcy = 0;
  for (const p of points) { mcx += p.x; mcy += p.y; }
  mcx /= points.length; mcy /= points.length;
  return points.map(p => ({
    x: mcx + (p.x - mcx) * sx,
    y: mcy + (p.y - mcy) * sy,
  }));
}

// ── Variable-width ribbon builder ─────────────────────────────────────────────
// Builds quads along a centerline with width controlled by an arbitrary function.
// widthFn(t) returns half-width in canvas pixels, where t is arc-length fraction [0,1].
// Used for 'e' and other letters where width varies non-trivially along the stroke.
function buildRibbon(centerline, widthFn) {
  const n = centerline.length;
  if (n < 2) return [];

  const arcLen = [0];
  for (let i = 1; i < n; i++) {
    const dx = centerline[i].x - centerline[i - 1].x;
    const dy = centerline[i].y - centerline[i - 1].y;
    arcLen.push(arcLen[i - 1] + Math.hypot(dx, dy));
  }
  const totalLen = arcLen[n - 1] || 1;

  const tops = [];
  const bots = [];
  for (let i = 0; i < n; i++) {
    const t = arcLen[i] / totalLen;
    const hw = widthFn(t);
    // Only break for sub-pixel width in the second half of the path
    // (taper-out zone). Don't break during taper-in at the start.
    if (hw < 0.3 && t > 0.5 && tops.length > 2) break;

    const prev = centerline[Math.max(0, i - 1)];
    const next = centerline[Math.min(n - 1, i + 1)];
    const tdx = next.x - prev.x, tdy = next.y - prev.y;
    const tlen = Math.hypot(tdx, tdy) || 1;
    const pnx = -tdy / tlen * hw, pny = tdx / tlen * hw;

    tops.push({ x: centerline[i].x + pnx, y: centerline[i].y + pny });
    bots.push({ x: centerline[i].x - pnx, y: centerline[i].y - pny });
  }

  const quads = [];
  for (let i = 0; i < tops.length - 1; i++) {
    quads.push([tops[i], tops[i + 1], bots[i + 1], bots[i]]);
  }
  return quads;
}

// ── Tapered ribbon builder ────────────────────────────────────────────────────
// Builds a closed polygon from a centerline polyline with power-law width taper.
// Used for flicks (pen exit strokes) where width decays from startWidth to zero.
//
// Params:
//   centerline: array of {x, y} points (canvas coords, from sampleSegments)
//   startWidth: half-width at the base (canvas pixels)
//   taperPower: exponent for (1-t)^p decay. ~1.7 for Matlack.
//   liftPoint:  fraction [0,1] of path where ink reaches zero. Default 1.0.
//
// Returns an array of quad polygons (each is 4 {x,y} points), one per segment.
// Rendering as individual quads avoids ear-clipping artifacts on thin polygons.
function buildTaperedRibbon(centerline, startWidth, taperPower, liftPoint = 1.0) {
  const n = centerline.length;
  if (n < 2) return [];

  // Compute cumulative arc length for parameterization
  const arcLen = [0];
  for (let i = 1; i < n; i++) {
    const dx = centerline[i].x - centerline[i - 1].x;
    const dy = centerline[i].y - centerline[i - 1].y;
    arcLen.push(arcLen[i - 1] + Math.hypot(dx, dy));
  }
  const totalLen = arcLen[n - 1] || 1;

  // Compute offset points at each centerline position
  const tops = [];
  const bots = [];
  for (let i = 0; i < n; i++) {
    const t = arcLen[i] / totalLen;
    let hw;
    if (t >= liftPoint) {
      hw = 0;
    } else {
      hw = startWidth * Math.pow(1 - t / liftPoint, taperPower);
    }
    if (hw < 0.3) break;

    const prev = centerline[Math.max(0, i - 1)];
    const next = centerline[Math.min(n - 1, i + 1)];
    const tdx = next.x - prev.x, tdy = next.y - prev.y;
    const tlen = Math.hypot(tdx, tdy) || 1;
    const pnx = -tdy / tlen * hw, pny = tdx / tlen * hw;

    tops.push({ x: centerline[i].x + pnx, y: centerline[i].y + pny });
    bots.push({ x: centerline[i].x - pnx, y: centerline[i].y - pny });
  }

  // Build quads between consecutive pairs of offset points
  const quads = [];
  for (let i = 0; i < tops.length - 1; i++) {
    quads.push([tops[i], tops[i + 1], bots[i + 1], bots[i]]);
  }
  return quads;
}

// ── Cubic bezier sampler ─────────────────────────────────────────────────────
// Samples n+1 points along a cubic bezier curve defined by 4 control points.
// Each control point is [x, y] in ref coords. Output is in canvas coords.
function sampleBezier(p0, p1, p2, p3, n, cx, cy, scale, refCenter) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    // Standard cubic bezier formula: B(t) = (1-t)³P₀ + 3(1-t)²tP₁ + 3(1-t)t²P₂ + t³P₃
    const rx = u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0];
    const ry = u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1];
    pts.push(refToCanvas(rx, ry, cx, cy, scale, refCenter));
  }
  return pts;
}

// ── Smooth interpolation ─────────────────────────────────────────────────────
// Cosine ease between values a and b. t clamped to [0,1].
// Used in width/density functions to avoid sharp corners in the rendered bowl.
// Without this, abrupt transitions in the widthFn create visible angular
// artifacts where the variable inner cutout changes direction suddenly.
function smoothStep(a, b, t) {
  const s = t < 0 ? 0 : t > 1 ? 1 : t;
  return a + (b - a) * (0.5 - 0.5 * Math.cos(s * Math.PI));
}

// ── Scale ellipse from ref coords to canvas coords ───────────────────────────
// Translates center, scales semi-axes, preserves tilt (degrees).
function scaleEllipse(e, cx, cy, scale, refCenter) {
  return {
    cx: cx + (e.cx - refCenter.x) * scale,
    cy: cy + (e.cy - refCenter.y) * scale,
    a: e.a * scale,   // semi-major axis in canvas pixels
    b: e.b * scale,   // semi-minor axis in canvas pixels
    tilt: e.tilt,      // degrees, unchanged by scaling
  };
}

// ── Sample and concatenate multiple bezier segments ──────────────────────────
// Builds a polyline from an array of bezier segments, skipping duplicate
// junction points between consecutive segments.
// segIndices: which segments to include (e.g., [2,3,4,5,6,7] for 'a' body)
function sampleSegments(segs, segIndices, n, cx, cy, scale, refCenter) {
  const pts = [];
  for (const si of segIndices) {
    const segPts = sampleBezier(...segs[si], n, cx, cy, scale, refCenter);
    const start = pts.length === 0 ? 0 : 1;  // skip first point of subsequent segs (= last point of prev)
    for (let i = start; i < segPts.length; i++) pts.push(segPts[i]);
  }
  return pts;
}

// ── Bowl phase constant ──────────────────────────────────────────────────────
// Shifts the width/density profile ~10° CCW around the bowl.
// This aligns the computed thickness zones with where Matlack actually
// deposits ink. Without this, the thin/fat transitions land about 10°
// off from the reference images. Value found empirically during 'a' iteration.
const BOWL_PHASE = 0.03;  // ~10° of a full 360° revolution

// ── Bowl arc zone boundaries ─────────────────────────────────────────────────
// Named by what the pen is doing at each transition point.
// These are arcFrac values AFTER BOWL_PHASE is applied (the 'f' variable
// in width functions). All bowl-family letters share these boundaries;
// only the width values at each zone differ per letter.
//
//   ENTRY (0.00) → pen enters bowl (upper-right). Start of the arc.
//   LIFT  (0.22) → pen lightens / accelerates. Thin zone ends.
//   PRESS (0.55) → pen hits peak pressure. Thickest zone starts.
//   RISE  (0.78) → pen accelerates out. Peak zone ends.
//
// The cycle is: ENTRY → thin top → LIFT → left descent → PRESS → peak → RISE → right ascent → ENTRY
const ARC_ENTRY = 0.00;  // upper-right: pen enters
const ARC_LIFT  = 0.22;  // top-left: pen lightens
const ARC_PRESS = 0.55;  // bottom-left: peak pressure begins
const ARC_RISE  = 0.78;  // bottom-right: pen starts rising

// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 'a'
// Source: sinback's hand traces on ref a/09 (4x upscaled Declaration facsimile)
// ═════════════════════════════════════════════════════════════════════════════

// Reference anchor: the center of 'a's inner (counter) ellipse in ref 09.
// All 'a' coordinates are relative to this point.
// Image: matlack-declaration/reference/lowercase/a_4x/09.png (132×104 at 4x)
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

// ── 'a' geometry builders ────────────────────────────────────────────────────

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



// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 'b'
// Source: sinback's hand traces on ref b/01 (4x upscaled Declaration facsimile)
// ═════════════════════════════════════════════════════════════════════════════

// Reference anchor: center of 'b's inner (counter) ellipse in ref b/01.
// Image: matlack-declaration/reference/lowercase/b_4x/01.png (140×196 at 4x)
const B_REF_CENTER = { x: 34.7, y: 149.2 };

// ── 'b' bowl ellipses ────────────────────────────────────────────────────────
// Hand-traced by sinback. Residuals < 0.06 — excellent ellipse fit.
// Tilt is very similar to 'a' (~-43° vs -45°) — same hand, same nib angle.
// Bowl is smaller than 'a' (inner a=26.6 vs 32.8).
// Tilt difference (inner vs outer) is only 1.3° — much less than 'a' (4.6°),
// meaning 'b's bowl has more uniform width around the arc.
const B_BOWL = {
  inner: {
    cx: 34.7,   // in ref b/01 coords (= B_REF_CENTER, maps to cx)
    cy: 149.2,  // note: b/01 is tall (196px at 4x), bowl is near the bottom
    a: 26.6,    // smaller semi-major than 'a' (26.6 vs 32.8)
    b: 11.0,    // smaller semi-minor than 'a' (11.0 vs 14.1)
    tilt: -43.5 // degrees. Very close to 'a' (-44.9°) — consistent hand.
  },
  outer: {
    cx: 34.8,   // nearly concentric with inner (offset: +0.1 px horizontally)
    cy: 145.0,  // 4.2 px above inner center (offset is mostly vertical)
    a: 50.3,    // outer/inner ratio: 1.89× (similar to 'a')
    b: 21.1,    // outer/inner ratio: 1.92× (similar to 'a')
    tilt: -42.2 // only 1.3° less than inner → uniform width around bowl
  },
};

// ── 'b' bar-bowl ellipses ─────────────────────────────────────────────────────
// The vertical stem of 'b' rendered as an elongated bowl (bar-bowl).
// Hand-traced from ref b/01, optimized ellipse fit (scipy, aspect ~0.13-0.18).
// Tilt is consistent with main bowl (~-49°). Very elongated (aspect 0.13 inner).
// Bar-bowl and main bowl overlap where the stem meets the counter — the
// renderer merges them in the same coverage FBO pass.
const B_BAR_BOWL = {
  inner: {
    cx: 72.6,    // in ref b/01 coords — far upper-right of the main bowl
    cy: 81.5,    // well above the main bowl center (149.2)
    a: 63.6,     // very long semi-major — this is the "height" of the stem
    b: 8.5,      // very narrow semi-minor — thin stem
    tilt: -49.3  // consistent with main bowl and 'a' (~-44 to -51° range)
  },
  outer: {
    cx: 72.4,    // nearly concentric with inner (offset: -0.2, -2.9)
    cy: 78.6,
    a: 85.5,     // inner→outer ratio: 1.34× (consistent with main bowl)
    b: 16.8,     // inner→outer ratio: 1.98× (consistent with main bowl)
    tilt: -48.6  // tilt diff from inner: 0.7° — very uniform width
  },
};

// ── 'b' bowl width function ──────────────────────────────────────────────────
// Same structure as 'a' but MIRRORED in arc space: (1 - arcFrac) flips
// the width profile horizontally so the fat part is on the bottom-right
// (where 'b's bowl is thickest) instead of bottom-left (where 'a's is).
//
// Thin floor is 0.30 (higher than 'a's 0.20) because 'b's bowl is smaller
// overall. A smaller bowl with a lower floor would vanish at small font sizes.
function bBowlWidth(arcFracRaw) {
  // Mirror by using (1 - arcFrac) — flips left↔right in the width profile
  const f = (1.0 - arcFracRaw + BOWL_PHASE + 1) % 1.0;
  if (f < 0.05) return smoothStep(0.45, 0.45, f / 0.05);           // stem side: stable
  if (f < 0.12) return smoothStep(0.45, 0.30, (f - 0.05) / 0.07);  // ease into thin
  if (f < ARC_LIFT) return 0.30;                                        // thin floor (higher than 'a')
  if (f < ARC_PRESS) { const t = (f - ARC_LIFT) / 0.33; return smoothStep(0.30, 1.0, t); }  // thin→fat
  if (f < ARC_RISE) return 1.0;                                         // peak width (bottom-right)
  if (f < 0.92) return smoothStep(1.0, 0.45, (f - ARC_RISE) / 0.14);   // fat→moderate
  return smoothStep(0.45, 0.45, (f - 0.92) / 0.08);                // returning to stem zone
}

// ── 'b' main bowl density ────────────────────────────────────────────────────
function bBowlDensity(arcFracRaw) {
  const f = (1.0 - arcFracRaw + BOWL_PHASE + 1) % 1.0;
  if (f > 0.10 && f < 0.25) return 0.65;
  return 0.85;
}

// ── 'b' bar-bowl width function ──────────────────────────────────────────────
// Very elongated shape (aspect ~0.13). Tilt diff is only 0.7° so width is
// nearly uniform. Gentle variation: slightly thinner at tips (top/bottom),
// full width through the middle of the stem.
function bBarBowlWidth(arcFracRaw) {
  const f = (arcFracRaw + BOWL_PHASE) % 1.0;
  // For elongated ellipse: arcFrac ~0.0 and ~0.5 = tips, ~0.25 and ~0.75 = sides
  if (f < 0.10) return smoothStep(0.40, 0.70, f / 0.10);
  if (f < 0.40) return smoothStep(0.70, 1.0, (f - 0.10) / 0.30);
  if (f < 0.60) return 1.0;
  if (f < 0.90) return smoothStep(1.0, 0.70, (f - 0.60) / 0.30);
  return smoothStep(0.70, 0.40, (f - 0.90) / 0.10);
}

function bBarBowlDensity() { return 0.85; }



// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 'f'
// Source: sinback's hand traces on context/fir/01 (4x upscaled Declaration)
// 'f' = bar-bowl (the tall curved stem) + horizontal hairline crossbar.
// The bar-bowl is the whole letter except the crossbar.
// Matlack's 'f' extends well above cap-height and below baseline ("a BEAST").
// ═════════════════════════════════════════════════════════════════════════════

// Reference anchor: center of 'f's inner bar-bowl ellipse in ref fir/01.
// Image: matlack-declaration/reference/context/fir_4x/01.png (304×312 at 4x)
// REF_CENTER at the crossbar y-level so 'f' aligns vertically with other letters.
// Original inner ellipse center was (171.4, 74.6); crossbar is at y≈160.
const F_REF_CENTER = { x: 171.4, y: 160.0 };

// ── 'f' bar-bowl ellipses ────────────────────────────────────────────────────
// Both inner and outer are GOOD ellipse fits (residuals ~0.098).
// Tilt is consistent with 'a' and 'b' (~-49° to -50°).
// Very elongated: aspect 0.13 inner, 0.17 outer.
const F_BAR_BOWL = {
  inner: {
    cx: 171.4,   // = F_REF_CENTER.x
    cy: 74.6,    // = F_REF_CENTER.y
    a: 52.9,     // semi-major (stem length)
    b: 7.1,      // semi-minor (stem width) — very thin
    tilt: -48.8  // consistent with other letters
  },
  outer: {
    cx: 176.0,   // offset from inner: (+4.6, -2.8)
    cy: 71.8,
    a: 84.9,     // inner→outer ratio: 1.60×
    b: 14.4,     // inner→outer ratio: 2.03×
    tilt: -50.0  // tilt diff from inner: -1.2° (very uniform width)
  },
};

// ── 'f' bar-bowl width function ──────────────────────────────────────────────
// Same approach as 'b' bar-bowl: gentle variation, thinner at tips.
// 'f' is taller than 'b's bar-bowl so the thin tips are more visible.
function fBarBowlWidth(arcFracRaw) {
  const f = (arcFracRaw + BOWL_PHASE) % 1.0;
  if (f < 0.10) return smoothStep(0.35, 0.65, f / 0.10);          // top tip
  if (f < 0.40) return smoothStep(0.65, 1.0, (f - 0.10) / 0.30);
  if (f < 0.60) return 1.0;                                        // middle: full
  if (f < 0.90) return smoothStep(1.0, 0.65, (f - 0.60) / 0.30);
  return smoothStep(0.65, 0.35, (f - 0.90) / 0.10);               // bottom tip
}

function fBarBowlDensity() { return 0.85; }

// ── 'f' hairline crossbar ────────────────────────────────────────────────────
// Nearly flat horizontal line. Traced as two points from ref fir/01.
// Extends from left of the bar-bowl to right side.
const F_HAIRLINE = {
  x1: 74.56, y1: 160.37,   // left end — extended 30% wider (was 81.56, delta ~7px each side)
  x2: 143.24, y2: 159.03,  // right end — extended 30% wider (was 136.24)
  halfHeight: 2.25,         // 50% thicker (was 1.5)
};

const F_HAIRLINE_OFFSET = {
  dx: 8,
  dy: -2,
}

// ── 'f' fat bar (descender stroke) ──────────────────────────────────────────
// The thick downstroke extending below the bar-bowl. Runs from the base
// of the bar-bowl down to the descender line. Oriented along the bar-bowl's
// major axis (same ~-49° tilt). Rendered as a straight filled rectangle
// using the two endpoint coords from the original traced bezier path.

// The fat bar width: should be slightly fatter than the bar-bowl's thickest
// part. The bar-bowl outer minor axis is 14.4px at 4x, so the fat bar
// half-width should be about 8-9px at 4x (full width ~16-18px).
const F_FAT_BAR_HALF_WIDTH = 6.3;  // ~70% of original 9.0

const F_FAT_BAR_OFFSET = {
  dx: 8,
  dy: -10,
}


// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 'c'
// Source: hand-traced inner + outer arcs on c/02 from high-res facsimile,
// ellipse fit via least-squares with tilt constrained to [-40, -52].
// 'c' is a partial bowl (~260° arc, gap on the right side).
// ═════════════════════════════════════════════════════════════════════════════

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

// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 'd'
// Source: hand-traced on d/01 from high-res 1823 facsimile (151×156, 1x).
// Structure: bowl (like 'a') + straight downstroke extending above.
// ═════════════════════════════════════════════════════════════════════════════

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

// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 'q'
// Source: hand-traced on q/01 from high-res 1823 facsimile (84×117, 1x).
// Structure: bowl + straight downstroke extending below (descender).
// Very similar to 'd' but the downstroke goes down instead of up.
// ═════════════════════════════════════════════════════════════════════════════

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

// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 't'
// Source: hand-traced on t/01 from high-res 1823 facsimile (117×132, 1x).
// Structure: entrance hairline (tapered ribbon) + fat bar (downstroke) +
//            crossbar hairline. No bowl — pure vertical family.
// Type 1 (most complete): all three components present.
// ═════════════════════════════════════════════════════════════════════════════

// Reference anchor: midpoint of the fat bar.
const T_REF_CENTER = { x: 59.0, y: 64.5 };

// Fat bar (main downstroke)
const T_FAT_BAR = {
  x1: 94.30, y1: 6.08,     // top
  x2: 23.96, y2: 122.92,   // bottom
};
const T_FAT_BAR_HALF_WIDTH = 5.5;  // slightly less than measured 12.8 at 1x — image includes blur
const T_FAT_BAR_OFFSET = { dx: 0, dy: 0 };

// Crossbar hairline (thin, nearly horizontal)
const T_CROSSBAR = {
  x1: 85.04, y1: 67.95,    // right end
  x2: 49.90, y2: 80.62,    // left end
  halfHeight: 1.5,
};
const T_CROSSBAR_OFFSET = { dx: 0, dy: 0 };

// Entrance hairline (leading stroke — tapered ribbon approaching fat bar)
// Starts thin at bottom-left, thickens toward the intersection with fat bar.
const T_ENTRANCE_SEGS = [
  [[6.77,98.97],[6.77,98.97],[72.61,41.99],[72.61,41.99]],
];
const T_ENTRANCE = {
  startWidth: 1.0,    // thin at the entry point
  taperPower: 1.7,    // same hand
  liftPoint: 1.0,     // tapers over full length (reversed — see render)
};

// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 'e'
// Source: hand-traced on e/01 from high-res 1823 facsimile (69×64, 1x).
// Structure: single continuous loop stroke — no separate bowl or crossbar.
// The pen traces: entry top-right → crossbar left → sweep down around bowl →
//                 come back up → exit right.
// Rendered as a variable-width ribbon following the loop centerline.
// ═════════════════════════════════════════════════════════════════════════════

const E_REF_CENTER = { x: 34.5, y: 32.0 };  // approximate center of the letter

// The full loop as bezier segments, traced from the 'e Loop' path in e/01_paths.
const E_LOOP_SEGS = [
  [[21.33,35.41],[21.27,36.14],[35.04,31.65],[35.61,29.65]],
  [[35.61,29.65],[41.81,27.15],[50.41,10.44],[50.00,10.59]],
  [[50.00,10.59],[51.44,9.37],[45.87,6.53],[42.76,9.31]],
  [[42.76,9.31],[41.17,8.09],[29.05,19.29],[29.84,19.84]],
  [[29.84,19.84],[28.14,20.43],[13.58,45.74],[18.59,46.23]],
  [[18.59,46.23],[16.34,53.24],[29.79,52.13],[30.51,49.90]],
  [[30.51,49.90],[29.86,51.47],[53.56,40.27],[53.59,40.21]],
];

// Width function for the loop. t = arc-length fraction [0, 1].
// The loop goes: crossbar entry (thin) → top curve → left descent (thickening)
//                → bottom (peak) → right ascent → exit (thinning)
function eLoopWidth(t, scale) {
  // Entry: crossbar, thin
  if (t < 0.15) return 1.5 * scale;

  // Curving over the top: still thin
  if (t < 0.30) return smoothStep(1.5, 2.0, (t - 0.15) / 0.15) * scale;

  // Left descent: thickening
  if (t < 0.55) return smoothStep(2.0, 5.5, (t - 0.30) / 0.25) * scale;

  // Bottom: peak width
  if (t < 0.70) return 5.5 * scale;

  // Right ascent + exit: thinning
  if (t < 0.90) return smoothStep(5.5, 1.5, (t - 0.70) / 0.20) * scale;

  // Exit flick
  return smoothStep(1.5, 0.5, (t - 0.90) / 0.10) * scale;
}

// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 'g'
// Source: hand-traced on g/01 from high-res 1823 facsimile (182×200, 1x).
// Structure: bowl (like 'a'/'d') + wiggly descender stroke rendered as
//            variable-width ribbon. The descender has a reversal/wiggle in
//            the middle and tapers to hairline at the bottom.
// ═════════════════════════════════════════════════════════════════════════════

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

// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 'h'
// Source: hand-traced on h/01 from high-res 1823 facsimile (160×182, 1x).
// Structure: entrance flick + bar-bowl (tall stem) + fat bar (short downstroke)
//            + variable-width hump.
// ═════════════════════════════════════════════════════════════════════════════

// Reference center: use the downstroke top as the anchor — all components
// are traced in the same image so they'll align correctly.
const H_REF_CENTER = { x: 61.13, y: 105.06 };

// Bar-bowl (tall stem) — using 'f' bar-bowl proportions for the inner
// semi-minor (b reduced from 8.7→5.5 to widen the ink gap).
// Ellipse centers shifted down 20px to close the gap between the
// fitted bar-bowl bottom and the downstroke top.
// Bar-bowl ellipse centers nudged so the bottom tip lands on the
// downstroke top (61.1, 105.1). Tip 2 was at (72.4, 110.6) —
// shift both centers by (-11, -5.5) to close the gap.
const H_BAR_BOWL = {
  inner: {
    cx: 90.2, cy: 69.1,
    a: 46.1, b: 5.5, tilt: -51.4
  },
  outer: {
    cx: 102.4, cy: 53.9,
    a: 59.5, b: 12.9, tilt: -49.5
  },
};

// Bar-bowl width/density — same pattern as 'b'/'f' bar-bowls
// Reuse 'f' bar-bowl width/density — same stem shape, proven parameters.
const hBarBowlWidth = fBarBowlWidth;
const hBarBowlDensity = fBarBowlDensity;

// Entrance flick (leading stroke from bottom-left)
const H_ENTRANCE_SEGS = [
  [[11.17,136.91],[12.18,137.70],[58.52,109.99],[56.28,108.23]],
];
const H_ENTRANCE = {
  startWidth: 1.0,
  taperPower: 1.7,
  liftPoint: 1.0,
};

// Downstroke + hump as one continuous path.
// The pen goes: down the fat bar → bottom → sweeps up into the hump → exit.
// Combining them because they're one continuous pen motion.
const H_STROKE_SEGS = [
  // Downstroke portion — starts 15px up the bar-bowl axis from the base
  // so the fat ribbon covers the bar-bowl's vanishing bottom tip.
  // Original base: (61.13, 105.06). Bar-bowl tilt ~-51°, so "up" is
  // (+15*cos(51°), -15*sin(51°)) ≈ (+9.4, -11.7)
  [[70.5,93.3],[70.5,93.3],[27.22,157.87],[27.22,157.87]],
  // Hump portion (curves up and around)
  [[28.35,159.16],[28.35,159.16],[53.74,126.56],[53.74,126.56]],
  [[53.74,126.56],[50.34,124.13],[85.90,103.12],[91.49,107.12]],
  [[91.49,107.12],[92.43,107.07],[98.96,126.12],[93.05,126.39]],
  [[93.05,126.39],[92.91,125.29],[76.75,140.38],[77.17,143.91]],
  [[77.17,143.91],[74.65,144.13],[72.38,155.43],[77.49,154.98]],
  [[77.49,154.98],[77.11,154.79],[89.99,155.75],[90.28,155.90]],
  [[90.28,155.90],[92.57,154.82],[121.51,132.24],[120.73,133.48]],
];
const H_STROKE_OFFSET = { dx: 4, dy: -4 };  // review round 1, candidate 3

// Combined downstroke+hump width function. t = arc-length fraction.
// The downstroke is roughly the first ~20% of the path (straight fat bar),
// then the hump curves up and around for the remaining ~80%.
function hStrokeWidth(t, scale) {
  // Downstroke: fat bar
  if (t < 0.10) return 5.0 * scale;

  // Downstroke bottom → hump entry: thinning at the turnaround
  if (t < 0.18) return smoothStep(5.0, 1.5, (t - 0.10) / 0.08) * scale;

  // Hump rising: thickening back up (less than the downstroke)
  if (t < 0.35) return smoothStep(1.5, 3.5, (t - 0.18) / 0.17) * scale;

  // Hump arch: moderate-fat
  if (t < 0.50) return 3.5 * scale;

  // Hump descending: thinning
  if (t < 0.65) return smoothStep(3.5, 2.5, (t - 0.50) / 0.15) * scale;

  // Bottom curve: moderate
  if (t < 0.80) return 3.0 * scale;

  // Thinning to hairline exit
  if (t < 0.92) return smoothStep(3.0, 0.7, (t - 0.80) / 0.12) * scale;

  // Hairline exit
  return 0.7 * scale;
}

// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 'i'
// Source: hand-traced on i/01 from high-res 1823 facsimile (121×137, 1x).
// Structure: entrance flick + downstroke (tapered ribbon) + dot (filled blob).
// The downstroke is a simple power taper — no piecewise width function needed.
// ═════════════════════════════════════════════════════════════════════════════

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

// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 'j'
// Source: hand-traced on j/01 from high-res 1823 facsimile (218×249, 1x).
// Structure: dot + entrance flick + downstroke (fat bar) + bar-bowl (bottom loop)
//            + exit flick. Similar to 'f' structurally.
// ═════════════════════════════════════════════════════════════════════════════

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

// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 'k'
// Source: hand-traced on k/01 from high-res 1823 facsimile (119×130, 1x).
// Three-stroke letter: 1) entrance flick + bar-bowl + downstroke,
// 2) retrace up along downstroke (implicit), 3) upper crescent + exit stroke.
// ═════════════════════════════════════════════════════════════════════════════

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

// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 'l'
// Source: hand-traced on l/01 from high-res 1823 facsimile (136×171, 1x).
// Structure: single continuous loop stroke, like 'e' but taller (ascender).
// Rendered as a variable-width ribbon following the loop centerline.
// ═════════════════════════════════════════════════════════════════════════════

const L_REF_CENTER = { x: 68.0, y: 85.0 };  // approximate center

const L_LOOP_SEGS = [
  [[6.45,115.73],[8.73,122.60],[78.00,88.13],[92.15,63.53]],
  [[92.15,63.53],[92.94,64.21],[114.44,26.63],[108.32,21.33]],
  [[108.32,21.33],[106.84,14.70],[65.05,56.32],[65.99,60.52]],
  [[65.99,60.52],[66.01,59.89],[36.11,100.64],[35.99,103.79]],
  [[35.99,103.79],[35.88,103.58],[8.60,139.55],[10.89,143.86]],
  [[10.89,143.86],[9.35,144.16],[7.42,152.94],[17.84,150.92]],
  [[17.84,150.92],[18.02,151.85],[28.03,151.23],[27.72,149.62]],
  [[27.72,149.62],[27.72,149.62],[56.60,129.42],[56.60,129.42]],
];

// Width function for l loop. Same shape as 'e' but the top portion
// is longer (ascender extends well above x-height).
function lLoopWidth(t, scale) {
  // Entry: thin (pen coming in from left)
  if (t < 0.10) return 1.5 * scale;

  // Rising to the top: slight thickening
  if (t < 0.25) return smoothStep(1.5, 2.5, (t - 0.10) / 0.15) * scale;

  // Top loop and descent: thickening through the long downstroke
  if (t < 0.50) return smoothStep(2.5, 5.5, (t - 0.25) / 0.25) * scale;

  // Bottom: peak width
  if (t < 0.65) return 5.5 * scale;

  // Right ascent + exit: thinning
  if (t < 0.85) return smoothStep(5.5, 1.5, (t - 0.65) / 0.20) * scale;

  // Exit flick
  return smoothStep(1.5, 0.5, (t - 0.85) / 0.15) * scale;
}

// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 'm'
// Source: hand-traced on m/01 from high-res 1823 facsimile (175×118, 1x).
// Structure: entrance flick + double-hump stroke (one continuous ribbon).
// ═════════════════════════════════════════════════════════════════════════════

const M_REF_CENTER = { x: 79.20, y: 37.62 };  // humps centerline start

const M_HUMPS_SEGS = [
  [[79.20,37.62],[79.97,37.56],[82.09,39.36],[81.72,42.28]],
  [[81.72,42.28],[83.45,43.32],[49.19,87.98],[47.11,86.73]],
  [[47.11,86.73],[47.09,86.72],[69.15,68.97],[71.01,68.53]],
  [[71.01,68.53],[71.01,68.53],[105.86,44.17],[105.86,44.17]],
  [[105.86,44.17],[105.97,43.34],[114.98,41.12],[116.11,43.29]],
  [[116.11,43.29],[117.39,44.45],[117.72,51.34],[117.18,53.49]],
  [[117.18,53.49],[115.07,58.96],[95.83,84.14],[94.43,83.73]],
  [[94.43,83.73],[94.23,83.72],[115.64,64.34],[118.34,62.81]],
  [[118.34,62.81],[118.26,61.19],[151.15,43.01],[152.18,42.91]],
  [[152.18,42.91],[154.76,40.48],[160.19,46.03],[159.74,47.86]],
  [[159.74,47.86],[157.37,53.72],[138.24,77.90],[138.10,77.69]],
  [[138.10,77.69],[136.56,81.83],[138.45,85.50],[142.90,86.60]],
  [[142.90,86.60],[143.22,87.67],[154.93,86.08],[155.30,85.54]],
  [[155.30,85.54],[157.38,84.82],[183.40,67.70],[183.23,67.59]],
];

const M_ENTRANCE_SEGS = [
  [[30.51,72.89],[31.01,72.18],[75.35,32.18],[79.40,37.67]],
];
const M_ENTRANCE = { startWidth: 1.0, taperPower: 1.7, liftPoint: 1.0 };

// Width function for the double-hump centerline.
// Two hump cycles: each goes thin (turnaround) → fat (arch) → thin (descent).
// The centerline has roughly:
//   0-5%:   initial small loop/blob
//   5-20%:  first descent (fat)
//  20-30%:  first turnaround (thin)
//  30-42%:  first hump arch (fat)
//  42-50%:  second descent (fat)
//  50-58%:  second turnaround (thin)
//  58-70%:  second hump arch (fat)
//  70-80%:  second descent (fat)
//  80-90%:  bottom loop
//  90-100%: exit flick (hairline)
function mHumpsWidth(t, scale) {
  // Initial blob/loop
  if (t < 0.05) return 3.0 * scale;

  // First descent
  if (t < 0.18) return smoothStep(3.0, 5.0, (t - 0.05) / 0.13) * scale;

  // First turnaround (thin)
  if (t < 0.28) return smoothStep(5.0, 1.5, (t - 0.18) / 0.10) * scale;

  // First hump rising
  if (t < 0.38) return smoothStep(1.5, 4.0, (t - 0.28) / 0.10) * scale;

  // First hump arch + second descent
  if (t < 0.50) return smoothStep(4.0, 5.0, (t - 0.38) / 0.12) * scale;

  // Second turnaround (thin)
  if (t < 0.58) return smoothStep(5.0, 1.5, (t - 0.50) / 0.08) * scale;

  // Second hump rising
  if (t < 0.68) return smoothStep(1.5, 4.0, (t - 0.58) / 0.10) * scale;

  // Second hump arch + descent
  if (t < 0.78) return smoothStep(4.0, 3.5, (t - 0.68) / 0.10) * scale;

  // Bottom loop
  if (t < 0.88) return smoothStep(3.5, 2.5, (t - 0.78) / 0.10) * scale;

  // Exit flick (hairline)
  return smoothStep(2.5, 0.7, (t - 0.88) / 0.12) * scale;
}

// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 'n'
// Source: hand-traced on n/01 from high-res 1823 facsimile (107×93, 1x).
// Structure: entrance flick + single-hump stroke (like 'm' with one hump).
// ═════════════════════════════════════════════════════════════════════════════

const N_REF_CENTER = { x: 34.90, y: 27.43 };  // hump centerline start

const N_HUMP_SEGS = [
  [[34.90,27.43],[35.65,26.70],[39.17,32.06],[38.12,33.08]],
  [[38.12,33.08],[39.22,34.44],[19.99,70.45],[17.70,69.58]],
  [[17.70,69.58],[17.69,69.58],[68.59,23.88],[69.85,24.86]],
  [[69.85,24.86],[69.76,24.69],[76.26,24.29],[76.90,25.49]],
  [[76.90,25.49],[77.08,25.32],[81.47,29.88],[81.00,31.02]],
  [[81.00,31.02],[81.63,31.64],[80.74,35.22],[80.44,34.92]],
  [[80.44,34.92],[81.95,36.72],[61.19,65.07],[61.11,64.97]],
  [[61.11,64.97],[60.49,65.00],[61.12,70.45],[62.95,70.38]],
  [[62.95,70.38],[62.45,70.52],[66.90,73.14],[68.79,72.60]],
  [[68.79,72.60],[68.63,72.96],[75.98,72.92],[76.45,71.90]],
  [[76.45,71.90],[76.84,72.65],[94.67,54.23],[94.15,53.24]],
];

const N_ENTRANCE_SEGS = [
  [[3.35,54.91],[3.31,54.89],[28.12,27.81],[28.98,28.18]],
  [[28.98,28.18],[28.83,27.81],[34.31,26.43],[34.74,27.45]],
];
const N_ENTRANCE = { startWidth: 1.0, taperPower: 1.7, liftPoint: 1.0 };

// Width function for single hump. Same pattern as one cycle of 'm'.
function nHumpWidth(t, scale) {
  // Initial blob/loop at top
  if (t < 0.05) return 3.0 * scale;

  // First descent (fat)
  if (t < 0.20) return smoothStep(3.0, 5.0, (t - 0.05) / 0.15) * scale;

  // Turnaround (thin)
  if (t < 0.30) return smoothStep(5.0, 1.5, (t - 0.20) / 0.10) * scale;

  // Hump rising
  if (t < 0.42) return smoothStep(1.5, 4.0, (t - 0.30) / 0.12) * scale;

  // Hump arch (fat)
  if (t < 0.55) return 4.0 * scale;

  // Descent
  if (t < 0.70) return smoothStep(4.0, 3.5, (t - 0.55) / 0.15) * scale;

  // Bottom loop
  if (t < 0.82) return smoothStep(3.5, 2.5, (t - 0.70) / 0.12) * scale;

  // Exit flick (hairline)
  return smoothStep(2.5, 0.7, (t - 0.82) / 0.18) * scale;
}

// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 'p'
// Source: hand-traced on p/01 from high-res 1823 facsimile (160×196, 1x).
// Structure: main downstroke (long fat bar descender) + upstroke hairline
//            + second downstroke (power taper). No bowl — Matlack's 'p' form.
// ═════════════════════════════════════════════════════════════════════════════

const P_REF_CENTER = { x: 115.80, y: 53.08 };  // second downstroke start / junction

// Main downstroke (long descender)
const P_MAIN_DOWNSTROKE = {
  x1: 116.81, y1: 12.61,
  x2: 15.32,  y2: 178.87,
};
const P_MAIN_HALF_WIDTH = 5.0;
const P_MAIN_OFFSET = { dx: 4, dy: 0 };  // review round 1, candidate 6

// Upstroke hairline (thin connector going left)
const P_UPSTROKE_SEGS = [
  [[115.32,53.10],[115.57,52.73],[74.01,79.77],[71.11,84.10]],
];
const P_UPSTROKE = { startWidth: 1.5, taperPower: 1.7, liftPoint: 0.90 };

// Second downstroke (power taper — starts fat, tapers to hairline exit)
const P_SECOND_SEGS = [
  [[115.80,53.08],[116.56,52.53],[123.07,61.09],[120.42,63.02]],
  [[120.42,63.02],[119.83,66.05],[91.33,104.58],[91.71,105.63]],
  [[91.71,105.63],[90.76,107.86],[99.71,113.56],[100.27,112.24]],
  [[100.27,112.24],[100.92,113.39],[115.27,110.78],[114.65,109.68]],
  [[114.65,109.68],[114.65,109.68],[137.62,86.34],[137.62,86.34]],
];
const P_SECOND_OFFSET = { dx: 0, dy: 0 };

// Piecewise width for the second downstroke. Smooths the transition
// from the hairline upstroke junction through the fat body to exit.
function pSecondWidth(t, scale) {
  // Entry from junction: starts moderate, thickens
  if (t < 0.08) return 3.0 * scale;
  if (t < 0.20) return smoothStep(3.0, 5.5, (t - 0.08) / 0.12) * scale;

  // Main descent: fat
  if (t < 0.45) return 5.5 * scale;

  // Approaching bottom loop: slight thinning
  if (t < 0.60) return smoothStep(5.5, 4.0, (t - 0.45) / 0.15) * scale;

  // Bottom loop
  if (t < 0.75) return smoothStep(4.0, 3.0, (t - 0.60) / 0.15) * scale;

  // Exit flick: thinning to hairline
  if (t < 0.90) return smoothStep(3.0, 0.7, (t - 0.75) / 0.15) * scale;

  return 0.7 * scale;
}

// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 'r'
// Source: hand-traced on r/01 from high-res 1823 facsimile (90×116, 1x).
// Beginning-of-word form. Structure: entrance flick + swoop/downstroke
// (combined ribbon) + exit flick.
// ═════════════════════════════════════════════════════════════════════════════

const R_REF_CENTER = { x: 55, y: 44 };  // junction of entrance/swoop/downstroke

// Entrance flick
const R_ENTRANCE_SEGS = [
  [[18.10,64.90],[18.10,64.90],[51.44,37.99],[51.44,37.99]],
];
const R_ENTRANCE = { startWidth: 1.0, taperPower: 1.7, liftPoint: 1.0 };

// Swoop + downstroke as one continuous stroke
const R_STROKE_SEGS = [
  // Swoop (the little hook that makes 'r' recognizable)
  [[51.75,38.69],[50.92,38.22],[53.16,49.03],[58.52,49.45]],
  // Downstroke
  [[58.96,49.27],[58.96,49.27],[30.91,80.27],[32.80,83.77]],
  [[32.80,83.77],[31.26,84.62],[34.47,95.36],[36.97,93.99]],
];

// Width function: swoop is thin, descent fattens, bottom loop thins
function rStrokeWidth(t, scale) {
  // Swoop entry: thin
  if (t < 0.10) return 2.0 * scale;

  // Swoop body: moderate
  if (t < 0.25) return smoothStep(2.0, 3.5, (t - 0.10) / 0.15) * scale;

  // Transition to descent: fattening
  if (t < 0.40) return smoothStep(3.5, 5.0, (t - 0.25) / 0.15) * scale;

  // Main descent: fat
  if (t < 0.65) return 5.0 * scale;

  // Bottom turnaround: thinning
  if (t < 0.80) return smoothStep(5.0, 3.0, (t - 0.65) / 0.15) * scale;

  // Bottom loop: moderate, thinning to exit
  return smoothStep(3.0, 1.5, (t - 0.80) / 0.20) * scale;
}

// Exit flick
const R_EXIT_SEGS = [
  [[37.56,94.79],[36.90,95.64],[50.31,96.17],[51.21,95.00]],
  [[51.21,95.00],[51.21,95.00],[74.98,86.19],[74.98,86.19]],
];
const R_EXIT = { startWidth: 2.5, taperPower: 1.7, liftPoint: 0.85 };
const R_EXIT_OFFSET = { dx: 0, dy: 0 };

// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 'w'
// Source: hand-traced on w/03 from high-res 1823 facsimile (134×87, 1x).
// Structure: entrance flick + double-descent stroke (like 'm' mirrored) +
//            ink blob at third peak + exit flick.
// ═════════════════════════════════════════════════════════════════════════════

const W_REF_CENTER = { x: 43, y: 32 };  // entrance flick end / first descent top

// Entrance flick — extended further left and steepened to separate
// from the first descent visually.
const W_ENTRANCE_SEGS = [
  [[-5,78],[-5,78],[42.95,31.91],[42.95,31.91]],
];
const W_ENTRANCE = { startWidth: 1.0, taperPower: 1.7, liftPoint: 1.0 };

// Combined stroke: initial downstroke → second flick → second downstroke → third flick
const W_STROKE_SEGS = [
  // Initial downstroke
  [[44.45,32.90],[44.02,32.90],[10.60,68.37],[17.49,70.34]],
  // Second flick (swoops back up-right)
  [[17.75,70.95],[17.61,70.84],[21.73,78.17],[22.64,78.85]],
  [[22.64,78.85],[31.57,84.37],[82.61,35.35],[81.78,34.80]],
  // Second downstroke
  [[81.99,34.88],[81.99,34.88],[53.62,61.64],[57.58,65.04]],
  [[57.58,65.04],[56.39,65.49],[58.29,71.36],[61.55,70.13]],
  // Third flick (swoops up to blob)
  [[62.28,70.17],[63.40,73.47],[77.91,72.53],[77.69,71.87]],
  [[77.69,71.87],[85.14,74.26],[112.96,34.03],[111.61,33.60]],
];

// Width function: two descent cycles, like 'm' but with the flow reversed.
// descent → thin turnaround → rise → descent → thin turnaround → rise → thins to blob
function wStrokeWidth(t, scale) {
  // First descent: fat
  if (t < 0.12) return smoothStep(3.0, 5.0, t / 0.12) * scale;

  // First turnaround: thin
  if (t < 0.20) return smoothStep(5.0, 1.5, (t - 0.12) / 0.08) * scale;

  // First rise / second flick: thickening
  if (t < 0.35) return smoothStep(1.5, 4.0, (t - 0.20) / 0.15) * scale;

  // Transition to second descent
  if (t < 0.45) return smoothStep(4.0, 5.0, (t - 0.35) / 0.10) * scale;

  // Second descent: fat
  if (t < 0.55) return 5.0 * scale;

  // Second turnaround: thin
  if (t < 0.63) return smoothStep(5.0, 1.5, (t - 0.55) / 0.08) * scale;

  // Second rise / third flick: thickening then thinning to blob
  if (t < 0.78) return smoothStep(1.5, 4.0, (t - 0.63) / 0.15) * scale;
  if (t < 0.90) return smoothStep(4.0, 2.5, (t - 0.78) / 0.12) * scale;

  // Approaching blob: thin
  return smoothStep(2.5, 1.0, (t - 0.90) / 0.10) * scale;
}

// Ink blob at third peak
const W_BLOB_SEGS = [
  [[109.23,24.35],[108.06,24.31],[97.96,32.65],[99.07,32.68]],
  [[99.07,32.68],[97.85,33.74],[101.20,44.33],[102.88,43.06]],
  [[102.88,43.06],[102.94,44.62],[109.14,44.79],[109.12,44.08]],
  [[109.12,44.08],[109.43,44.79],[119.63,41.39],[118.97,39.92]],
  [[118.97,39.92],[120.24,40.15],[120.91,27.76],[120.52,27.70]],
  [[120.52,27.70],[121.28,26.01],[112.14,19.51],[110.11,24.05]],
];
const W_BLOB_OFFSET = { dx: -4, dy: -4 };  // review round 1, candidate 1

// Exit flick — extended further right for visibility
const W_EXIT_SEGS = [
  [[109.38,37.28],[109.59,37.54],[145.00,35.00],[145.00,35.00]],
];
const W_EXIT = { startWidth: 2.0, taperPower: 1.7, liftPoint: 0.90 };
const W_EXIT_OFFSET = { dx: 0, dy: 0 };

// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 's'
// Source: hand-traced on s/01 from high-res 1823 facsimile (91×91, 1x).
// Structure: entrance flick + swoopy S-curve.
// Surprisingly consistent width — nearly uniform through the whole stroke.
// ═════════════════════════════════════════════════════════════════════════════

const S_REF_CENTER = { x: 68, y: 24 };  // entrance flick end / swoop start

// Entrance flick
const S_ENTRANCE_SEGS = [
  [[4.27,70.30],[4.27,70.30],[68.06,23.81],[68.31,24.20]],
];
const S_ENTRANCE = { startWidth: 1.0, taperPower: 1.7, liftPoint: 1.0 };

// Swoopy S-curve
const S_SWOOP_SEGS = [
  [[68.85,23.67],[67.85,22.85],[55.18,32.12],[57.52,33.90]],
  [[57.52,33.90],[60.61,34.28],[60.91,59.47],[55.03,58.49]],
  [[55.03,58.49],[56.07,60.15],[31.69,71.04],[30.74,69.50]],
  [[30.74,69.50],[30.18,70.83],[19.13,66.44],[20.95,62.60]],
  [[20.95,62.60],[16.98,61.44],[27.19,47.76],[28.33,48.08]],
];

// Width: nearly uniform, slight thinning at entry and exit
function sSwoopWidth(t, scale) {
  // Entry: thicken from junction
  if (t < 0.10) return smoothStep(3.5, 5.0, t / 0.10) * scale;

  // Main body: uniform fat
  if (t < 0.80) return 5.0 * scale;

  // Exit: slight thinning
  return smoothStep(5.0, 2.5, (t - 0.80) / 0.20) * scale;
}

// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 'u'
// Source: hand-traced on u/01 from high-res 1823 facsimile (123×85, 1x).
// Structure: entrance flick + single descent/rise stroke + exit flick.
// Like 'w' with one fewer hump, or 'n' mirrored.
// ═════════════════════════════════════════════════════════════════════════════

const U_REF_CENTER = { x: 64, y: 24 };  // entrance flick end / first descent top

// Entrance flick
const U_ENTRANCE_SEGS = [
  [[10.16,65.05],[15.42,69.71],[65.46,25.33],[64.15,24.16]],
];
const U_ENTRANCE = { startWidth: 1.0, taperPower: 1.7, liftPoint: 1.0 };

// Combined stroke: initial downstroke → intermediate flick → second downstroke
const U_STROKE_SEGS = [
  // Initial downstroke
  [[63.35,23.23],[63.35,23.23],[24.78,66.96],[30.41,70.91]],
  [[30.41,70.91],[28.71,72.10],[34.43,77.46],[35.55,76.63]],
  [[35.55,76.63],[35.55,77.15],[44.31,74.89],[44.58,73.59]],
  // Intermediate flick (rise back up)
  [[44.21,74.38],[44.21,74.38],[104.33,25.26],[104.33,25.26]],
  // Second downstroke
  [[105.79,25.21],[105.59,24.91],[76.34,57.82],[78.11,60.49]],
  [[78.11,60.49],[74.01,62.59],[78.48,74.18],[80.68,72.92]],
  [[80.68,72.92],[80.59,73.87],[86.92,71.87],[87.06,70.01]],
];

// Width: single descent/rise cycle like 'n'
function uStrokeWidth(t, scale) {
  // First descent: fat
  if (t < 0.08) return smoothStep(3.0, 5.0, t / 0.08) * scale;
  if (t < 0.20) return 5.0 * scale;

  // Turnaround: thin
  if (t < 0.30) return smoothStep(5.0, 1.5, (t - 0.20) / 0.10) * scale;

  // Rise / intermediate flick: thickening
  if (t < 0.50) return smoothStep(1.5, 4.0, (t - 0.30) / 0.20) * scale;

  // Second descent: fat
  if (t < 0.70) return smoothStep(4.0, 5.0, (t - 0.50) / 0.20) * scale;

  // Bottom loop: thinning
  if (t < 0.85) return smoothStep(5.0, 2.5, (t - 0.70) / 0.15) * scale;

  // Exit: thin
  return smoothStep(2.5, 1.0, (t - 0.85) / 0.15) * scale;
}

// Exit flick
const U_EXIT_SEGS = [
  [[87.30,70.33],[87.30,70.33],[120.07,39.38],[120.07,39.38]],
];
const U_EXIT = { startWidth: 2.0, taperPower: 1.7, liftPoint: 0.85 };

// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 'v'
// Source: hand-traced on v/02 from high-res 1823 facsimile (91×87, 1x).
// Structure: entrance flick + V-stroke (downstroke + upstroke combined) +
//            fat exit (NOT a hairline flick — stays thick).
// ═════════════════════════════════════════════════════════════════════════════

const V_REF_CENTER = { x: 28, y: 29 };  // entrance flick end / downstroke top

// Entrance flick
const V_ENTRANCE_SEGS = [
  [[2.57,50.49],[2.13,50.13],[21.50,24.18],[28.14,29.58]],
];
const V_ENTRANCE = { startWidth: 1.0, taperPower: 1.7, liftPoint: 1.0 };

// V-stroke: downstroke + upstroke combined
const V_STROKE_SEGS = [
  // Downstroke
  [[28.08,28.93],[28.08,28.93],[30.89,34.29],[30.89,34.29]],
  [[30.89,34.29],[33.80,38.05],[14.67,60.15],[17.29,63.11]],
  [[17.29,63.11],[15.73,63.91],[19.42,73.42],[22.58,71.81]],
  [[22.58,71.81],[23.26,72.98],[31.69,71.22],[30.78,69.66]],
  // Upstroke flick
  [[30.63,70.47],[31.82,71.82],[69.19,31.78],[65.48,27.92]],
];

function vStrokeWidth(t, scale) {
  // Entry from top: moderate thickening
  if (t < 0.08) return smoothStep(3.0, 5.0, t / 0.08) * scale;

  // Main descent: fat
  if (t < 0.30) return 5.0 * scale;

  // Bottom turnaround: thin
  if (t < 0.45) return smoothStep(5.0, 1.5, (t - 0.30) / 0.15) * scale;

  // Upstroke: thickening
  if (t < 0.70) return smoothStep(1.5, 4.0, (t - 0.45) / 0.25) * scale;

  // Approaching exit junction: moderate
  if (t < 0.90) return smoothStep(4.0, 3.0, (t - 0.70) / 0.20) * scale;

  // End: moderate
  return 3.0 * scale;
}

// Fat exit: stays thick, not a hairline. Curves down then goes right.
const V_EXIT_SEGS = [
  [[65.51,27.99],[65.44,27.91],[58.23,42.67],[59.64,44.33]],
  [[59.64,44.33],[58.79,44.81],[61.50,50.10],[63.64,48.87]],
  [[63.64,48.87],[63.13,49.72],[82.66,49.92],[83.30,48.85]],
];

function vExitWidth(t, scale) {
  // Starts moderate, stays fat throughout
  if (t < 0.15) return smoothStep(3.0, 4.5, t / 0.15) * scale;
  if (t < 0.70) return 4.5 * scale;
  return smoothStep(4.5, 2.0, (t - 0.70) / 0.30) * scale;
}

// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 'x'
// Source: hand-traced on x/01 from high-res 1823 facsimile (116×82, 1x).
// Structure: two crossing crescent strokes (like a backwards 'c' + a 'c').
// Each rendered as a variable-width ribbon, fat in the middle, thin at tips.
// ═════════════════════════════════════════════════════════════════════════════

const X_REF_CENTER = { x: 65, y: 50 };  // crossing point

// Right crescent: upper-right → center → lower-right
const X_RIGHT_SEGS = [
  [[92.38,34.37],[93.06,35.01],[96.05,28.55],[94.22,26.81]],
  [[94.22,26.81],[94.73,25.08],[77.88,30.71],[76.11,36.68]],
  [[76.11,36.68],[75.37,36.51],[64.58,51.34],[65.13,51.58]],
  [[65.13,51.58],[65.11,51.67],[55.33,64.98],[60.31,69.40]],
  [[60.31,69.40],[59.63,69.81],[66.05,75.56],[67.49,74.67]],
  [[67.49,74.67],[67.49,74.67],[74.23,74.30],[74.23,74.30]],
  [[74.23,74.30],[74.23,74.30],[97.68,63.73],[97.68,63.73]],
];

// Left crescent: upper-left → center → lower-left
const X_LEFT_SEGS = [
  [[38.89,36.59],[38.62,36.04],[65.47,17.26],[67.42,21.23]],
  [[67.42,21.23],[69.04,21.09],[69.56,40.82],[67.41,41.01]],
  [[67.41,41.01],[68.42,41.55],[55.54,59.93],[53.19,58.67]],
  [[53.19,58.67],[53.83,60.05],[28.16,73.52],[27.47,71.72]],
  [[27.47,71.72],[27.57,72.25],[16.15,71.91],[16.86,68.45]],
  [[16.86,68.45],[12.61,67.31],[22.25,52.59],[24.56,53.21]],
];
const X_LEFT_OFFSET = { dx: 0, dy: 0 };

// Symmetric lens width: thin at tips, fat in the middle.
// Minimum width 1.0 to prevent sub-pixel disappearance at small zoom levels.
function xCrescentWidth(t, scale) {
  const d = Math.abs(t - 0.50);
  if (d < 0.10) return 5.0 * scale;
  if (d < 0.35) return smoothStep(5.0, 2.0, (d - 0.10) / 0.25) * scale;
  return smoothStep(2.0, 1.0, (d - 0.35) / 0.15) * scale;
}

// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 'z'
// Source: hand-traced on z/01 from high-res 1823 facsimile (118×173, 1x).
// Structure: entry flick + "main weird stroke" (the zigzag z-shape) +
//            bar-bowl descender loop + exit flick.
// ═════════════════════════════════════════════════════════════════════════════

const Z_REF_CENTER = { x: 50, y: 34 };  // entry flick end / weird stroke start

// Entry flick
const Z_ENTRY_SEGS = [
  [[11.96,67.92],[11.96,67.92],[50.28,33.68],[50.28,33.68]],
];
const Z_ENTRY = { startWidth: 1.0, taperPower: 1.7, liftPoint: 1.0 };

// Main weird stroke — the zigzag z-shape
const Z_STROKE_SEGS = [
  [[49.25,33.43],[48.45,33.77],[48.29,43.03],[50.55,42.07]],
  [[50.55,42.07],[49.32,43.83],[56.40,50.00],[58.39,47.79]],
  [[58.39,47.79],[58.39,47.79],[77.14,35.58],[77.14,35.58]],
  [[77.14,35.58],[75.00,32.83],[30.64,70.68],[31.51,71.79]],
  [[31.51,71.79],[31.13,71.18],[50.02,65.76],[50.92,67.20]],
  [[50.92,67.20],[52.69,66.46],[62.02,78.76],[57.88,80.51]],
  [[57.88,80.51],[57.88,80.51],[58.06,84.23],[58.06,84.23]],
];

// Width: blob at top, fat diagonal, thin turnaround, fat return, thins to bar-bowl
function zStrokeWidth(t, scale) {
  // Top blob
  if (t < 0.08) return 3.5 * scale;

  // First arm going right: moderate
  if (t < 0.20) return smoothStep(3.5, 3.0, (t - 0.08) / 0.12) * scale;

  // Diagonal descent: fattening
  if (t < 0.45) return smoothStep(3.0, 5.0, (t - 0.20) / 0.25) * scale;

  // Turnaround at bottom of diagonal
  if (t < 0.55) return smoothStep(5.0, 2.0, (t - 0.45) / 0.10) * scale;

  // Return stroke going up-right: thickening
  if (t < 0.75) return smoothStep(2.0, 4.5, (t - 0.55) / 0.20) * scale;

  // Descending to bar-bowl junction: thinning
  return smoothStep(4.5, 2.0, (t - 0.75) / 0.25) * scale;
}

// Bar-bowl (descender loop)
const Z_BAR_BOWL = {
  inner: {
    cx: 27.9, cy: 129.7,
    a: 32.6, b: 7.5, tilt: -48.9
  },
  outer: {
    cx: 28.2, cy: 129.4,
    a: 46.9, b: 12.9, tilt: -46.4   // tilt diff 5.6°
  },
};
// Reuse 'f' bar-bowl width — proven formula
const zBarBowlWidth = fBarBowlWidth;
const zBarBowlDensity = fBarBowlDensity;

// Exit flick
const Z_EXIT_SEGS = [
  [[56.46,87.45],[56.46,87.45],[108.06,46.49],[108.06,46.49]],
];
const Z_EXIT = { startWidth: 2.0, taperPower: 1.7, liftPoint: 0.85 };

// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 'y'
// Source: hand-traced on y/01 from high-res 1823 facsimile (227×196, 1x).
// Structure: entry flick + initial downstroke (variable-width ribbon) +
//            second downstroke (fat bar / ribbon) + bar-bowl loop (descender)
//            + exit flick.
// REF_CENTER at the junction point where all strokes converge.
// ═════════════════════════════════════════════════════════════════════════════

// REF_CENTER shifted up to x-height midline so 'y' aligns with other letters.
// Original junction was (95, 113); entry zone is around y≈45.
const Y_REF_CENTER = { x: 95, y: 50 };

// Entry flick
const Y_ENTRY_SEGS = [
  [[84.28,48.59],[84.44,48.59],[98.86,38.05],[98.86,38.05]],
];
const Y_ENTRY = { startWidth: 1.0, taperPower: 1.7, liftPoint: 1.0 };

// Initial downstroke — curved stroke going down-left then looping back up.
// Width function written without outline — inferred from reference image.
const Y_INITIAL_SEGS = [
  [[98.47,38.52],[98.55,37.15],[110.89,32.70],[110.75,34.95]],
  [[110.75,34.95],[115.47,37.84],[93.20,68.82],[90.58,67.22]],
  [[90.58,67.22],[88.50,68.04],[88.62,77.42],[91.91,76.12]],
  [[91.91,76.12],[93.80,80.51],[126.28,64.32],[125.23,61.88]],
];

// Width function for initial downstroke. The stroke:
//   0-10%: entry from top — starts thin (connecting to entry flick)
//  10-40%: main descent — fattens up (pen decelerating)
//  40-60%: bottom turnaround — thins (pen changes direction)
//  60-85%: rising back to junction — moderate width
//  85-100%: arrives at junction — thins to merge with exit
function yInitialWidth(t, scale) {
  if (t < 0.10) return smoothStep(2.0, 3.5, t / 0.10) * scale;
  if (t < 0.40) return smoothStep(3.5, 5.0, (t - 0.10) / 0.30) * scale;
  if (t < 0.55) return smoothStep(5.0, 1.5, (t - 0.40) / 0.15) * scale;
  if (t < 0.75) return smoothStep(1.5, 3.5, (t - 0.55) / 0.20) * scale;
  if (t < 0.90) return smoothStep(3.5, 2.0, (t - 0.75) / 0.15) * scale;
  return smoothStep(2.0, 0.7, (t - 0.90) / 0.10) * scale;
}

// Second downstroke — straight-ish from upper-right to junction
const Y_SECOND_SEGS = [
  [[156.74,29.03],[156.74,29.03],[142.87,39.20],[142.87,39.20]],
  [[142.87,39.20],[140.10,39.20],[95.41,115.40],[95.96,115.40]],
];
const Y_SECOND_HALF_WIDTH = 5.0;
const Y_SECOND_OFFSET = { dx: 0, dy: 0 };

// Bar-bowl / descender loop
const Y_BAR_BOWL = {
  inner: {
    cx: 52.4, cy: 152.3,
    a: 36.7, b: 5.3, tilt: -39.9
  },
  outer: {
    cx: 44.0, cy: 157.8,
    a: 56.5, b: 10.9, tilt: -36.3   // tilt diff 3.3°
  },
};

function yBarBowlWidth(arcFracRaw) {
  const f = (arcFracRaw + BOWL_PHASE) % 1.0;
  if (f < 0.10) return smoothStep(0.45, 0.70, f / 0.10);
  if (f < 0.40) return smoothStep(0.70, 1.0, (f - 0.10) / 0.30);
  if (f < 0.60) return 1.0;
  if (f < 0.90) return smoothStep(1.0, 0.70, (f - 0.60) / 0.30);
  return smoothStep(0.70, 0.45, (f - 0.90) / 0.10);
}
function yBarBowlDensity() { return 0.85; }

// Exit flick
const Y_EXIT_SEGS = [
  [[94.52,113.00],[94.40,113.09],[199.90,55.86],[199.90,55.86]],
];
const Y_EXIT = { startWidth: 2.5, taperPower: 1.7, liftPoint: 0.85 };
const Y_EXIT_OFFSET = { dx: 0, dy: 0 };

// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 'o'
// Source: automated crescent fit on o/03 from high-res 1823 facsimile.
// 'o' is the simplest letter: just a bowl, no extra components.
// Confirmed tilt consistency with a/b/f at -45.5°.
// ═════════════════════════════════════════════════════════════════════════════

// Reference anchor: center of 'o's inner ellipse in ref o/03.
// Image: reference/lowercase/o/03.png (75×66, 1x from high-res facsimile)
const O_REF_CENTER = { x: 40.3, y: 33.5 };

// ── 'o' bowl ellipses ────────────────────────────────────────────────────────
// Automated fit via scipy Nelder-Mead crescent model (93.8% → 86.2% constrained).
// Tilt constrained to match across inner/outer (known from a/b/f).
// Inner/outer ratio: a=0.54, b=0.71 — similar to 'a'.
const O_BOWL = {
  inner: {
    cx: 40.3,    // = O_REF_CENTER.x
    cy: 33.5,    // = O_REF_CENTER.y
    a: 20.8,     // semi-major
    b: 10.8,     // semi-minor
    tilt: -45.5  // consistent with a (-44.9), b (-43.5), f (-48.8)
  },
  outer: {
    cx: 38.2,    // offset from inner: (-2.1, -0.4) — nearly concentric
    cy: 33.1,
    a: 38.8,     // outer/inner ratio: 1.87× (very close to a's 1.46× and b's 1.89×)
    b: 15.3,     // outer/inner ratio: 1.42×
    tilt: -45.5  // same as inner — 0° tilt diff (most uniform of all letters)
  },
};

// ── 'o' bowl width function ──────────────────────────────────────────────────
// Very similar to 'a' — thickest on the bottom-left (pen slowest),
// thinnest at the top (pen fastest). No downstroke overlap zone,
// so the upper-right is just thin like the top.
// 'o' is slightly more uniform than 'a' since there's no downstroke
// interaction distorting the width profile.
function oBowlWidth(arcFracRaw) {
  const f = (arcFracRaw + BOWL_PHASE) % 1.0;

  // Top: thin. Pen moves fast across the top of the bowl.
  if (f < 0.20) return 0.25;

  // Left side: thin→fat. Pen decelerates.
  if (f < ARC_PRESS) { const t = (f - 0.20) / (ARC_PRESS - 0.20); return smoothStep(0.25, 1.0, t); }

  // Bottom-left: peak width. Pen at slowest.
  if (f < ARC_RISE) return 1.0;

  // Bottom-right: fat→thin. Pen accelerates back up.
  if (f < 0.95) return smoothStep(1.0, 0.25, (f - ARC_RISE) / 0.17);

  // Upper-right: thin, returning to top.
  return 0.25;
}

// ── 'o' bowl density ─────────────────────────────────────────────────────────
function oBowlDensity(arcFracRaw) {
  const f = (arcFracRaw + BOWL_PHASE) % 1.0;
  // Slightly lighter at the thin top, solid everywhere else.
  if (f < 0.20) return 0.70;
  return 0.85;
}

// ═════════════════════════════════════════════════════════════════════════════
// PUBLIC RENDER FUNCTIONS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Glyph-rendering dispatcher.
 *
 * Shared preamble (scale computation) lives here. Each letter's render function
 * receives scale + an overrides object keyed by component name. Overrides let
 * grid-search callers vary individual component offsets without touching
 * function signatures.
 *
 * @param {string} glyph - single-letter key ('a', 'b', 'f', …)
 * @param {object} renderer - from createStrokeRenderer(gl)
 * @param {number} cx - canvas x center of the bowl (pixels, DPR-scaled)
 * @param {number} cy - canvas y center of the bowl
 * @param {number} size - font size in CSS pixels (before DPR)
 * @param {number} dpr - window.devicePixelRatio
 * @param {object} [overrides={}] - per-component offset overrides, keyed by
 *   component name. Each value: { dx, dy } in CSS pixels (before DPR).
 *   Replaces the letter's baked-in default for that component.
 *   Example: { hairline: { dx: 8, dy: -2 }, fatBar: { dx: 4, dy: -6 } }
 */
// Returns { outer, refCenter } for a glyph — used for debug tick marks.
export function glyphOuterEllipse(glyph) {
  const map = {
    a: { outer: A_BOWL.outer, refCenter: A_REF_CENTER },
    b: { outer: B_BOWL.outer, refCenter: B_REF_CENTER },
    c: { outer: C_BOWL.outer, refCenter: C_REF_CENTER },
    d: { outer: D_BOWL.outer, refCenter: D_REF_CENTER },
    f: { outer: F_BAR_BOWL.outer, refCenter: F_REF_CENTER },
    o: { outer: O_BOWL.outer, refCenter: O_REF_CENTER },
    q: { outer: Q_BOWL.outer, refCenter: Q_REF_CENTER },
  };
  return map[glyph] ?? null;
}

export function renderGlyph(glyph, renderer, cx, cy, size, dpr, overrides = {}) {
  const scale = (size * dpr) / 100;
  switch(glyph) {
    case 'a':
      return renderA(renderer, cx, cy, scale, dpr, overrides)
    case 'b':
      return renderB(renderer, cx, cy, scale, dpr, overrides)
    case 'c':
      return renderC(renderer, cx, cy, scale, dpr, overrides)
    case 'd':
      return renderD(renderer, cx, cy, scale, dpr, overrides)
    case 'e':
      return renderE(renderer, cx, cy, scale, dpr, overrides)
    case 'f':
      return renderF(renderer, cx, cy, scale, dpr, overrides)
    case 'g':
      return renderG(renderer, cx, cy, scale, dpr, overrides)
    case 'h':
      return renderH(renderer, cx, cy, scale, dpr, overrides)
    case 'i':
      return renderI(renderer, cx, cy, scale, dpr, overrides)
    case 'j':
      return renderJ(renderer, cx, cy, scale, dpr, overrides)
    case 'k':
      return renderK(renderer, cx, cy, scale, dpr, overrides)
    case 'l':
      return renderL(renderer, cx, cy, scale, dpr, overrides)
    case 'm':
      return renderM(renderer, cx, cy, scale, dpr, overrides)
    case 'n':
      return renderN(renderer, cx, cy, scale, dpr, overrides)
    case 'o':
      return renderO(renderer, cx, cy, scale, dpr, overrides)
    case 'p':
      return renderP(renderer, cx, cy, scale, dpr, overrides)
    case 'q':
      return renderQ(renderer, cx, cy, scale, dpr, overrides)
    case 'r':
      return renderR(renderer, cx, cy, scale, dpr, overrides)
    case 's':
      return renderS(renderer, cx, cy, scale, dpr, overrides)
    case 't':
      return renderT(renderer, cx, cy, scale, dpr, overrides)
    case 'u':
      return renderU(renderer, cx, cy, scale, dpr, overrides)
    case 'v':
      return renderV(renderer, cx, cy, scale, dpr, overrides)
    case 'w':
      return renderW(renderer, cx, cy, scale, dpr, overrides)
    case 'x':
      return renderX(renderer, cx, cy, scale, dpr, overrides)
    case 'y':
      return renderY(renderer, cx, cy, scale, dpr, overrides)
    case 'z':
      return renderZ(renderer, cx, cy, scale, dpr, overrides)
    default:
      throw new Error(`Glyph ${glyph} not yet supported`)
  }
}

/**
 * Render a Matlack-style lowercase 'a'.
 * Components: bowl, downstroke.
 */
function renderA(renderer, cx, cy, scale, dpr, overrides) {
  const inner = scaleEllipse(A_BOWL.inner, cx, cy, scale, A_REF_CENTER);
  const outer = scaleEllipse(A_BOWL.outer, cx, cy, scale, A_REF_CENTER);

  const dsOff = resolveOffset('downstroke', A_DOWNSTROKE_OFFSET, overrides, dpr);
  const body = buildADownstrokeBody(cx + dsOff.dx, cy + dsOff.dy, scale);

  renderer.drawBowl(outer, inner, {
    densityFn: aBowlDensity,
    widthFn: aBowlWidth,
    extraFills: [{ points: body, pressure: 0.85 }],
  });
}

/**
 * Render a Matlack-style lowercase 'b'.
 * Components: bowl, barBowl.
 */
function renderB(renderer, cx, cy, scale, dpr, overrides) {
  // Main bowl (lower, round)
  const inner = scaleEllipse(B_BOWL.inner, cx, cy, scale, B_REF_CENTER);
  const outer = scaleEllipse(B_BOWL.outer, cx, cy, scale, B_REF_CENTER);

  // Bar-bowl (upper, elongated stem)
  const bbOff = resolveOffset('barBowl', { dx: -4, dy: 0 }, overrides, dpr);
  const bbInner = scaleEllipse(B_BAR_BOWL.inner, cx + bbOff.dx, cy + bbOff.dy, scale, B_REF_CENTER);
  const bbOuter = scaleEllipse(B_BAR_BOWL.outer, cx + bbOff.dx, cy + bbOff.dy, scale, B_REF_CENTER);

  renderer.drawBowl(outer, inner, {
    densityFn: bBowlDensity,
    widthFn: bBowlWidth,
  });

  renderer.drawBowl(bbOuter, bbInner, {
    densityFn: bBarBowlDensity,
    widthFn: bBarBowlWidth,
  });
}

/**
 * Render a Matlack-style lowercase 'f'.
 * Components: barBowl (anchor), fatBar, hairline.
 */
function renderF(renderer, cx, cy, scale, dpr, overrides) {
  // ── Bar-bowl (anchor — no offset) ─────────────────────────────
  const inner = scaleEllipse(F_BAR_BOWL.inner, cx, cy, scale, F_REF_CENTER);
  const outer = scaleEllipse(F_BAR_BOWL.outer, cx, cy, scale, F_REF_CENTER);

  // ── Hairline crossbar ─────────────────────────────────────────
  const hlOff = resolveOffset('hairline', F_HAIRLINE_OFFSET, overrides, dpr);
  const h = F_HAIRLINE;
  const hl = refToCanvas(h.x1, h.y1, cx, cy, scale, F_REF_CENTER);
  const hr = refToCanvas(h.x2, h.y2, cx, cy, scale, F_REF_CENTER);
  hl.x += hlOff.dx; hl.y += hlOff.dy;
  hr.x += hlOff.dx; hr.y += hlOff.dy;
  const hh = h.halfHeight * scale;
  const hdx = hr.x - hl.x, hdy = hr.y - hl.y;
  const hlen = Math.hypot(hdx, hdy);
  const hnx = -hdy / hlen * hh, hny = hdx / hlen * hh;
  const hairline = [
    { x: hl.x + hnx, y: hl.y + hny },
    { x: hr.x + hnx, y: hr.y + hny },
    { x: hr.x - hnx, y: hr.y - hny },
    { x: hl.x - hnx, y: hl.y - hny },
  ];

  // ── Fat bar (descender) ───────────────────────────────────────
  const fbOff = resolveOffset('fatBar', F_FAT_BAR_OFFSET, overrides, dpr);
  const hw = F_FAT_BAR_HALF_WIDTH * scale;
  const p0 = refToCanvas(119.46, 138.92, cx, cy, scale, F_REF_CENTER);
  const p1 = refToCanvas(22.36, 282.93, cx, cy, scale, F_REF_CENTER);
  p0.x += fbOff.dx; p0.y += fbOff.dy;
  p1.x += fbOff.dx; p1.y += fbOff.dy;
  const dx = p1.x - p0.x, dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy);
  const nx = -dy / len * hw, ny = dx / len * hw;
  const fatBarPoly = [
    { x: p0.x + nx, y: p0.y + ny },
    { x: p1.x + nx, y: p1.y + ny },
    { x: p1.x - nx, y: p1.y - ny },
    { x: p0.x - nx, y: p0.y - ny },
  ];

  // ── Render: bar-bowl + fat bar + hairline in same pass ────────
  renderer.drawBowl(outer, inner, {
    densityFn: fBarBowlDensity,
    widthFn: fBarBowlWidth,
    extraFills: [
      { points: fatBarPoly, pressure: 0.85 },
      { points: hairline, pressure: 0.75 },
    ],
  });
}

/**
 * Render a Matlack-style lowercase 'c'.
 * Components: bowl (partial arc), topBlob (filled), bottomHairline (thin stroke).
 */
function renderC(renderer, cx, cy, scale, dpr, overrides) {
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

  renderer.drawBowl(outer, inner, {
    densityFn: cBowlDensity,
    widthFn: cBowlWidth,
    // Blob and flick render after inner cutout so they aren't erased by the counter.
    overlayFills: [
      { points: blob, pressure: 0.85 },
      ...flickFills,
    ],
  });
}

/**
 * Render a Matlack-style lowercase 'o'.
 * Components: bowl (only).
 */
/**
 * Render a Matlack-style lowercase 'd'.
 * Components: bowl, downstroke (ascender).
 */
/**
 * Render a Matlack-style lowercase 'e'.
 * Single continuous loop stroke rendered as a variable-width ribbon.
 */
function renderE(renderer, cx, cy, scale, dpr, overrides) {
  const loopCenter = sampleSegments(
    E_LOOP_SEGS,
    [0, 1, 2, 3, 4, 5, 6],
    12, cx, cy, scale, E_REF_CENTER
  );
  const loopQuads = buildRibbon(loopCenter, (t) => eLoopWidth(t, scale));
  const loopFills = loopQuads.map(quad => ({ points: quad, pressure: 0.85 }));
  renderer.drawFills(loopFills);
}

function renderD(renderer, cx, cy, scale, dpr, overrides) {
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

  renderer.drawBowl(outer, inner, {
    densityFn: dBowlDensity,
    widthFn: dBowlWidth,
    overlayFills: [
      { points: downstroke, pressure: 0.85 },
      ...flickFills,
    ],
  });
}

/**
 * Render a Matlack-style lowercase 'q'.
 * Components: bowl, downstroke (descender).
 */
function renderQ(renderer, cx, cy, scale, dpr, overrides) {
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

  renderer.drawBowl(outer, inner, {
    densityFn: qBowlDensity,
    widthFn: qBowlWidth,
    overlayFills: [
      { points: downstroke, pressure: 0.85 },
    ],
  });
}

/**
 * Render a Matlack-style lowercase 't' (type 1).
 * Components: entrance hairline (tapered ribbon), fat bar, crossbar hairline.
 * No bowl — pure vertical family.
 */
function renderT(renderer, cx, cy, scale, dpr, overrides) {
  // ── Fat bar (main downstroke) ───────────────────────────────────
  const fbOff = resolveOffset('fatBar', T_FAT_BAR_OFFSET, overrides, dpr);
  const hw = T_FAT_BAR_HALF_WIDTH * scale;
  const p0 = refToCanvas(T_FAT_BAR.x1, T_FAT_BAR.y1, cx, cy, scale, T_REF_CENTER);
  const p1 = refToCanvas(T_FAT_BAR.x2, T_FAT_BAR.y2, cx, cy, scale, T_REF_CENTER);
  p0.x += fbOff.dx; p0.y += fbOff.dy;
  p1.x += fbOff.dx; p1.y += fbOff.dy;
  const dx = p1.x - p0.x, dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy);
  const nx = -dy / len * hw, ny = dx / len * hw;
  const fatBar = [
    { x: p0.x + nx, y: p0.y + ny },
    { x: p1.x + nx, y: p1.y + ny },
    { x: p1.x - nx, y: p1.y - ny },
    { x: p0.x - nx, y: p0.y - ny },
  ];

  // ── Crossbar hairline ──────────────────────────────────────────
  const cbOff = resolveOffset('crossbar', T_CROSSBAR_OFFSET, overrides, dpr);
  const cb = T_CROSSBAR;
  const cbl = refToCanvas(cb.x1, cb.y1, cx, cy, scale, T_REF_CENTER);
  const cbr = refToCanvas(cb.x2, cb.y2, cx, cy, scale, T_REF_CENTER);
  cbl.x += cbOff.dx; cbl.y += cbOff.dy;
  cbr.x += cbOff.dx; cbr.y += cbOff.dy;
  const cbh = cb.halfHeight * scale;
  const cbdx = cbr.x - cbl.x, cbdy = cbr.y - cbl.y;
  const cblen = Math.hypot(cbdx, cbdy);
  const cbnx = -cbdy / cblen * cbh, cbny = cbdx / cblen * cbh;
  const crossbar = [
    { x: cbl.x + cbnx, y: cbl.y + cbny },
    { x: cbr.x + cbnx, y: cbr.y + cbny },
    { x: cbr.x - cbnx, y: cbr.y - cbny },
    { x: cbl.x - cbnx, y: cbl.y - cbny },
  ];

  // ── Entrance hairline (tapered ribbon, reversed — thick at fat bar end) ──
  const entrCenter = sampleSegments(
    T_ENTRANCE_SEGS, [0], 12, cx, cy, scale, T_REF_CENTER
  );
  // Reverse so taper goes from thick (at fat bar) to thin (at entry point)
  const entrReversed = [...entrCenter].reverse();
  const entrQuads = buildTaperedRibbon(
    entrReversed,
    T_FAT_BAR_HALF_WIDTH * scale,  // start thick, matching the fat bar
    T_ENTRANCE.taperPower,
    T_ENTRANCE.liftPoint,
  );
  const entrFills = entrQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  // ── Render all components (no bowl — use drawFills directly) ────
  renderer.drawFills([
    { points: fatBar, pressure: 0.85 },
    { points: crossbar, pressure: 0.70 },
    ...entrFills,
  ]);
}

/**
 * Render a Matlack-style lowercase 'g'.
 * Components: bowl + variable-width descender ribbon.
 */
/**
 * Render a Matlack-style lowercase 'h'.
 * Components: entrance flick + bar-bowl + combined downstroke/hump ribbon.
 */
function renderH(renderer, cx, cy, scale, dpr, overrides) {
  // ── Bar-bowl (tall stem) ──────────────────────────────────────
  const inner = scaleEllipse(H_BAR_BOWL.inner, cx, cy, scale, H_REF_CENTER);
  const outer = scaleEllipse(H_BAR_BOWL.outer, cx, cy, scale, H_REF_CENTER);

  // ── Combined downstroke + hump (one continuous variable-width ribbon) ──
  const strokeOff = resolveOffset('stroke', H_STROKE_OFFSET, overrides, dpr);
  const strokeCenter = sampleSegments(
    H_STROKE_SEGS, [0, 1, 2, 3, 4, 5, 6, 7], 12,
    cx + strokeOff.dx, cy + strokeOff.dy, scale, H_REF_CENTER
  );
  const strokeQuads = buildRibbon(strokeCenter, (t) => hStrokeWidth(t, scale));
  const strokeFills = strokeQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  // ── Entrance flick (reversed tapered ribbon) ──────────────────
  const entrCenter = sampleSegments(
    H_ENTRANCE_SEGS, [0], 12, cx, cy, scale, H_REF_CENTER
  );
  const entrReversed = [...entrCenter].reverse();
  const entrQuads = buildTaperedRibbon(
    entrReversed,
    5.0 * scale,  // match downstroke width at junction
    H_ENTRANCE.taperPower,
    H_ENTRANCE.liftPoint,
  );
  const entrFills = entrQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  // ── Render: bar-bowl + overlays for everything else ───────────
  renderer.drawBowl(outer, inner, {
    densityFn: hBarBowlDensity,
    widthFn: hBarBowlWidth,
    overlayFills: [
      ...strokeFills,
      ...entrFills,
    ],
  });
}

function renderG(renderer, cx, cy, scale, dpr, overrides) {
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

  // Bowl first, then descender via overlayFills (survives inner cutout)
  renderer.drawBowl(outer, inner, {
    densityFn: gBowlDensity,
    widthFn: gBowlWidth,
    overlayFills: dsFills,
  });
}

/**
 * Render a Matlack-style lowercase 'i'.
 * Components: entrance flick + downstroke (power taper) + dot (filled blob).
 * No bowl, no piecewise width function — just clean tapered ribbons.
 */
function renderI(renderer, cx, cy, scale, dpr, overrides) {
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

  renderer.drawFills([
    ...dsFills,
    ...entrFills,
    { points: dot, pressure: 0.85 },
  ]);
}

/**
 * Render a Matlack-style lowercase 'j'.
 * Components: dot + entrance flick + downstroke + bar-bowl (bottom loop) + exit flick.
 */
function renderJ(renderer, cx, cy, scale, dpr, overrides) {
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

  // ── Render: bar-bowl + overlays for everything else ───────────
  renderer.drawBowl(outer, inner, {
    densityFn: jBarBowlDensity,
    widthFn: jBarBowlWidth,
    overlayFills: [
      ...dsFills,
      ...entrFills,
      ...exitFills,
      { points: dot, pressure: 0.85 },
    ],
  });
}

/**
 * Render a Matlack-style lowercase 'k'.
 * Components: entrance flick + bar-bowl + downstroke + upper crescent + exit stroke.
 */
function renderK(renderer, cx, cy, scale, dpr, overrides) {
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

  // ── Render: bar-bowl first ────────────────────────────────────
  renderer.drawBowl(bbOuter, bbInner, {
    densityFn: kBarBowlDensity,
    widthFn: kBarBowlWidth,
    overlayFills: [
      { points: downstroke, pressure: 0.85 },
      ...entrFills,
    ],
  });

  // ── Render: upper crescent (separate drawBowl call) ───────────
  renderer.drawBowl(crOuter, crInner, {
    densityFn: kCrescentDensity,
    widthFn: kCrescentWidth,
    overlayFills: exitFills,
  });
}

/**
 * Render a Matlack-style lowercase 'l'.
 * Single continuous loop stroke, like 'e' but taller.
 */
function renderL(renderer, cx, cy, scale, dpr, overrides) {
  const loopCenter = sampleSegments(
    L_LOOP_SEGS,
    [0, 1, 2, 3, 4, 5, 6, 7],
    12, cx, cy, scale, L_REF_CENTER
  );
  const loopQuads = buildRibbon(loopCenter, (t) => lLoopWidth(t, scale));
  const loopFills = loopQuads.map(quad => ({ points: quad, pressure: 0.85 }));
  renderer.drawFills(loopFills);
}

/**
 * Render a Matlack-style lowercase 'm'.
 * Components: entrance flick + double-hump ribbon.
 */
function renderM(renderer, cx, cy, scale, dpr, overrides) {
  // Double-hump centerline as variable-width ribbon
  const humpsCenter = sampleSegments(
    M_HUMPS_SEGS,
    Array.from({ length: M_HUMPS_SEGS.length }, (_, i) => i),
    12, cx, cy, scale, M_REF_CENTER
  );
  const humpsQuads = buildRibbon(humpsCenter, (t) => mHumpsWidth(t, scale));
  const humpsFills = humpsQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  // Entrance flick (reversed taper)
  const entrCenter = sampleSegments(
    M_ENTRANCE_SEGS, [0], 12, cx, cy, scale, M_REF_CENTER
  );
  const entrReversed = [...entrCenter].reverse();
  const entrQuads = buildTaperedRibbon(
    entrReversed,
    4.0 * scale,
    M_ENTRANCE.taperPower,
    M_ENTRANCE.liftPoint,
  );
  const entrFills = entrQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  renderer.drawFills([
    ...humpsFills,
    ...entrFills,
  ]);
}

/**
 * Render a Matlack-style lowercase 'n'.
 * Components: entrance flick + single-hump ribbon.
 */
function renderN(renderer, cx, cy, scale, dpr, overrides) {
  const humpCenter = sampleSegments(
    N_HUMP_SEGS,
    Array.from({ length: N_HUMP_SEGS.length }, (_, i) => i),
    12, cx, cy, scale, N_REF_CENTER
  );
  const humpQuads = buildRibbon(humpCenter, (t) => nHumpWidth(t, scale));
  const humpFills = humpQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  const entrCenter = sampleSegments(
    N_ENTRANCE_SEGS, [0, 1], 12, cx, cy, scale, N_REF_CENTER
  );
  const entrReversed = [...entrCenter].reverse();
  const entrQuads = buildTaperedRibbon(
    entrReversed,
    4.0 * scale,
    N_ENTRANCE.taperPower,
    N_ENTRANCE.liftPoint,
  );
  const entrFills = entrQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  renderer.drawFills([
    ...humpFills,
    ...entrFills,
  ]);
}

/**
 * Render a Matlack-style lowercase 'p'.
 * Components: main downstroke (fat bar) + upstroke hairline + second downstroke (power taper).
 * No bowl — Matlack's actual 'p' form.
 */
function renderP(renderer, cx, cy, scale, dpr, overrides) {
  // ── Main downstroke (long descender fat bar) ──────────────────
  const mainOff = resolveOffset('mainDownstroke', P_MAIN_OFFSET, overrides, dpr);
  const mhw = P_MAIN_HALF_WIDTH * scale;
  const mp0 = refToCanvas(P_MAIN_DOWNSTROKE.x1, P_MAIN_DOWNSTROKE.y1, cx, cy, scale, P_REF_CENTER);
  const mp1 = refToCanvas(P_MAIN_DOWNSTROKE.x2, P_MAIN_DOWNSTROKE.y2, cx, cy, scale, P_REF_CENTER);
  mp0.x += mainOff.dx; mp0.y += mainOff.dy;
  mp1.x += mainOff.dx; mp1.y += mainOff.dy;
  const mdx = mp1.x - mp0.x, mdy = mp1.y - mp0.y;
  const mlen = Math.hypot(mdx, mdy);
  const mnx = -mdy / mlen * mhw, mny = mdx / mlen * mhw;
  const mainBar = [
    { x: mp0.x + mnx, y: mp0.y + mny },
    { x: mp1.x + mnx, y: mp1.y + mny },
    { x: mp1.x - mnx, y: mp1.y - mny },
    { x: mp0.x - mnx, y: mp0.y - mny },
  ];

  // ── Upstroke hairline (tapered ribbon going left) ─────────────
  const upCenter = sampleSegments(
    P_UPSTROKE_SEGS, [0], 12, cx, cy, scale, P_REF_CENTER
  );
  const upQuads = buildTaperedRibbon(
    upCenter,
    P_UPSTROKE.startWidth * scale,
    P_UPSTROKE.taperPower,
    P_UPSTROKE.liftPoint,
  );
  const upFills = upQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  // ── Second downstroke (piecewise variable-width ribbon) ───────
  const secOff = resolveOffset('secondDownstroke', P_SECOND_OFFSET, overrides, dpr);
  const secCenter = sampleSegments(
    P_SECOND_SEGS, [0, 1, 2, 3, 4], 12,
    cx + secOff.dx, cy + secOff.dy, scale, P_REF_CENTER
  );
  const secQuads = buildRibbon(secCenter, (t) => pSecondWidth(t, scale));
  const secFills = secQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  renderer.drawFills([
    { points: mainBar, pressure: 0.85 },
    ...upFills,
    ...secFills,
  ]);
}

/**
 * Render a Matlack-style lowercase 'y'.
 * Components: entry flick + initial downstroke (ribbon) + second downstroke
 *             (ribbon) + bar-bowl loop + exit flick.
 */
/**
 * Render a Matlack-style lowercase 'r' (beginning-of-word form).
 * Components: entrance flick + swoop/downstroke ribbon + exit flick.
 */
/**
 * Render a Matlack-style lowercase 'w'.
 * Components: entrance flick + double-descent ribbon + blob + exit flick.
 */
/**
 * Render a Matlack-style lowercase 'x'.
 * Two crossing crescent strokes, each a variable-width ribbon.
 */
/**
 * Render a Matlack-style lowercase 's'.
 * Components: entrance flick + swoopy S-curve (nearly uniform width).
 */
/**
 * Render a Matlack-style lowercase 'u'.
 * Components: entrance flick + single descent/rise ribbon + exit flick.
 */
/**
 * Render a Matlack-style lowercase 'v'.
 * Components: entrance flick + V-stroke ribbon + fat exit ribbon.
 */
function renderV(renderer, cx, cy, scale, dpr, overrides) {
  const strokeCenter = sampleSegments(
    V_STROKE_SEGS,
    Array.from({ length: V_STROKE_SEGS.length }, (_, i) => i),
    12, cx, cy, scale, V_REF_CENTER
  );
  const strokeQuads = buildRibbon(strokeCenter, (t) => vStrokeWidth(t, scale));
  const strokeFills = strokeQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  const entrCenter = sampleSegments(
    V_ENTRANCE_SEGS, [0], 12, cx, cy, scale, V_REF_CENTER
  );
  const entrReversed = [...entrCenter].reverse();
  const entrQuads = buildTaperedRibbon(
    entrReversed, 4.0 * scale, V_ENTRANCE.taperPower, V_ENTRANCE.liftPoint,
  );
  const entrFills = entrQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  const exitCenter = sampleSegments(
    V_EXIT_SEGS,
    Array.from({ length: V_EXIT_SEGS.length }, (_, i) => i),
    12, cx, cy, scale, V_REF_CENTER
  );
  const exitQuads = buildRibbon(exitCenter, (t) => vExitWidth(t, scale));
  const exitFills = exitQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  renderer.drawFills([
    ...strokeFills,
    ...entrFills,
    ...exitFills,
  ]);
}

function renderU(renderer, cx, cy, scale, dpr, overrides) {
  const strokeCenter = sampleSegments(
    U_STROKE_SEGS,
    Array.from({ length: U_STROKE_SEGS.length }, (_, i) => i),
    12, cx, cy, scale, U_REF_CENTER
  );
  const strokeQuads = buildRibbon(strokeCenter, (t) => uStrokeWidth(t, scale));
  const strokeFills = strokeQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  const entrCenter = sampleSegments(
    U_ENTRANCE_SEGS, [0], 12, cx, cy, scale, U_REF_CENTER
  );
  const entrReversed = [...entrCenter].reverse();
  const entrQuads = buildTaperedRibbon(
    entrReversed, 4.0 * scale, U_ENTRANCE.taperPower, U_ENTRANCE.liftPoint,
  );
  const entrFills = entrQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  const exitCenter = sampleSegments(
    U_EXIT_SEGS, [0], 12, cx, cy, scale, U_REF_CENTER
  );
  const exitQuads = buildTaperedRibbon(
    exitCenter, U_EXIT.startWidth * scale, U_EXIT.taperPower, U_EXIT.liftPoint,
  );
  const exitFills = exitQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  renderer.drawFills([
    ...strokeFills,
    ...entrFills,
    ...exitFills,
  ]);
}

function renderS(renderer, cx, cy, scale, dpr, overrides) {
  // Swoopy S-curve
  const swoopCenter = sampleSegments(
    S_SWOOP_SEGS,
    Array.from({ length: S_SWOOP_SEGS.length }, (_, i) => i),
    12, cx, cy, scale, S_REF_CENTER
  );
  const swoopQuads = buildRibbon(swoopCenter, (t) => sSwoopWidth(t, scale));
  const swoopFills = swoopQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  // Entrance flick (reversed taper)
  const entrCenter = sampleSegments(
    S_ENTRANCE_SEGS, [0], 12, cx, cy, scale, S_REF_CENTER
  );
  const entrReversed = [...entrCenter].reverse();
  const entrQuads = buildTaperedRibbon(
    entrReversed, 4.0 * scale, S_ENTRANCE.taperPower, S_ENTRANCE.liftPoint,
  );
  const entrFills = entrQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  renderer.drawFills([
    ...swoopFills,
    ...entrFills,
  ]);
}

function renderX(renderer, cx, cy, scale, dpr, overrides) {
  // Right crescent
  const rightCenter = sampleSegments(
    X_RIGHT_SEGS,
    Array.from({ length: X_RIGHT_SEGS.length }, (_, i) => i),
    12, cx, cy, scale, X_REF_CENTER
  );
  const rightQuads = buildRibbon(rightCenter, (t) => xCrescentWidth(t, scale));
  const rightFills = rightQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  // Left crescent (with position override)
  const leftOff = resolveOffset('leftCrescent', X_LEFT_OFFSET, overrides, dpr);
  const leftCenter = sampleSegments(
    X_LEFT_SEGS,
    Array.from({ length: X_LEFT_SEGS.length }, (_, i) => i),
    12, cx + leftOff.dx, cy + leftOff.dy, scale, X_REF_CENTER
  );
  const leftQuads = buildRibbon(leftCenter, (t) => xCrescentWidth(t, scale));
  const leftFills = leftQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  renderer.drawFills([
    ...rightFills,
    ...leftFills,
  ]);
}

function renderW(renderer, cx, cy, scale, dpr, overrides) {
  // Combined stroke ribbon
  const strokeCenter = sampleSegments(
    W_STROKE_SEGS,
    Array.from({ length: W_STROKE_SEGS.length }, (_, i) => i),
    12, cx, cy, scale, W_REF_CENTER
  );
  const strokeQuads = buildRibbon(strokeCenter, (t) => wStrokeWidth(t, scale));
  const strokeFills = strokeQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  // Entrance flick (reversed taper)
  const entrCenter = sampleSegments(
    W_ENTRANCE_SEGS, [0], 12, cx, cy, scale, W_REF_CENTER
  );
  const entrReversed = [...entrCenter].reverse();
  const entrQuads = buildTaperedRibbon(
    entrReversed, 4.0 * scale, W_ENTRANCE.taperPower, W_ENTRANCE.liftPoint,
  );
  const entrFills = entrQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  // Ink blob
  const blobOff = resolveOffset('blob', W_BLOB_OFFSET, overrides, dpr);
  const blobScale = overrides.blob ?? {};
  let blob = sampleSegments(
    W_BLOB_SEGS,
    Array.from({ length: W_BLOB_SEGS.length }, (_, i) => i),
    12, cx + blobOff.dx, cy + blobOff.dy, scale, W_REF_CENTER
  );
  blob = scalePolygon(blob, blobScale.sx ?? 1, blobScale.sy ?? 1);

  // Exit flick
  const exitOff = resolveOffset('exitFlick', W_EXIT_OFFSET, overrides, dpr);
  const exitCenter = sampleSegments(
    W_EXIT_SEGS, [0], 12,
    cx + exitOff.dx, cy + exitOff.dy, scale, W_REF_CENTER
  );
  const exitQuads = buildTaperedRibbon(
    exitCenter, W_EXIT.startWidth * scale, W_EXIT.taperPower, W_EXIT.liftPoint,
  );
  const exitFills = exitQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  renderer.drawFills([
    ...strokeFills,
    ...entrFills,
    { points: blob, pressure: 0.85 },
    ...exitFills,
  ]);
}

function renderR(renderer, cx, cy, scale, dpr, overrides) {
  // Swoop + downstroke as one ribbon
  const strokeCenter = sampleSegments(
    R_STROKE_SEGS, [0, 1, 2], 12, cx, cy, scale, R_REF_CENTER
  );
  const strokeQuads = buildRibbon(strokeCenter, (t) => rStrokeWidth(t, scale));
  const strokeFills = strokeQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  // Entrance flick (reversed taper)
  const entrCenter = sampleSegments(
    R_ENTRANCE_SEGS, [0], 12, cx, cy, scale, R_REF_CENTER
  );
  const entrReversed = [...entrCenter].reverse();
  const entrQuads = buildTaperedRibbon(
    entrReversed,
    3.5 * scale,
    R_ENTRANCE.taperPower,
    R_ENTRANCE.liftPoint,
  );
  const entrFills = entrQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  // Exit flick
  const exitOff = resolveOffset('exitFlick', R_EXIT_OFFSET, overrides, dpr);
  const exitCenter = sampleSegments(
    R_EXIT_SEGS, [0, 1], 12,
    cx + exitOff.dx, cy + exitOff.dy, scale, R_REF_CENTER
  );
  const exitQuads = buildTaperedRibbon(
    exitCenter,
    R_EXIT.startWidth * scale,
    R_EXIT.taperPower,
    R_EXIT.liftPoint,
  );
  const exitFills = exitQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  renderer.drawFills([
    ...strokeFills,
    ...entrFills,
    ...exitFills,
  ]);
}

/**
 * Render a Matlack-style lowercase 'z'.
 * Components: entry flick + zigzag weird stroke + bar-bowl loop + exit flick.
 */
function renderZ(renderer, cx, cy, scale, dpr, overrides) {
  // Bar-bowl (descender loop)
  const bbOff = resolveOffset('barBowl', { dx: 0, dy: -8 }, overrides, dpr);  // review round 2
  const bbInner = scaleEllipse(Z_BAR_BOWL.inner, cx + bbOff.dx, cy + bbOff.dy, scale, Z_REF_CENTER);
  const bbOuter = scaleEllipse(Z_BAR_BOWL.outer, cx + bbOff.dx, cy + bbOff.dy, scale, Z_REF_CENTER);

  // Main weird stroke (zigzag z-shape)
  const strokeCenter = sampleSegments(
    Z_STROKE_SEGS,
    Array.from({ length: Z_STROKE_SEGS.length }, (_, i) => i),
    12, cx, cy, scale, Z_REF_CENTER
  );
  const strokeQuads = buildRibbon(strokeCenter, (t) => zStrokeWidth(t, scale));
  const strokeFills = strokeQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  // Entry flick (reversed taper)
  const entrCenter = sampleSegments(
    Z_ENTRY_SEGS, [0], 12, cx, cy, scale, Z_REF_CENTER
  );
  const entrReversed = [...entrCenter].reverse();
  const entrQuads = buildTaperedRibbon(
    entrReversed, 3.5 * scale, Z_ENTRY.taperPower, Z_ENTRY.liftPoint,
  );
  const entrFills = entrQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  // Exit flick
  const exitCenter = sampleSegments(
    Z_EXIT_SEGS, [0], 12, cx, cy, scale, Z_REF_CENTER
  );
  const exitQuads = buildTaperedRibbon(
    exitCenter, Z_EXIT.startWidth * scale, Z_EXIT.taperPower, Z_EXIT.liftPoint,
  );
  const exitFills = exitQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  // Render: bar-bowl + everything else as overlays
  renderer.drawBowl(bbOuter, bbInner, {
    densityFn: zBarBowlDensity,
    widthFn: zBarBowlWidth,
    overlayFills: [
      ...strokeFills,
      ...entrFills,
      ...exitFills,
    ],
  });
}

function renderY(renderer, cx, cy, scale, dpr, overrides) {
  // ── Initial downstroke (variable-width ribbon, no outline needed) ──
  const initCenter = sampleSegments(
    Y_INITIAL_SEGS, [0, 1, 2, 3], 12, cx, cy, scale, Y_REF_CENTER
  );
  const initQuads = buildRibbon(initCenter, (t) => yInitialWidth(t, scale));
  const initFills = initQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  // ── Second downstroke (constant-width ribbon) ─────────────────
  const secOff = resolveOffset('secondDownstroke', Y_SECOND_OFFSET, overrides, dpr);
  const secCenter = sampleSegments(
    Y_SECOND_SEGS, [0, 1], 12,
    cx + secOff.dx, cy + secOff.dy, scale, Y_REF_CENTER
  );
  const secQuads = buildRibbon(secCenter, () => Y_SECOND_HALF_WIDTH * scale);
  const secFills = secQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  // ── Entry flick (reversed taper) ──────────────────────────────
  const entrCenter = sampleSegments(
    Y_ENTRY_SEGS, [0], 12, cx, cy, scale, Y_REF_CENTER
  );
  const entrReversed = [...entrCenter].reverse();
  const entrQuads = buildTaperedRibbon(
    entrReversed,
    3.5 * scale,
    Y_ENTRY.taperPower,
    Y_ENTRY.liftPoint,
  );
  const entrFills = entrQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  // ── Exit flick (tapered ribbon) ───────────────────────────────
  const exitOff = resolveOffset('exitFlick', Y_EXIT_OFFSET, overrides, dpr);
  const exitCenter = sampleSegments(
    Y_EXIT_SEGS, [0], 12,
    cx + exitOff.dx, cy + exitOff.dy, scale, Y_REF_CENTER
  );
  const exitQuads = buildTaperedRibbon(
    exitCenter,
    Y_EXIT.startWidth * scale,
    Y_EXIT.taperPower,
    Y_EXIT.liftPoint,
  );
  const exitFills = exitQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  // ── Bar-bowl / descender loop ─────────────────────────────────
  const bbOff = resolveOffset('barBowl', { dx: 8, dy: -8 }, overrides, dpr);  // review round 2
  const bbInner = scaleEllipse(Y_BAR_BOWL.inner, cx + bbOff.dx, cy + bbOff.dy, scale, Y_REF_CENTER);
  const bbOuter = scaleEllipse(Y_BAR_BOWL.outer, cx + bbOff.dx, cy + bbOff.dy, scale, Y_REF_CENTER);

  // Render bar-bowl with all other components as overlays
  renderer.drawBowl(bbOuter, bbInner, {
    densityFn: yBarBowlDensity,
    widthFn: yBarBowlWidth,
    overlayFills: [
      ...initFills,
      ...secFills,
      ...entrFills,
      ...exitFills,
    ],
  });
}

function renderO(renderer, cx, cy, scale, dpr, overrides) {
  const inner = scaleEllipse(O_BOWL.inner, cx, cy, scale, O_REF_CENTER);
  const outer = scaleEllipse(O_BOWL.outer, cx, cy, scale, O_REF_CENTER);

  renderer.drawBowl(outer, inner, {
    densityFn: oBowlDensity,
    widthFn: oBowlWidth,
  });
}



// ═════════════════════════════════════════════════════════════════════════════
// OUTLINE EXPORT (for Hypothesis / Shapely intersection checks)
//
// Exports component outlines as coordinate arrays in ref-pixel space.
// No canvas, no DPR — just raw geometry with overrides applied.
// Python side: json.load → Shapely Polygon for each component.
// ═════════════════════════════════════════════════════════════════════════════

// Sample N points around an ellipse. Returns [[x,y], ...] for Shapely.
// Ellipse defined in ref coords: { cx, cy, a, b, tilt (degrees) }.
function sampleEllipse(e, n = 64) {
  const rad = e.tilt * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const theta = (2 * Math.PI * i) / n;
    const lx = e.a * Math.cos(theta);
    const ly = e.b * Math.sin(theta);
    pts.push([
      e.cx + lx * cos - ly * sin,
      e.cy + lx * sin + ly * cos,
    ]);
  }
  return pts;
}

// Build a 4-corner parallelogram from two endpoints and a half-width.
// Returns [[x,y], ...] (4 points) for Shapely.
function buildBar(x0, y0, x1, y1, halfWidth) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const nx = -dy / len * halfWidth, ny = dx / len * halfWidth;
  return [
    [x0 + nx, y0 + ny],
    [x1 + nx, y1 + ny],
    [x1 - nx, y1 - ny],
    [x0 - nx, y0 - ny],
  ];
}

// Resolve an override in ref-pixel space (no DPR).
function resolveRefOffset(componentName, defaults, overrides) {
  const raw = overrides[componentName] ?? defaults;
  return { dx: raw.dx ?? 0, dy: raw.dy ?? 0 };
}

function exportOutlinesA(overrides) {
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

function exportOutlinesB(overrides) {
  const bbOff = resolveRefOffset('barBowl', { dx: -4, dy: 0 }, overrides);
  const shifted = {
    inner: { ...B_BAR_BOWL.inner, cx: B_BAR_BOWL.inner.cx + bbOff.dx, cy: B_BAR_BOWL.inner.cy + bbOff.dy },
    outer: { ...B_BAR_BOWL.outer, cx: B_BAR_BOWL.outer.cx + bbOff.dx, cy: B_BAR_BOWL.outer.cy + bbOff.dy },
  };
  return {
    bowl: { inner: sampleEllipse(B_BOWL.inner), outer: sampleEllipse(B_BOWL.outer) },
    barBowl: { inner: sampleEllipse(shifted.inner), outer: sampleEllipse(shifted.outer) },
  };
}

function exportOutlinesF(overrides) {
  const hlOff = resolveRefOffset('hairline', F_HAIRLINE_OFFSET, overrides);
  const fbOff = resolveRefOffset('fatBar', F_FAT_BAR_OFFSET, overrides);

  const h = F_HAIRLINE;
  const hairline = buildBar(
    h.x1 + hlOff.dx, h.y1 + hlOff.dy,
    h.x2 + hlOff.dx, h.y2 + hlOff.dy,
    h.halfHeight,
  );

  const fatBar = buildBar(
    119.46 + fbOff.dx, 138.92 + fbOff.dy,
    22.36 + fbOff.dx, 282.93 + fbOff.dy,
    F_FAT_BAR_HALF_WIDTH,
  );

  return {
    barBowl: { inner: sampleEllipse(F_BAR_BOWL.inner), outer: sampleEllipse(F_BAR_BOWL.outer) },
    fatBar,
    hairline,
  };
}

function exportOutlinesD(overrides) {
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

function exportOutlinesQ(overrides) {
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

function exportOutlinesC() {
  return {
    bowl: { inner: sampleEllipse(C_BOWL.inner), outer: sampleEllipse(C_BOWL.outer) },
  };
}

function exportOutlinesT(overrides) {
  const fbOff = resolveRefOffset('fatBar', T_FAT_BAR_OFFSET, overrides);
  const fatBar = buildBar(
    T_FAT_BAR.x1 + fbOff.dx, T_FAT_BAR.y1 + fbOff.dy,
    T_FAT_BAR.x2 + fbOff.dx, T_FAT_BAR.y2 + fbOff.dy,
    T_FAT_BAR_HALF_WIDTH,
  );
  const cbOff = resolveRefOffset('crossbar', T_CROSSBAR_OFFSET, overrides);
  const crossbar = buildBar(
    T_CROSSBAR.x1 + cbOff.dx, T_CROSSBAR.y1 + cbOff.dy,
    T_CROSSBAR.x2 + cbOff.dx, T_CROSSBAR.y2 + cbOff.dy,
    T_CROSSBAR.halfHeight,
  );
  return { fatBar, crossbar };
}

function exportOutlinesO() {
  return {
    bowl: { inner: sampleEllipse(O_BOWL.inner), outer: sampleEllipse(O_BOWL.outer) },
  };
}

/**
 * Export component outlines as coordinate arrays for geometric analysis.
 * All coordinates are in ref-pixel space (4x upscaled reference image coords).
 *
 * Bowl components return { inner: [[x,y],...], outer: [[x,y],...] }.
 * Polygon components (fatBar, hairline, downstroke) return [[x,y],...].
 *
 * @param {string} glyph - letter key
 * @param {object} [overrides={}] - same format as renderGlyph overrides
 * @returns {object} keyed by component name
 */
export function exportGlyphOutlines(glyph, overrides = {}) {
  switch (glyph) {
    case 'a': return exportOutlinesA(overrides);
    case 'b': return exportOutlinesB(overrides);
    case 'c': return exportOutlinesC();
    case 'd': return exportOutlinesD(overrides);
    case 'e': return { loop: 'single-stroke — no decomposition' };
    case 'f': return exportOutlinesF(overrides);
    case 'g': return { bowl: { inner: sampleEllipse(G_BOWL.inner), outer: sampleEllipse(G_BOWL.outer) } };
    case 'h': return { barBowl: { inner: sampleEllipse(H_BAR_BOWL.inner), outer: sampleEllipse(H_BAR_BOWL.outer) } };
    case 'i': return { downstroke: 'tapered-ribbon', dot: 'filled-blob' };
    case 'j': return { barBowl: { inner: sampleEllipse(J_BAR_BOWL.inner), outer: sampleEllipse(J_BAR_BOWL.outer) } };
    case 'l': return { loop: 'single-stroke' };
    case 'm': return { humps: 'single-stroke' };
    case 'n': return { hump: 'single-stroke' };
    case 'p': return { mainDownstroke: 'fat-bar', secondDownstroke: 'tapered-ribbon' };
    case 'k': return {
      barBowl: { inner: sampleEllipse(K_BAR_BOWL.inner), outer: sampleEllipse(K_BAR_BOWL.outer) },
      crescent: { inner: sampleEllipse(K_CRESCENT.inner), outer: sampleEllipse(K_CRESCENT.outer) },
    };
    case 'o': return exportOutlinesO();
    case 'r': return { stroke: 'ribbon' };
    case 'w': return { stroke: 'ribbon', blob: 'filled-blob' };
    case 's': return { swoop: 'ribbon' };
    case 'u': return { stroke: 'ribbon' };
    case 'v': return { stroke: 'ribbon', exit: 'ribbon' };
    case 'x': return { rightCrescent: 'ribbon', leftCrescent: 'ribbon' };
    case 't': return exportOutlinesT(overrides);
    case 'y': return { barBowl: { inner: sampleEllipse(Y_BAR_BOWL.inner), outer: sampleEllipse(Y_BAR_BOWL.outer) } };
    case 'z': return { barBowl: { inner: sampleEllipse(Z_BAR_BOWL.inner), outer: sampleEllipse(Z_BAR_BOWL.outer) } };
    case 'q': return exportOutlinesQ(overrides);
    default: throw new Error(`Glyph ${glyph} not yet supported`);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// REFERENCE DATA FOR DOM OVERLAYS
// Exported so MatlackCanvas.jsx can render SVG ellipses on reference images.
// ═════════════════════════════════════════════════════════════════════════════

// Ellipse data for 'b' reference images (4x scale)
// ★ = hand-traced by sinback
export const B_ELLIPSE_DATA = {
  '01': { w: 140, h: 196,  // ★
          inner: { cx: 34.7, cy: 149.2, a: 26.6, b: 11.0, tilt: -43.5 },
          outer: { cx: 34.8, cy: 145.0, a: 50.3, b: 21.1, tilt: -42.2 }},
  '02': { w: 140, h: 184, inner: null, outer: null },  // no traces yet
};

// Ellipse data for 'a' reference images (4x scale)
// ★ = hand-traced by sinback
export const ELLIPSE_DATA = {
  '01': { w: 124, h: 100,  // ★
          inner: { cx: 51.7, cy: 46.4, a: 37.8, b: 17.2, tilt: -47.2 },
          outer: { cx: 51.4, cy: 46.6, a: 50.5, b: 29.1, tilt: -37.3 }},
  '02': { w: 104, h: 120,  // automated inner only
          inner: { cx: 45.1, cy: 57.0, a: 33.2, b: 10.1, tilt: -51.7 },
          outer: null },
  '03': null,  // thrown out (poor sample)
  '04': { w: 148, h: 120,  // automated outer only
          inner: null,
          outer: { cx: 52.0, cy: 45.0, a: 50.7, b: 20.5, tilt: -41.4 }},
  '05': { w: 144, h: 128,  // ★
          inner: { cx: 62.9, cy: 50.7, a: 42.4, b: 19.5, tilt: -44.6 },
          outer: { cx: 59.1, cy: 50.5, a: 61.1, b: 32.8, tilt: -39.9 }},
  '06': { w: 100, h: 120, inner: null, outer: null },  // incomplete capture
  '07': null,  // thrown out
  '08': { w: 156, h: 148, inner: null, outer: null },
  '09': { w: 132, h: 104,  // ★ — primary reference for 'a'
          inner: { cx: 55.1, cy: 51.7, a: 32.8, b: 14.1, tilt: -44.9 },
          outer: { cx: 51.7, cy: 50.2, a: 47.9, b: 26.5, tilt: -40.3 }},
  '10': { w: 120, h: 112,  // ★
          inner: { cx: 55.7, cy: 63.7, a: 35.7, b: 14.0, tilt: -41.6 },
          outer: { cx: 56.0, cy: 61.6, a: 54.3, b: 26.4, tilt: -38.6 }},
};
