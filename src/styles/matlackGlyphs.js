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
 *   6. Write buildX() function returning { bowls, fills }
 *   7. Add a case for 'x' in the buildGlyph() switch
 *
 * Usage:
 *   import { renderGlyph } from './matlackGlyphs.js';
 *   renderGlyph('a', renderer, cx, cy, size, dpr);
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
export function buildRibbon(centerline, widthFn) {
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

    const prev = centerline[Math.max(0, i - 1)];
    const next = centerline[Math.min(n - 1, i + 1)];
    const tdx = next.x - prev.x, tdy = next.y - prev.y;
    const tlen = Math.hypot(tdx, tdy) || 1;
    const pnx = -tdy / tlen * hw, pny = tdx / tlen * hw;

    tops.push({ x: centerline[i].x + pnx, y: centerline[i].y + pny });
    bots.push({ x: centerline[i].x - pnx, y: centerline[i].y - pny });

    // Taper is complete — close the ribbon at its true zero-width point.
    // (No sub-pixel width cutoff here: it truncated the flick's extent
    // scale-dependently, which broke join overlap in exported geometry.
    // Zero-width quads rasterize as nothing, so emitting the full taper
    // costs nothing visually.)
    if (hw <= 0) break;
  }

  // Build quads between consecutive pairs of offset points
  const quads = [];
  for (let i = 0; i < tops.length - 1; i++) {
    quads.push([tops[i], tops[i + 1], bots[i + 1], bots[i]]);
  }
  return quads;
}

// ── Connector ribbon builder ──────────────────────────────────────────────────
// Mid-word connector strokes (the glyph's half of an inter-letter join) are
// continuous hairlines — the pen never lifts, so width holds constant through
// the join band and fades only past fadeStart (which must sit at or beyond
// the join anchor's arc-length fraction, so the stroke is full-width where
// the neighbor overlaps it). Contrast buildTaperedRibbon, which models a true
// pen lift ((1-t)^p decay from the body outward) and is for terminal flicks.
//
// Params:
//   centerline:    array of {x, y}, ordered body → free end
//   hairlineWidth: constant half-width (canvas px)
//   fadeStart:     arc-length fraction where the fade to zero begins
//   opts.bodyWidth: optional half-width at the body end; the profile blends
//     bodyWidth → hairline over the first opts.blendEnd of arc length
//     (default 0.4). Use when the connector thickens as it merges into the
//     letter body (e.g. r's entrance) — the band portion stays hairline.
function buildConnectorRibbon(centerline, hairlineWidth, fadeStart = 0.85, opts = {}) {
  const { bodyWidth = null, blendEnd = 0.4 } = opts;
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
    let hw;
    if (bodyWidth !== null && t < blendEnd) {
      hw = smoothStep(bodyWidth, hairlineWidth, t / blendEnd);
    } else if (t <= fadeStart) {
      hw = hairlineWidth;
    } else {
      hw = hairlineWidth * Math.pow(Math.max(0, 1 - (t - fadeStart) / (1 - fadeStart)), 1.7);
    }

    const prev = centerline[Math.max(0, i - 1)];
    const next = centerline[Math.min(n - 1, i + 1)];
    const tdx = next.x - prev.x, tdy = next.y - prev.y;
    const tlen = Math.hypot(tdx, tdy) || 1;
    const pnx = -tdy / tlen * hw, pny = tdx / tlen * hw;

    tops.push({ x: centerline[i].x + pnx, y: centerline[i].y + pny });
    bots.push({ x: centerline[i].x - pnx, y: centerline[i].y - pny });

    if (hw <= 0) break;
  }

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
export function sampleSegments(segs, segIndices, n, cx, cy, scale, refCenter) {
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
// Image: matlack/reference/lowercase/b_4x/01.png (140×196 at 4x)
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
// LOWERCASE 'f' — rebuilt from for/01_paths
// Components: bar-bowl (ellipse, ascender loop), fat-bar (filled polygon,
// descender), entry flick (tapered ribbon), exit crossbar (tapered ribbon).
// All coords in for/01's native frame (viewBox 238×214).
//
// This is a fresh fit: the previous 'f' was traced from fir/01 at 4× upscale
// and that frame didn't give us room to line f up nicely with o and r. The
// for/01 scan has f + o + r together, so everything calibrates in one frame.
// ═════════════════════════════════════════════════════════════════════════════

// Reference anchor: bar-bowl → fat-bar transition (gestalt midpoint).
// Matches path5 start (fat-bar top) and path6 end (where bar-bowl descends
// into the stem).
const F_REF_CENTER = { x: 70, y: 108 };

// ── 'f' bar-bowl ellipses ────────────────────────────────────────────────────
// Fitted by matlack/tools/fit_paths.py on 01_better_bar_bowl
// (path7 "f Bar-Bowl Outer", path8 "f Bar-Bowl Inner"):
//   outer: residual 0.088 [GOOD]
//   inner: residual 0.139 [FAIR] as ellipse;
//          egg-curve fit would drop to 0.035 [GOOD, 75% better, k=+0.576]
// — so Matlack's inner boundary is asymmetric (one end of the loop is
// wider than the other). Sticking with ellipse for now since the renderer
// doesn't have an egg-curve primitive yet; flagged as a future upgrade.
const F_BAR_BOWL = {
  inner: {
    cx: 112.4,
    cy:  58.2,
    a:   37.7,
    b:    4.7,
    tilt: -51.0,
  },
  outer: {
    cx: 116.2,
    cy:  50.8,
    a:   51.6,   // inner→outer ratio: 1.37×
    b:    9.7,   // inner→outer ratio: 2.07×
    tilt: -51.1,
  },
};

// Bar-bowl width function: gentle taper at tips, full thickness in middle.
// Same shape as the prior 'f'.
function fBarBowlWidth(arcFracRaw) {
  const f = (arcFracRaw + BOWL_PHASE) % 1.0;
  if (f < 0.10) return smoothStep(0.35, 0.65, f / 0.10);
  if (f < 0.40) return smoothStep(0.65, 1.0, (f - 0.10) / 0.30);
  if (f < 0.60) return 1.0;
  if (f < 0.90) return smoothStep(1.0, 0.65, (f - 0.60) / 0.30);
  return smoothStep(0.65, 0.35, (f - 0.90) / 0.10);
}

function fBarBowlDensity() { return 0.85; }

// ── 'f' fat-bar (descender) ──────────────────────────────────────────────────
// Direct ink-outline fill using path5 of 01_better_downstroke — 13 cubic
// segments forming a closed shape. Preserves Matlack's subtle asymmetry
// (slight curvature changes along each edge) and, crucially, the FLAT
// bottom cut parallel to rule.y-below at ≈y=212 (sign of good penmanship
// in Copperplate). No extrusion or width param — the polygon IS the ink.
const F_FAT_BAR_SEGS = [
  [[71.77,  96.22], [71.77,  96.22], [65.98,  93.58], [65.98,  93.58]],
  [[65.98,  93.58], [65.83,  93.46], [60.44, 100.55], [62.07, 101.88]],
  [[62.07, 101.88], [61.30, 101.75], [60.31, 115.23], [61.65, 115.61]],
  [[61.65, 115.61], [63.10, 118.64], [37.74, 157.18], [37.33, 156.41]],
  [[37.33, 156.41], [34.18, 154.60], [11.12, 193.81], [ 8.15, 199.58]],
  [[ 8.15, 199.58], [ 7.56, 199.44], [ 5.77, 211.60], [ 7.48, 211.86]],
  [[ 7.48, 211.86], [ 8.41, 216.30], [23.60, 213.28], [23.54, 212.29]],
  [[23.54, 212.29], [23.11, 212.47], [39.22, 184.79], [44.54, 182.44]],
  [[44.54, 182.44], [42.95, 182.60], [44.28, 170.96], [44.75, 170.88]],
  [[44.75, 170.88], [44.70, 170.91], [71.43, 111.58], [76.04, 109.38]],
  [[76.04, 109.38], [75.71, 109.43], [76.60,  99.26], [76.75,  99.23]],
  [[76.75,  99.23], [77.93,  98.75], [77.38,  95.98], [76.99,  96.14]],
  [[76.99,  96.14], [76.66,  95.11], [71.64,  95.83], [71.77,  96.22]],
];

// ── 'f' entry flick ──────────────────────────────────────────────────────────
// From path9 "f Entry" in 01_better_bar_bowl — single cubic from low-left
// (44.60, 116.03) up to the bar-bowl's outer start (81.68, 92.38).
const F_ENTRY_FLICK_SEGS = [
  [[44.60, 116.03], [45.14, 116.67], [82.88, 94.24], [81.68, 92.38]],
];
const F_ENTRY_FLICK = {
  startWidth: 1.2,   // very thin at entry tip
  taperPower: 0.6,   // ease toward thicker end
  liftPoint: 1.0,
};

// ── 'f' exit connector ───────────────────────────────────────────────────────
// Band-true slice of or/01 path2 (the canonical HIGH band; derive_band.py
// high --xh 41 --ybottom 137 --anchor-x 99.2 --skip-head 13.5 --fade-len 5),
// bridged from f's stem. The old segs were the traced for/01 path4 ("f Exit
// → o Entry") verbatim — pair-specific geometry that couldn't coarticulate
// with band-true entrances; its departure handle survives in the bridge.
const F_EXIT_SEGS = [
  // Bridge (authored): stem → band start, keeping path4's departure tangent.
  [[ 70.13, 104.10], [ 70.34, 108.89], [ 82.50, 111.50], [ 88.87, 110.66]],
  // Band-true slice; anchor (99.2, 107.69) at 71.5% x-height.
  [[ 88.87, 110.66], [ 88.67, 111.33], [102.49, 107.33], [102.96, 106.07]],
  [[102.96, 106.07], [103.07, 106.14], [103.20, 106.18], [103.36, 106.18]],
];
// Connector: hairline through the band, fade over the ~4.6 su past-anchor
// tail (anchor at arc fraction (21.2 + 10.8) / (21.2 + 15.4)).
// Hairline is in glyph-local su, and f's frame is small (xh 41 vs the 60
// normalization target) — the physical pen width is constant, so the local
// value is scaled down accordingly (0.65 × 41/60).
const F_EXIT = { hairline: 0.45, fadeStart: 0.874 };

// ── 'f' rule lines ───────────────────────────────────────────────────────────
// In for/01 frame. Tilted rule.y-center is Matlack's own irregularity; we
// compromise (option 3): yCenter midway between f's gestalt (y=108) and
// where o/r's tops sit on the tilted rule line (y≈83). This keeps f's
// xHeight zone comparable to other letters without the comical scale
// blow-up we'd get from strictly anchoring gestalt to rule.y-center.
//
// yBottom from rule.y-bottom (path2) extrapolated to x=70: ≈ 136.
// yTop from f's actual peak (y=21 in path6).
const F_RULE = { yTop: 21, yCenter: 96, yBottom: 137 };

// Structural anchor: gestalt midpoint (same as REF_CENTER for this glyph).
const F_STRUCTURAL_ANCHORS = {
  gestalt: { x: 70, y: 108 },
};

// Join anchors. exit = the canonical high-band scan anchor (46.22, 30.11)
// mapped through the F_EXIT_SEGS slice transform — same point every
// band-true high connector pins, so f→r / f→o coarticulate by construction.
const F_JOIN_ANCHORS = {
  // entry: path6 start (before entry flick). Sits at 51% x-height — off the
  // 15.6% low-join convention; fine while f is only used word-initially
  // (no curs predecessor). TODO before mid-word f: extend the entry flick
  // to the low band and move this onto it.
  entry: { x: 44.60, y: 116.03 },
  exit:  { x: 99.2,  y: 107.69 },
};


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

// Rule-line y-values in e's local frame.
// e's loop tops around y=9 (x-height top) and reaches baseline around y=52.
const E_RULE = { yTop: -34, yCenter: 9, yBottom: 52 };

// Join anchors — curs attach points in e's local frame.
// Heights follow the join convention (see O_JOIN_ANCHORS): low at 15%
// x-height, high at 68.5%. e's x-height is 43 (E_RULE), so low = y 45.5.
//   entry.low:  on the extended default entrance flick.
//   entry.high: on the extended afterHigh entrance flick.
//   exit: ON the final loop segment at 15% — the loop continues past it
//         to (53.59, 40.21), which is the overlap tail.
const E_JOIN_ANCHORS = {
  entry: {
    low:  { x: 0.98, y: 45.3 },
    // high: ON the extended afterHigh flick at 71.6% x-height (matches
    // o.exit and the high-join convention).
    high: { x: 2.99, y: 21.21 },
  },
  // exit: sinback's to/01 scan anchor (41.25, 71.64) mapped through the
  // exit slice's placement transform (scale 1.536, see E_EXIT_SEGS).
  // 15.6% x-height by rule consistency; also where the trimmed loop
  // final segment ends (handoff point).
  exit:  { x: 43.94, y: 45.30 },
};

const E_STRUCTURAL_ANCHORS = {
  crossbarStart: { x: 21.33, y: 35.41 },  // where the loop begins
};

// The full loop as bezier segments, traced from the 'e Loop' path in e/01_paths.
const E_LOOP_SEGS = [
  [[21.33,35.41],[21.27,36.14],[35.04,31.65],[35.61,29.65]],
  [[35.61,29.65],[41.81,27.15],[50.41,10.44],[50.00,10.59]],
  [[50.00,10.59],[51.44,9.37],[45.87,6.53],[42.76,9.31]],
  [[42.76,9.31],[41.17,8.09],[29.05,19.29],[29.84,19.84]],
  [[29.84,19.84],[28.14,20.43],[13.58,45.74],[18.59,46.23]],
  [[18.59,46.23],[16.34,53.24],[29.79,52.13],[30.51,49.90]],
  // Final (exit) segment, trimmed at the exit anchor (43.94, 45.30):
  // beyond that point the labeled exit CONNECTOR (E_EXIT_SEGS, a band-true
  // slice of the to/01 trace) carries the stroke, so the loop ribbon stops
  // where the connector takes over — no forked tail. (This supersedes the
  // 2026-07-03 P2 steepening of the traced (53.56, 40.27) handle.)
  [[30.51,49.90],[30.11,50.88],[37.3,48.27],[43.94,45.30]],
];

// Entrance flick — default (e after @low_exit).
// Dips from the crossbar start down through the 15% x-height low-join band
// (anchor at (0.98, 45.5)), tip ending at y=48. The earlier straight-line
// Band-true slice of to/01 path3 (the canonical LOW band; derive_band.py
// low --xh 43 --ybottom 52 --anchor-x 0.98 --skip-head 12.1 --fade-len 6),
// bridged to the crossbar start. Replaces the hand-authored dip: with r's
// exit now band-true, only a slice of the same trace can coarticulate
// (the dip rode ~1.5 su parallel to it — coart 0.03).
const E_ENTRANCE_DEFAULT_SEGS = [
  // Band-true slice; anchor (0.98, 45.3) at 15.6% x-height.
  [[-10.68, 51.06],[-9.30, 51.97],[-3.30, 47.88],[3.68, 42.40]],
  // Bridge (authored): band → crossbar start, easing 38° → crossbar tangent.
  [[3.68, 42.40],[8.20, 39.60],[14.50, 37.20],[21.33, 35.41]],
];
// Connector, body→tip render order: holds hairline through the anchor
// (at ~0.63 of arc from the body side), fades over the outer tip.
// Hairline rule-consistent: 0.65 × 43/60.
const E_ENTRANCE_DEFAULT = { hairline: 0.47, fadeStart: 0.75 };

// Entrance flick — afterHigh variant (e after @high_exit = b/f/o/v/w).
// Enters from the high-join band (tip at ~78% x-height, up from the old
// (4, 31) = 49% which no high exit could reach) and descends to the
// crossbar start, arriving on the same tangent as before.
const E_ENTRANCE_AFTERHIGH_SEGS = [
  [[0, 18.5],[6, 24],[14, 31],[21.33, 35.41]],
];
// Authored (not yet band-true — o→e still scores low; future work mirrors
// the low-entry slice using the HIGH band).
const E_ENTRANCE_AFTERHIGH = { hairline: 0.47, fadeStart: 0.8 };

// Exit connector — band-true slice of the canonical LOW-band trace
// (to/01 path3 seg B, same curve as o's low entrance), rule-consistent
// scale 43/28 = 1.536, pinned at sinback's scan anchor (41.25, 71.64) →
// local (43.94, 45.30). Runs from just under the loop's lower-right
// (the trace start) through the anchor, fading toward the next letter;
// the loop's trimmed final segment hands off to it at the anchor.
const E_EXIT_SEGS = [
  // Trace slice (seg B, t ∈ [0, 0.566], de Casteljau sub-curve).
  [[32.28, 51.06],[34.37, 52.43],[47.12, 42.32],[57.76, 33.26]],
];
// Anchor at arc-length fraction ~0.43 (body → tip); hairline holds a few
// su past the anchor (fade window overlaps the partner slice's full-width
// zone), then fades toward the next letter's entrance slice.
const E_EXIT = { hairline: 0.65, fadeStart: 0.58 };

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

// Entrance — three forms.
// init: the traced m/01 entrance verbatim — isolated-letter traces are the
// word-INITIAL form (kept per the rules table, m entry '.').
const M_ENTRANCE_INIT_SEGS = [
  [[30.51,72.89],[31.01,72.18],[75.35,32.18],[79.40,37.67]],
];
const M_ENTRANCE_INIT = { startWidth: 1.0, taperPower: 1.7, liftPoint: 1.0 };
// low (mid-word after low exits): band-true slice of to/01 path3
// (derive_band.py low --xh 49.1 --ybottom 86.7 --anchor-x 22 --skip-head 10)
// + authored bridge easing the 38° climb into the humps start.
const M_ENTRANCE_LOW_SEGS = [
  [[5.49, 86.36],[7.10, 86.18],[8.35, 85.93],[8.69, 85.63]],
  [[8.69, 85.63],[12.90, 88.40],[55.11, 50.23],[54.93, 50.10]],
  [[54.93, 50.10],[63.00, 44.30],[72.00, 39.60],[79.20, 37.62]],
];
// high (after b/f/o/v/w): band-true slice of or/01 path2 (derive_band.py
// high --xh 49.1 --ybottom 86.7 --anchor-x 62.55 --skip-head 23). The trace
// end lands 0.6 su above the humps start — the same trace-end-=-body-start
// structure the or/01 scan shows for o→r.
const M_ENTRANCE_HIGH_SEGS = [
  [[55.41, 54.12],[60.24, 52.78],[66.71, 50.59],[67.06, 49.66]],
  [[67.06, 49.66],[69.25, 51.16],[80.39, 39.05],[79.20, 38.21]],
];
// hairline rule-consistent (0.65 × 49.1/60). Anchors sit at body→tip arc
// fractions 0.79 (low, incl. 28 su bridge) / 0.80 (high); fadeStart holds
// hairline ~3-5 su PAST the anchor tip-ward so the pre-anchor overlap band
// stays full-width (fading at the anchor starves the coarticulation zone).
const M_ENTRANCE_CONN = { hairline: 0.53, fadeStartLow: 0.85, fadeStartHigh: 0.90 };

// Rule lines — trace-derived (the m/01 crop has no visible paper rules):
// yCenter = the entrance knob top / humps start height, yBottom = the hump
// valleys (~86.7). yTop nominal (m has no ascender).
const M_RULE = { yTop: -11.5, yCenter: 37.6, yBottom: 86.7 };

// Join anchors. entry anchors are the canonical band scan points through
// each slice's transform; exit sits ON the final traced stroke at 15.6%
// x-height — not band-true yet (same status r→e had pre-conversion), fine
// until an m→x pair becomes a close-study target.
const M_JOIN_ANCHORS = {
  entry: {
    low:  { x: 22.0,  y: 79.05 },
    high: { x: 62.55, y: 51.6 },
  },
  exit: { x: 165.93, y: 79.04 },
};

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

// Rule-line y-values in r's local frame.
// rule.y-top is extrapolated (r doesn't reach into the ascender zone),
// preserving (yTop + yBottom) / 2 = yCenter.
const R_RULE = { yTop: -18, yCenter: 38, yBottom: 94 };

// Join anchors — curs attach points in r's local frame.
//   entry: the overlap-zone anchor where the previous letter's exit lands.
//          Derived from sinback's scan-space r.entry font-anchor (43.12,
//          30.87 in 'or/01') via the structural transform. Sits on r's
//          entry flick, past the body-side end, so the prev letter's
//          exit stroke can overlap with r's entry flick.
//   exit:  curs-attach for the next letter. Placeholder value pending
//          r-before-x scan data.
const R_JOIN_ANCHORS = {
  entry: {
    // low: ON the (extended) default entry flick at the 15% x-height
    // low-join convention height. The old (28.18, 55.62) mid-flick spot
    // sat at 68.5% — fine against the flick, but drift-inconsistent with
    // every low exit (they anchor at 15%).
    low:  { x: -7.55, y: 85.6 },
    // high: the SAME scan point as o.exit — sinback's (46.22, 30.11) on
    // or/01 path2 — mapped through the transform that placed
    // R_ENTRANCE_AFTERHIGH_SEGS (scale 2.17, end pinned to downstrokeTop,
    // nudge included). Both glyphs anchoring the same trace point is what
    // makes the curs overlay reconstruct the trace. Lands at 71.5%
    // x-height, independently agreeing with o.exit's 71.6% convention.
    high: { x: 32.76, y: 53.97 },
  },
  // The canonical low scan point (41.25, 71.64) through the exit
  // connector's slice transform (see R_EXIT_BAND_SEGS) — 15.6% x-height.
  exit:  { x: 87.09, y: 85.28 },
};

// Structural anchors — stable, identifiable features on the letter's body,
// used for aligning the glyph geometry against a scan. Different from join
// anchors (which live in the curs overlap zone); structural anchors sit on
// the letter body proper so they're easy to mark on scans by eye.
const R_STRUCTURAL_ANCHORS = {
  downstrokeTop: { x: 51.75, y: 38.69 },  // top of r's swoop (R_STROKE_SEGS[0] start)
};

// Entrance flick
// Tip extended from (18.10, 64.90) — the traced r/01 flick, which is the
// word-INITIAL form and hangs at 52% x-height — down along the same line
// through the 15% low-join band to 10% (y=88.4), so mid-word low entries
// (e→r, r→r) can overlap. The added stretch is in the deep taper zone,
// so it renders as a fading hairline, per the table's "weak" r entry.
const R_ENTRANCE_SEGS = [
  [[-11.0,88.4],[-11.0,88.4],[51.44,37.99],[51.44,37.99]],
];

// Entrance flick — afterHigh variant (r after b/f/o/v/w, or after strong o-exit).
// Source: or/01 path2 ('o Exit → r Entry'), sliced at t≈0.45 on its 2nd
// cubic so the flick starts at the user's r.entry font-anchor. Transformed
// to r's glyph local frame, then translated (-2.98, +0.54) so the endpoint
// lands on R_STRUCTURAL_ANCHORS.downstrokeTop (= rule.y-center) for clean
// tangent continuity with the afterHigh body at the top.
// Two cubic segments.
const R_ENTRANCE_AFTERHIGH_SEGS = [
  [[25.20, 56.16], [31.00, 55.29], [37.10, 53.14], [37.46, 52.17]],
  [[37.46, 52.17], [40.03, 53.94], [53.16, 39.67], [51.75, 38.69]],
];

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

// Exit flick — traced from isolated r/01, i.e. the WORD-FINAL form (for/01
// path1 'r Downstroke → r Exit (terminal)' confirms terminal r exits are a
// distinct flourish). Kept for the future fina variant; mid-word exits use
// the band-true connector below.
const R_EXIT_SEGS = [
  [[37.56,94.79],[36.90,95.64],[50.31,96.17],[51.21,95.00]],
  [[51.21,95.00],[51.21,95.00],[74.98,86.19],[74.98,86.19]],
];
const R_EXIT = { startWidth: 2.5, taperPower: 1.7, liftPoint: 0.85 };
const R_EXIT_OFFSET = { dx: 0, dy: 0 };

// Mid-word exit connector — band-true slice of to/01 path3 (the canonical
// LOW band; derive_band.py low --xh 56 --ybottom 94 --anchor-x 87.09
// --fade-len 6). anchor-x was chosen so the trace START lands on the
// afterHigh body's bottom-loop end (56.31, 94.58) — zero bridge for that
// form; the default body reaches the trace via a baseline bridge (the
// trace's own opening character is a baseline crawl, so the bridge just
// extends it). Anchor (87.09, 85.28) = the canonical low scan point
// (41.25, 71.64) through this slice's transform, 15.6% x-height.
const R_EXIT_BAND_SEGS = [
  [[56.31, 93.90], [55.77, 94.38], [70.53, 94.02], [71.91, 92.78]],
  [[71.91, 92.78], [73.57, 93.87], [80.42, 89.38], [88.66, 83.02]],
];
const R_EXIT_BRIDGE_DEFAULT = [
  [[36.97, 93.99], [43.40, 95.80], [50.20, 95.30], [56.31, 93.90]],
];
// hairline rule-consistent (0.65 × 56/60); fadeStart: anchor at 33.0 su of
// the 35.5 su slice, plus the 19.8 su bridge for the default form.
const R_EXIT_CONN = { hairline: 0.61, fadeStartAfterHigh: 0.929, fadeStartDefault: 0.955 };

// ── afterHigh variant body + exit ────────────────────────────────────────────
// In Copperplate literature the flat-topped r is a structurally different
// letterform, not just "default r with a different entry flick" — so both
// the body shape and the exit extension differ.
//
// Source: or/01 path1 ("r Downstroke → r Exit"), six cubic segments. That
// scan's r is the afterHigh variant (o precedes it with a high exit).
// Segments translated to r's glyph-local frame via the scan→glyph transform
// for or/01 (scale≈0.446, offsets≈(30.54, 6.04)), then shifted +0.22 in y
// so the first point coincides with R_STRUCTURAL_ANCHORS.downstrokeTop.
const R_STROKE_SEGS_AFTERHIGH = [
  [[51.75, 38.69], [51.55, 38.71], [48.35, 52.66], [50.50, 52.23]],
  [[50.50, 52.23], [49.83, 52.25], [53.23, 60.23], [54.82, 59.58]],
  [[54.82, 59.58], [54.53, 59.31], [32.31, 82.00], [37.08, 86.25]],
  [[37.08, 86.25], [35.19, 86.74], [36.74, 97.25], [44.89, 95.12]],
  [[44.89, 95.12], [43.39, 96.02], [52.95, 96.58], [56.31, 94.58]],
];
const R_EXIT_SEGS_AFTERHIGH = [
  [[56.31, 94.58], [57.05, 97.99], [103.89, 66.30], [103.62, 65.00]],
];

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

// Rule-line y-values in o's local frame.
// o's bowl reaches from about y=3 (top, at θ where the tilted outer ellipse
// peaks) to y=63 (bottom). rule.y-top is extrapolated — o doesn't extend
// into the ascender zone.
const O_RULE = { yTop: -57, yCenter: 3, yBottom: 63 };

// Join anchors — curs attach points in o's local frame.
//   entry: top-left of the bowl (~θ=-π/2 on the tilted outer ellipse),
//          where both low and high entry flicks terminate at the body.
//   exit:  upper-right of the bowl at ~rule.y-center height. o.exit is
//          "strong" (per the rules table) so this anchor governs how a
//          following letter lines up.
// Join-height convention (canonical, from the two human-picked anchors):
//   low joins  at 15% of x-height above rule.y-bottom (sinback's to/01
//   t.exit anchor: 4.4 su / 28 su x-height = 15.7%)
//   high joins at 68.5% (r.entry.high, the most scan-tuned high anchor)
// Every letter's anchors must hit these percentages in its own rule frame,
// or curs attachment accumulates baseline drift letter-by-letter.
const O_JOIN_ANCHORS = {
  entry: {
    // low: sinback's to/01 scan anchor (41.25, 71.64) mapped through the
    // entrance slice's placement transform (scale 2.143, see
    // O_ENTRANCE_DEFAULT_SEGS). 15.6% x-height by rule consistency.
    low:  { x: -7.91, y: 53.66 },
    // high: ON the afterHigh entrance flick, at its closest approach to
    // the 71.6% high-join height (flick min-y is 20.87 = 69.3%; residual
    // drift vs convention -0.8 su, inside the 1.5 su tolerance). The old
    // (27.3, 22.4) was the flick's body-side terminus, not a join point.
    high: { x: 13.67, y: 20.87 },
  },
  // Exit font-anchor from sinback's scan-space o.exit (46.22, 30.11) in
  // 'or/01' via the structural alignment transform. 71.6% x-height — the
  // high-join convention height (matched by r.entry.high).
  exit:  { x: 90.73, y: 20.06 },
};

const O_STRUCTURAL_ANCHORS = {
  bowlCenter: { x: 40.3, y: 33.5 },  // inner ellipse center (= O_REF_CENTER)
  // Topmost point of the outer ellipse (at rule.y-center). Where the
  // pen emerges from the bowl on its way out. Anchor for the left end
  // of O_EXIT_SEGS so the flick starts flush with the bowl.
  bowlTop:    { x: 59.66, y:  3.40 },
};

// Exit-connector Bezier segments in o's local frame.
//
// Band-true slice rule: the portion of a connector inside the join band is
// a rule-consistent-scale copy of the shared trace (or/01 path2), pinned at
// sinback's scan anchor (46.22, 30.11) → local (90.73, 20.06), scale
// 60/xh_scan = 2.325. The receiving glyph's slice (R_ENTRANCE_AFTERHIGH_SEGS)
// is a same-scale copy of the same trace, so the curs overlay reconstructs
// the trace exactly. Any adaptation to this glyph's own body happens in the
// authored BRIDGE segment on the bowl side — never by warping the band.
// (The pre-hiatus version stretched path2's first ~2 scan-units across the
// whole bowl→band span, because our o/03-fitted bowl is smaller than the
// or/01 o bowl; that warp is why the two strokes couldn't coarticulate.)
const O_EXIT_SEGS = [
  // Bridge (authored): bowl top → trace start, riding the bowl's top curve.
  [[59.66,  3.40], [63.50,  4.40], [67.40,  5.40], [70.99,  6.55]],
  // Trace: path2 seg1 — the reversal dip leaving the bowl.
  [[70.99,  6.55], [69.74,  6.97], [71.71, 25.69], [75.62, 24.38]],
  // Trace: path2 seg2 — rises through the anchor toward r; ends ~5 su past
  // the anchor (the fade tail).
  [[75.62, 24.38], [75.22, 25.41], [95.54, 19.53], [96.24, 17.69]],
];
// Connector, not a lift: hairline holds through the anchor (at arc-length
// fraction 0.886), fades over the tail.
const O_EXIT = { hairline: 0.6, fadeStart: 0.886 };

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

// Entrance flick — default (o after @low_exit).
// Enters from ~rule.y-bottom with horizontal-rightward tangent, bows
// downward (stays low) as the pen continues from the preceding letter's
// y-bottom exit, then sweeps up to meet the top-left of the bowl at the
// bowl's own tangent direction (≈ (+0.70, -0.71) at θ=-π/2).
// Band-true slice of the canonical LOW-band trace: to/01 path3 seg B
// ('t Exit Flick → o Entry'), rule-consistent scale 60/28 = 2.143, pinned
// at sinback's scan anchor (41.25, 71.64) → local (-7.91, 53.66). The
// slice runs from the trace (trimmed at local x = -24 to stay in frame)
// up to bowl-attach height; the authored BRIDGE segment covers the last
// ~6 su into the bowl attach point (27.3, 22.4), arriving ~46°. This is
// the long, leftward entrance the scan shows — the pen climbs from near
// baseline (left of the whole bowl) up to the bowl top-left.
const O_ENTRANCE_DEFAULT_SEGS = [
  // Trace slice (seg B, t ∈ [0.011, 0.733], de Casteljau sub-curve).
  [[-24.0, 61.79],[-19.58, 63.48],[8.54, 39.58],[23.3, 26.5]],
  // Bridge (authored): slice end → bowl attach, continuing the ~42° climb.
  [[23.3, 26.5],[24.6, 25.1],[26.0, 23.8],[27.3, 22.4]],
];
// Connector: anchor sits at arc-length fraction ~0.71 measured body → tip;
// width holds ~7 su past the anchor before fading over the tip stretch
// (the previous letter's exit slice is full-width there — the two
// crossfade along the SAME curve).
const O_ENTRANCE_DEFAULT = { hairline: 0.6, fadeStart: 0.60 };

// Entrance flick — afterHigh variant (o after @high_exit = b/f/v/w, or after strong o-exit).
// Enters at ~rule.y-center and arrives at the top-left of the bowl (~θ=-π/2 in
// ref ellipse coords, at (27.3, 22.4)).
const O_ENTRANCE_AFTERHIGH_SEGS = [
  [[4, 22],[12, 20],[20, 21],[27.3, 22.4]],
];
// Connector: anchor (13.67, 20.87) sits at ~0.6 of arc length body → tip,
// so the fade must not start before that.
const O_ENTRANCE_AFTERHIGH = { hairline: 0.6, fadeStart: 0.6 };

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

// ═════════════════════════════════════════════════════════════════════════════
// GEOMETRY-BASED RENDERING
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Render a glyph from its geometry object.
 * geo = { bowls: [...], fills: [...] }
 *
 * Each bowl entry: { outer, inner, widthFn, densityFn, extraFills?, overlayFills? }
 * Each fill entry: { points, pressure }
 */
function renderFromGeo(renderer, geo) {
  for (const bowl of geo.bowls) {
    const opts = {};
    if (bowl.widthFn) opts.widthFn = bowl.widthFn;
    if (bowl.densityFn) opts.densityFn = bowl.densityFn;
    if (bowl.extraFills) opts.extraFills = bowl.extraFills;
    if (bowl.overlayFills) opts.overlayFills = bowl.overlayFills;
    if (bowl.extraStrokes) opts.extraStrokes = bowl.extraStrokes;
    if (bowl.zeroFills) opts.zeroFills = bowl.zeroFills;
    if (bowl.progress !== undefined) opts.progress = bowl.progress;
    renderer.drawBowl(bowl.outer, bowl.inner, opts);
  }
  if (geo.fills.length > 0) {
    renderer.drawFills(geo.fills);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// VARIANT SUPPORT — which {entry, exit} combinations are valid for each letter.
//
// Three categories:
//   - supported:  geometry implemented, returns correct shape
//   - notYet:     valid per `lowercase_rules_table.txt` but geometry TODO;
//                 build falls back to nearest supported variant + logs warning
//   - (implicit) never: not in either list — build throws
//
// Add entries as letters gain variants. Not all letters need a support entry
// yet; missing letters treat their variant arg as "ignored" for compatibility.
// ═════════════════════════════════════════════════════════════════════════════
const VARIANT_SUPPORT = {
  e: {
    supported: [
      { entry: 'low',  exit: 'low' },
      { entry: 'high', exit: 'low' },
    ],
    notYet: [
      { entry: 'none', exit: 'low' },       // init form
      { entry: 'low',  exit: 'flourish' },
      { entry: 'high', exit: 'flourish' },
      { entry: 'none', exit: 'flourish' },
    ],
  },
  o: {
    supported: [
      { entry: 'low',  exit: 'high' },
      { entry: 'high', exit: 'high' },
      { entry: 'none', exit: 'high' },      // init form (word-start)
      { entry: 'none', exit: 'none' },      // isol (standalone "o")
    ],
    notYet: [
      // o's exit-flick geometry isn't rendered yet, so exit:'high' and
      // exit:'none' produce the same shape today. Promoted {none, high}
      // to supported because semantically it's valid for word-initial o
      // and renders correctly (bare bowl) until the exit flick is added.
      { entry: 'low',  exit: 'none' },      // fina after low-exiting letter
      { entry: 'high', exit: 'none' },      // fina after high-exiting letter
    ],
  },
  m: {
    supported: [
      { entry: 'low',  exit: 'low' },
      { entry: 'high', exit: 'low' },       // afterHigh
      { entry: 'none', exit: 'low' },       // word-initial (traced flourish)
    ],
    notYet: [],
  },
  r: {
    supported: [
      { entry: 'low',  exit: 'low' },
      { entry: 'high', exit: 'low' },       // afterHigh
    ],
    notYet: [
      { entry: 'low',  exit: 'flourish' },
      { entry: 'high', exit: 'flourish' },
    ],
  },
};

function variantMatches(v, list) {
  return list.some(x => x.entry === v.entry && x.exit === v.exit);
}

// Returns the variant to actually build. Throws on 'never', warns + substitutes
// on 'notYet'. Returns the input unchanged for 'supported'.
export function resolveVariant(letter, variant) {
  const support = VARIANT_SUPPORT[letter];
  if (!support) return variant;  // letter has no variant awareness yet
  // Partial variants ({entry} with no {exit}, or vice versa) fill missing
  // keys from the letter's default form. Invariant: supported[0] IS the
  // default (same convention as VARIANT_EXPORTS in matlackSVGExport.js).
  variant = { ...support.supported[0], ...(variant || {}) };
  if (variantMatches(variant, support.supported)) return variant;
  if (variantMatches(variant, support.notYet)) {
    // Prefer a supported variant with the same entry — the entry side
    // carries the curs anchor for the incoming join, so degrading the
    // exit must not silently move the entry anchor.
    const fallback = support.supported.find(v => v.entry === variant.entry)
      ?? support.supported[0];
    console.warn(
      `build${letter.toUpperCase()}: variant ${JSON.stringify(variant)} is ` +
      `valid per the rules table but geometry not yet implemented. ` +
      `Falling back to ${JSON.stringify(fallback)}.`
    );
    return fallback;
  }
  throw new Error(
    `build${letter.toUpperCase()}: variant ${JSON.stringify(variant)} is not ` +
    `supported for '${letter}' (never will be; see lowercase_rules_table.txt).`
  );
}

export function buildGlyph(glyph, cx, cy, size, dpr, overrides = {}, variant) {
  const scale = (size * dpr) / 100;
  switch(glyph) {
    case 'a':
      return buildA(cx, cy, scale, dpr, overrides)
    case 'b':
      return buildB(cx, cy, scale, dpr, overrides)
    case 'c':
      return buildC(cx, cy, scale, dpr, overrides)
    case 'd':
      return buildD(cx, cy, scale, dpr, overrides)
    case 'e':
      return buildE(cx, cy, scale, dpr, overrides, variant)
    case 'f':
      return buildF(cx, cy, scale, dpr, overrides)
    case 'g':
      return buildG(cx, cy, scale, dpr, overrides)
    case 'h':
      return buildH(cx, cy, scale, dpr, overrides)
    case 'i':
      return buildI(cx, cy, scale, dpr, overrides)
    case 'j':
      return buildJ(cx, cy, scale, dpr, overrides)
    case 'k':
      return buildK(cx, cy, scale, dpr, overrides)
    case 'l':
      return buildL(cx, cy, scale, dpr, overrides)
    case 'm':
      return buildM(cx, cy, scale, dpr, overrides, variant)
    case 'n':
      return buildN(cx, cy, scale, dpr, overrides)
    case 'o':
      return buildO(cx, cy, scale, dpr, overrides, variant)
    case 'p':
      return buildP(cx, cy, scale, dpr, overrides)
    case 'q':
      return buildQ(cx, cy, scale, dpr, overrides)
    case 'r':
      return buildR(cx, cy, scale, dpr, overrides, variant)
    case 's':
      return buildS(cx, cy, scale, dpr, overrides)
    case 't':
      return buildT(cx, cy, scale, dpr, overrides)
    case 'u':
      return buildU(cx, cy, scale, dpr, overrides)
    case 'v':
      return buildV(cx, cy, scale, dpr, overrides)
    case 'w':
      return buildW(cx, cy, scale, dpr, overrides)
    case 'x':
      return buildX(cx, cy, scale, dpr, overrides)
    case 'y':
      return buildY(cx, cy, scale, dpr, overrides)
    case 'z':
      return buildZ(cx, cy, scale, dpr, overrides)
    default:
      throw new Error(`Glyph ${glyph} not yet supported`)
  }
}

export function renderGlyph(glyph, renderer, cx, cy, size, dpr, overrides = {}, variant) {
  const geo = buildGlyph(glyph, cx, cy, size, dpr, overrides, variant);
  renderFromGeo(renderer, geo);
}

/**
 * Render a Matlack-style lowercase 'a'.
 * Components: bowl, downstroke.
 */
function buildA(cx, cy, scale, dpr, overrides) {
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

/**
 * Render a Matlack-style lowercase 'b'.
 * Components: bowl, barBowl.
 */
function buildB(cx, cy, scale, dpr, overrides) {
  // Main bowl (lower, round)
  const inner = scaleEllipse(B_BOWL.inner, cx, cy, scale, B_REF_CENTER);
  const outer = scaleEllipse(B_BOWL.outer, cx, cy, scale, B_REF_CENTER);

  // Bar-bowl (upper, elongated stem)
  const bbOff = resolveOffset('barBowl', { dx: -4, dy: 0 }, overrides, dpr);
  const bbInner = scaleEllipse(B_BAR_BOWL.inner, cx + bbOff.dx, cy + bbOff.dy, scale, B_REF_CENTER);
  const bbOuter = scaleEllipse(B_BAR_BOWL.outer, cx + bbOff.dx, cy + bbOff.dy, scale, B_REF_CENTER);

  return {
    bowls: [
      {
        outer: outer,
        inner: inner,
        widthFn: bBowlWidth,
        densityFn: bBowlDensity,
      },
      {
        outer: bbOuter,
        inner: bbInner,
        widthFn: bBarBowlWidth,
        densityFn: bBarBowlDensity,
      },
    ],
    fills: [
    ],
  };
}

/**
 * Render a Matlack-style lowercase 'f', rebuilt from for/01_paths.
 * Components:
 *   - barBowl (ellipse, ascender loop)
 *   - fatBar (filled polygon sampled from path5)
 *   - entryFlick (tapered ribbon, path6 segment 1)
 *   - exit (tapered ribbon, path4, the crossbar → o-handoff stroke)
 */
function buildF(cx, cy, scale, dpr, overrides) {
  // ── Bar-bowl (nudge default locked in via grid-search round 2) ──
  const bbOff = resolveOffset('barBowl', { dx: -8, dy: 8 }, overrides, dpr);
  const inner = scaleEllipse(F_BAR_BOWL.inner, cx + bbOff.dx, cy + bbOff.dy, scale, F_REF_CENTER);
  const outer = scaleEllipse(F_BAR_BOWL.outer, cx + bbOff.dx, cy + bbOff.dy, scale, F_REF_CENTER);

  // ── Fat-bar: sample the closed ink outline into a fill polygon ─
  const fbOff = resolveOffset('fatBar', { dx: 0, dy: 0 }, overrides, dpr);
  const fatBarPoly = sampleSegments(
    F_FAT_BAR_SEGS,
    F_FAT_BAR_SEGS.map((_, i) => i),
    10,
    cx + fbOff.dx, cy + fbOff.dy, scale, F_REF_CENTER,
  );

  // ── Entry flick: tapered ribbon from path6 seg 1 ──────────────
  const efOff = resolveOffset('entryFlick', { dx: 0, dy: 0 }, overrides, dpr);
  const efParams = overrides.entryFlick ?? F_ENTRY_FLICK;
  const efCenter = sampleSegments(
    F_ENTRY_FLICK_SEGS, [0], 14,
    cx + efOff.dx, cy + efOff.dy, scale, F_REF_CENTER,
  );
  const entryFlick = buildTaperedRibbon(
    efCenter,
    (efParams.startWidth ?? F_ENTRY_FLICK.startWidth) * scale,
    efParams.taperPower ?? F_ENTRY_FLICK.taperPower,
    efParams.liftPoint  ?? F_ENTRY_FLICK.liftPoint,
  );

  // ── Exit connector: band-true hairline (see F_EXIT_SEGS) ──────
  const exOff = resolveOffset('exit', { dx: 0, dy: 0 }, overrides, dpr);
  const exParams = overrides.exit ?? F_EXIT;
  const exCenter = sampleSegments(
    F_EXIT_SEGS, [0, 1, 2], 14,
    cx + exOff.dx, cy + exOff.dy, scale, F_REF_CENTER,
  );
  const exit = buildConnectorRibbon(
    exCenter,
    (exParams.hairline ?? F_EXIT.hairline) * scale,
    exParams.fadeStart ?? F_EXIT.fadeStart,
  );

  return {
    bowls: [
      {
        outer: outer,
        inner: inner,
        widthFn: fBarBowlWidth,
        densityFn: fBarBowlDensity,
      },
    ],
    fills: [
      { points: fatBarPoly, pressure: 0.85, label: 'body' },
      ...entryFlick.map(p => ({ points: p, pressure: 0.75, label: 'entrance' })),
      ...exit.map(p => ({ points: p, pressure: 0.75, label: 'exit' })),
    ],
  };
}

/**
 * Render a Matlack-style lowercase 'c'.
 * Components: bowl (partial arc), topBlob (filled), bottomHairline (thin stroke).
 */
function buildC(cx, cy, scale, dpr, overrides) {
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
function buildE(cx, cy, scale, dpr, overrides, variant = { entry: 'low', exit: 'low' }) {
  variant = resolveVariant('e', variant);

  const loopCenter = sampleSegments(
    E_LOOP_SEGS,
    [0, 1, 2, 3, 4, 5, 6],
    12, cx, cy, scale, E_REF_CENTER
  );
  const loopQuads = buildRibbon(loopCenter, (t) => eLoopWidth(t, scale));
  const loopFills = loopQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'body' }));

  // Exit connector (band-true slice of the to/01 trace; see E_EXIT_SEGS).
  let exitFills = [];
  if (variant.exit !== 'none') {
    const exitCenter = sampleSegments(E_EXIT_SEGS, [0], 12, cx, cy, scale, E_REF_CENTER);
    const exitQuads = buildConnectorRibbon(
      exitCenter,
      E_EXIT.hairline * scale,
      E_EXIT.fadeStart,
    );
    exitFills = exitQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'exit' }));
  }

  // Entrance flick depends on variant.entry. 'none' → no entry stroke.
  let entrSegs = null, entrParams = null;
  if (variant.entry === 'low') {
    entrSegs = E_ENTRANCE_DEFAULT_SEGS;
    entrParams = E_ENTRANCE_DEFAULT;
  } else if (variant.entry === 'high') {
    entrSegs = E_ENTRANCE_AFTERHIGH_SEGS;
    entrParams = E_ENTRANCE_AFTERHIGH;
  }
  // variant.exit === 'flourish' is not yet implemented — resolveVariant will
  // have already mapped it to a supported variant.

  let entrFills = [];
  if (entrSegs) {
    const entrCenter = sampleSegments(
      entrSegs,
      Array.from({ length: entrSegs.length }, (_, i) => i),
      12, cx, cy, scale, E_REF_CENTER,
    );
    const entrReversed = [...entrCenter].reverse();
    const entrQuads = buildConnectorRibbon(
      entrReversed,
      entrParams.hairline * scale,
      entrParams.fadeStart,
    );
    entrFills = entrQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'entrance' }));
  }

  return {
    bowls: [
    ],
    fills: [
      ...loopFills,
      ...entrFills,
      ...exitFills,
    ],
  };
}

function buildD(cx, cy, scale, dpr, overrides) {
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

/**
 * Render a Matlack-style lowercase 'q'.
 * Components: bowl, downstroke (descender).
 */
function buildQ(cx, cy, scale, dpr, overrides) {
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

/**
 * Render a Matlack-style lowercase 't' (type 1).
 * Components: entrance hairline (tapered ribbon), fat bar, crossbar hairline.
 * No bowl — pure vertical family.
 */
function buildT(cx, cy, scale, dpr, overrides) {
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

  return {
    bowls: [
    ],
    fills: [
      { points: fatBar, pressure: 0.85 },
    { points: crossbar, pressure: 0.70 },
    ...entrFills,
    ],
  };
}

/**
 * Render a Matlack-style lowercase 'g'.
 * Components: bowl + variable-width descender ribbon.
 */
/**
 * Render a Matlack-style lowercase 'h'.
 * Components: entrance flick + bar-bowl + combined downstroke/hump ribbon.
 */
function buildH(cx, cy, scale, dpr, overrides) {
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

  return {
    bowls: [
      {
        outer: outer,
        inner: inner,
        widthFn: hBarBowlWidth,
        densityFn: hBarBowlDensity,
        overlayFills: [
      ...strokeFills,
      ...entrFills,
    ],
      },
    ],
    fills: [
    ],
  };
}

function buildG(cx, cy, scale, dpr, overrides) {
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

/**
 * Render a Matlack-style lowercase 'i'.
 * Components: entrance flick + downstroke (power taper) + dot (filled blob).
 * No bowl, no piecewise width function — just clean tapered ribbons.
 */
function buildI(cx, cy, scale, dpr, overrides) {
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

  return {
    bowls: [
    ],
    fills: [
      ...dsFills,
    ...entrFills,
    { points: dot, pressure: 0.85 },
    ],
  };
}

/**
 * Render a Matlack-style lowercase 'j'.
 * Components: dot + entrance flick + downstroke + bar-bowl (bottom loop) + exit flick.
 */
function buildJ(cx, cy, scale, dpr, overrides) {
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

/**
 * Render a Matlack-style lowercase 'k'.
 * Components: entrance flick + bar-bowl + downstroke + upper crescent + exit stroke.
 */
function buildK(cx, cy, scale, dpr, overrides) {
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

/**
 * Render a Matlack-style lowercase 'l'.
 * Single continuous loop stroke, like 'e' but taller.
 */
function buildL(cx, cy, scale, dpr, overrides) {
  const loopCenter = sampleSegments(
    L_LOOP_SEGS,
    [0, 1, 2, 3, 4, 5, 6, 7],
    12, cx, cy, scale, L_REF_CENTER
  );
  const loopQuads = buildRibbon(loopCenter, (t) => lLoopWidth(t, scale));
  const loopFills = loopQuads.map(quad => ({ points: quad, pressure: 0.85 }));

  return {
    bowls: [
    ],
    fills: [
      ...loopFills,
    ],
  };
}

/**
 * Render a Matlack-style lowercase 'm'.
 * Components: entrance flick + double-hump ribbon.
 */
function buildM(cx, cy, scale, dpr, overrides, variant = { entry: 'low', exit: 'low' }) {
  variant = resolveVariant('m', variant);

  // Double-hump centerline as variable-width ribbon
  const humpsCenter = sampleSegments(
    M_HUMPS_SEGS,
    Array.from({ length: M_HUMPS_SEGS.length }, (_, i) => i),
    12, cx, cy, scale, M_REF_CENTER
  );
  const humpsQuads = buildRibbon(humpsCenter, (t) => mHumpsWidth(t, scale));
  const humpsFills = humpsQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'body' }));

  // Entrance: word-initial keeps the traced flourish (lift-taper); mid-word
  // forms are band-true connectors.
  const entrSegs = variant.entry === 'high' ? M_ENTRANCE_HIGH_SEGS
                 : variant.entry === 'none' ? M_ENTRANCE_INIT_SEGS
                 : M_ENTRANCE_LOW_SEGS;
  const entrCenter = sampleSegments(
    entrSegs,
    Array.from({ length: entrSegs.length }, (_, i) => i),
    12, cx, cy, scale, M_REF_CENTER
  );
  const entrReversed = [...entrCenter].reverse();
  const entrQuads = variant.entry === 'none'
    ? buildTaperedRibbon(
        entrReversed,
        4.0 * scale,
        M_ENTRANCE_INIT.taperPower,
        M_ENTRANCE_INIT.liftPoint,
      )
    : buildConnectorRibbon(
        entrReversed,
        M_ENTRANCE_CONN.hairline * scale,
        variant.entry === 'high' ? M_ENTRANCE_CONN.fadeStartHigh
                                 : M_ENTRANCE_CONN.fadeStartLow,
      );
  const entrFills = entrQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'entrance' }));

  return {
    bowls: [
    ],
    fills: [
      ...humpsFills,
    ...entrFills,
    ],
  };
}

/**
 * Render a Matlack-style lowercase 'n'.
 * Components: entrance flick + single-hump ribbon.
 */
function buildN(cx, cy, scale, dpr, overrides) {
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

  return {
    bowls: [
    ],
    fills: [
      ...humpFills,
    ...entrFills,
    ],
  };
}

/**
 * Render a Matlack-style lowercase 'p'.
 * Components: main downstroke (fat bar) + upstroke hairline + second downstroke (power taper).
 * No bowl — Matlack's actual 'p' form.
 */
function buildP(cx, cy, scale, dpr, overrides) {
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

  return {
    bowls: [
    ],
    fills: [
      { points: mainBar, pressure: 0.85 },
    ...upFills,
    ...secFills,
    ],
  };
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
function buildV(cx, cy, scale, dpr, overrides) {
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

  return {
    bowls: [
    ],
    fills: [
      ...strokeFills,
    ...entrFills,
    ...exitFills,
    ],
  };
}

function buildU(cx, cy, scale, dpr, overrides) {
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

  return {
    bowls: [
    ],
    fills: [
      ...strokeFills,
    ...entrFills,
    ...exitFills,
    ],
  };
}

function buildS(cx, cy, scale, dpr, overrides) {
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

  return {
    bowls: [
    ],
    fills: [
      ...swoopFills,
    ...entrFills,
    ],
  };
}

function buildX(cx, cy, scale, dpr, overrides) {
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

  return {
    bowls: [
    ],
    fills: [
      ...rightFills,
    ...leftFills,
    ],
  };
}

function buildW(cx, cy, scale, dpr, overrides) {
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

  return {
    bowls: [
    ],
    fills: [
      ...strokeFills,
    ...entrFills,
    { points: blob, pressure: 0.85 },
    ...exitFills,
    ],
  };
}

function buildR(cx, cy, scale, dpr, overrides, variant = { entry: 'low', exit: 'low' }) {
  variant = resolveVariant('r', variant);

  // Body + exit geometry depends on variant.entry — r.afterHigh is a
  // structurally different letterform, not just a different entry flick.
  const isAfterHigh = variant.entry === 'high';
  const strokeSegs = isAfterHigh ? R_STROKE_SEGS_AFTERHIGH : R_STROKE_SEGS;

  // Swoop + downstroke as one ribbon.
  const strokeIdxs = Array.from({ length: strokeSegs.length }, (_, i) => i);
  const strokeCenter = sampleSegments(
    strokeSegs, strokeIdxs, 12, cx, cy, scale, R_REF_CENTER
  );
  const strokeQuads = buildRibbon(strokeCenter, (t) => rStrokeWidth(t, scale));
  const strokeFills = strokeQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'body' }));

  // Entrance flick (reversed taper).
  const entrSegs = isAfterHigh ? R_ENTRANCE_AFTERHIGH_SEGS : R_ENTRANCE_SEGS;
  const entrIdxs = Array.from({ length: entrSegs.length }, (_, i) => i);
  const entrCenter = sampleSegments(
    entrSegs, entrIdxs, 12, cx, cy, scale, R_REF_CENTER
  );
  // Connector profile: fat where it merges into the body, hairline through
  // the join band (the trace is a hairline there — or/01 path2), brief fade
  // at the free tip. The old tip-to-zero lift taper left the band portion
  // thinner than the shared trace, so the neighbor's slice couldn't
  // coarticulate with it.
  const entrReversed = [...entrCenter].reverse();
  const entrQuads = buildConnectorRibbon(
    entrReversed,
    0.65 * scale,
    0.9,
    { bodyWidth: 3.5 * scale, blendEnd: 0.4 },
  );
  const entrFills = entrQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'entrance' }));

  // Exit connector — band-true slice (see R_EXIT_BAND_SEGS). The traced
  // flourish forms (R_EXIT_SEGS / R_EXIT_SEGS_AFTERHIGH) are word-final;
  // they'll return as the fina variant.
  const exitOff = resolveOffset('exitFlick', R_EXIT_OFFSET, overrides, dpr);
  const exitConnSegs = isAfterHigh
    ? R_EXIT_BAND_SEGS
    : [...R_EXIT_BRIDGE_DEFAULT, ...R_EXIT_BAND_SEGS];
  const exitIdxs = Array.from({ length: exitConnSegs.length }, (_, i) => i);
  const exitCenter = sampleSegments(
    exitConnSegs, exitIdxs, 12,
    cx + exitOff.dx, cy + exitOff.dy, scale, R_REF_CENTER
  );
  const exitQuads = buildConnectorRibbon(
    exitCenter,
    R_EXIT_CONN.hairline * scale,
    isAfterHigh ? R_EXIT_CONN.fadeStartAfterHigh : R_EXIT_CONN.fadeStartDefault,
  );
  const exitFills = exitQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'exit' }));

  return {
    bowls: [
    ],
    fills: [
      ...strokeFills,
    ...entrFills,
    ...exitFills,
    ],
  };
}

/**
 * Render a Matlack-style lowercase 'z'.
 * Components: entry flick + zigzag weird stroke + bar-bowl loop + exit flick.
 */
function buildZ(cx, cy, scale, dpr, overrides) {
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

  return {
    bowls: [
      {
        outer: bbOuter,
        inner: bbInner,
        widthFn: zBarBowlWidth,
        densityFn: zBarBowlDensity,
        overlayFills: [
      ...strokeFills,
      ...entrFills,
      ...exitFills,
    ],
      },
    ],
    fills: [
    ],
  };
}

function buildY(cx, cy, scale, dpr, overrides) {
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

  return {
    bowls: [
      {
        outer: bbOuter,
        inner: bbInner,
        widthFn: yBarBowlWidth,
        densityFn: yBarBowlDensity,
        overlayFills: [
      ...initFills,
      ...secFills,
      ...entrFills,
      ...exitFills,
    ],
      },
    ],
    fills: [
    ],
  };
}

function buildO(cx, cy, scale, dpr, overrides, variant = { entry: 'low', exit: 'high' }) {
  variant = resolveVariant('o', variant);

  const inner = scaleEllipse(O_BOWL.inner, cx, cy, scale, O_REF_CENTER);
  const outer = scaleEllipse(O_BOWL.outer, cx, cy, scale, O_REF_CENTER);

  // Entrance flick depends on variant.entry.
  let entrSegs = null, entrParams = null;
  if (variant.entry === 'high') {
    entrSegs = O_ENTRANCE_AFTERHIGH_SEGS;
    entrParams = O_ENTRANCE_AFTERHIGH;
  } else if (variant.entry === 'low') {
    entrSegs = O_ENTRANCE_DEFAULT_SEGS;
    entrParams = O_ENTRANCE_DEFAULT;
  }
  // 'none' → no entry stroke; entrSegs stays null.

  // Optional CW rotation of the low-entry flick around its junction (P3)
  // with the bowl. Used for iterating on the flick's angle; in y-down image
  // coords, math CCW rotation visually reads as CW on the page.
  if (entrSegs && variant.entry === 'low' && overrides.defaultEntryRotation) {
    const rad = overrides.defaultEntryRotation * Math.PI / 180;
    const c = Math.cos(rad), s = Math.sin(rad);
    entrSegs = entrSegs.map(seg => {
      const [px, py] = seg[3];
      return seg.map((p, i) => {
        if (i === 3) return p;
        const dx = p[0] - px, dy = p[1] - py;
        return [dx * c - dy * s + px, dx * s + dy * c + py];
      });
    });
  }

  let entrFills = [];
  if (entrSegs) {
    const entrCenter = sampleSegments(
      entrSegs,
      Array.from({ length: entrSegs.length }, (_, i) => i),
      12, cx, cy, scale, O_REF_CENTER,
    );
    // Reversed → body-to-tip order, so the connector fade lands at the tip
    // (the free end reaching toward the previous letter).
    const entrReversed = [...entrCenter].reverse();
    const entrQuads = buildConnectorRibbon(
      entrReversed,
      entrParams.hairline * scale,
      entrParams.fadeStart,
    );
    entrFills = entrQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'entrance' }));
  }

  // Exit connector when variant.exit === 'high'. Geometry is path2 from
  // 'or/01' (o Exit → r Entry) up to the font-anchor plus a short fade
  // tail, in o's glyph local frame. Hairline width — mid-word connectors
  // are continuous strokes, not pen lifts.
  let exitFills = [];
  if (variant.exit === 'high') {
    const exitCenter = sampleSegments(
      O_EXIT_SEGS,
      Array.from({ length: O_EXIT_SEGS.length }, (_, i) => i),
      12, cx, cy, scale, O_REF_CENTER,
    );
    const exitQuads = buildConnectorRibbon(
      exitCenter,
      O_EXIT.hairline * scale,
      O_EXIT.fadeStart,
    );
    exitFills = exitQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'exit' }));
  }

  return {
    bowls: [
      {
        outer: outer,
        inner: inner,
        widthFn: oBowlWidth,
        densityFn: oBowlDensity,
      },
    ],
    fills: [
      ...entrFills,
      ...exitFills,
    ],
  };
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
  const bbOff = resolveRefOffset('barBowl', { dx: 0, dy: 0 }, overrides);
  const fbOff = resolveRefOffset('fatBar',  { dx: 0, dy: 0 }, overrides);

  // Shift an ellipse's center without touching a/b/tilt (ref-space offset).
  const shift = (e, dx, dy) => ({ ...e, cx: e.cx + dx, cy: e.cy + dy });

  // Sample cubic bezier segments into a flat array of [x,y] points in ref space.
  const sampleSegsRef = (segs, perSeg = 12) => {
    const pts = [];
    for (let s = 0; s < segs.length; s++) {
      const [p0, p1, p2, p3] = segs[s];
      const start = s === 0 ? 0 : 1;   // dedupe shared endpoints
      for (let i = start; i <= perSeg; i++) {
        const t = i / perSeg, u = 1 - t;
        const x = u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0];
        const y = u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1];
        pts.push([x + fbOff.dx, y + fbOff.dy]);
      }
    }
    return pts;
  };

  return {
    barBowl: {
      inner: sampleEllipse(shift(F_BAR_BOWL.inner, bbOff.dx, bbOff.dy)),
      outer: sampleEllipse(shift(F_BAR_BOWL.outer, bbOff.dx, bbOff.dy)),
    },
    fatBar: sampleSegsRef(F_FAT_BAR_SEGS, 12),
    // entryFlick + exit are tapered ribbons (not simple outlines); skip for now.
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

// ═════════════════════════════════════════════════════════════════════════════
// RULE LINES + JOIN ANCHORS (per-glyph, in each letter's own local frame)
//
// Groundwork for svg-to-glyph alignment. Each scan declares its rule lines
// in scan coords; each glyph declares its rule lines in local coords. The
// pair gives a linear y-mapping. An additional named join anchor (entry or
// exit) gives one x-correspondence — enough to solve the similarity
// transform between scan and glyph frames.
//
// Only populated for variant-aware letters so far (e, o, r). Fill in
// others as they gain anchor data.
// ═════════════════════════════════════════════════════════════════════════════
export const GLYPH_RULES = {
  e: E_RULE,
  f: F_RULE,
  m: M_RULE,
  o: O_RULE,
  r: R_RULE,
};

export const GLYPH_JOIN_ANCHORS = {
  e: E_JOIN_ANCHORS,
  f: F_JOIN_ANCHORS,
  m: M_JOIN_ANCHORS,
  // f: F_JOIN_ANCHORS, // disabled while we debug f's vertical placement
  o: O_JOIN_ANCHORS,
  r: R_JOIN_ANCHORS,
};

// ── Join tangents (direction of travel at a join anchor) ────────────────────
// A second, more literal notion of "kink" than compose_word.py's PCA-over-
// rendered-ink estimate: the actual tangent of the authored connector curve
// at the anchor point. Anchors sit mid-curve (arc-length fraction ~0.4-0.7,
// not at a segment's control points — see the O_EXIT_SEGS/E_EXIT_SEGS
// comments), so this finds the closest sampled point and finite-differences
// its neighbors rather than evaluating a cubic derivative analytically:
// some connectors have degenerate control points (R_ENTRANCE_SEGS has
// p0=p1 and p2=p3), which would make an analytic B'(t) blow up right at
// the tip/body ends.
//
// Every entry/exit SEGS chain in this file is authored in downstream
// pen-travel order (entry: tip → body attachment; exit: body → free tip),
// so the returned angle already points "forward" along the writing
// direction — no sign bookkeeping needed by callers.
function tangentAtAnchor(segs, anchor, samplesPerSeg = 300) {
  if (!segs || !anchor) return null;
  const idxs = Array.from({ length: segs.length }, (_, i) => i);
  const pts = sampleSegments(segs, idxs, samplesPerSeg, 0, 0, 1, { x: 0, y: 0 });
  let bestI = 0, bestD = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const dx = pts[i].x - anchor.x, dy = pts[i].y - anchor.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; bestI = i; }
  }
  const a = pts[Math.max(0, bestI - 1)];
  const b = pts[Math.min(pts.length - 1, bestI + 1)];
  const dx = b.x - a.x, dy = b.y - a.y;
  if (dx === 0 && dy === 0) return null;
  return Math.atan2(dy, dx) * 180 / Math.PI;
}

// Connector Bezier chains feeding each letter's join anchors, keyed the same
// way buildE/buildO/buildR pick them internally (see those functions).
// NOTE: kept in sync by hand — if a build function's entry/exit seg
// selection changes, mirror the change here too. Returns the SEGS as
// authored, before any per-call transform a build function applies to them
// (e.g. buildO's overrides.defaultEntryRotation) — fine for compose_word.py
// today (it passes no such override), but a future caller that does would
// get a stale tangent out of joinTangentsForVariant below.
function joinSegsForVariant(letter, variant) {
  const v = resolveVariant(letter, variant) || {};
  if (letter === 'o') {
    return {
      entry: v.entry === 'high' ? O_ENTRANCE_AFTERHIGH_SEGS
           : v.entry === 'low'  ? O_ENTRANCE_DEFAULT_SEGS : null,
      exit:  v.exit === 'high' ? O_EXIT_SEGS : null,
    };
  }
  if (letter === 'e') {
    return {
      entry: v.entry === 'low'  ? E_ENTRANCE_DEFAULT_SEGS
           : v.entry === 'high' ? E_ENTRANCE_AFTERHIGH_SEGS : null,
      exit:  v.exit !== 'none' ? E_EXIT_SEGS : null,
    };
  }
  if (letter === 'm') {
    return {
      entry: v.entry === 'high' ? M_ENTRANCE_HIGH_SEGS
           : v.entry === 'low'  ? M_ENTRANCE_LOW_SEGS : null,
      exit:  v.exit !== 'none' ? M_HUMPS_SEGS : null,
    };
  }
  if (letter === 'r') {
    // r.afterHigh is a structurally different letterform (see R_STROKE_SEGS_
    // AFTERHIGH's comment) — body AND exit shape change with variant.entry,
    // not variant.exit. R_JOIN_ANCHORS.exit is a single point shared by both
    // forms, but the curve it sits on differs.
    const isAfterHigh = v.entry === 'high';
    return {
      entry: isAfterHigh ? R_ENTRANCE_AFTERHIGH_SEGS : R_ENTRANCE_SEGS,
      exit:  isAfterHigh ? R_EXIT_BAND_SEGS
           : [...R_EXIT_BRIDGE_DEFAULT, ...R_EXIT_BAND_SEGS],
    };
  }
  return { entry: null, exit: null };
}

// Direction of travel (degrees) at each of a glyph's join anchors, for the
// tangent-based kink check in matlack/tools/compose_word.py. Mirrors
// matlackSVGExport.js's anchorsForVariant point-picking, but resolves an
// angle from the authored curve instead of a rendered-ink point.
export function joinTangentsForVariant(letter, variant) {
  const raw = GLYPH_JOIN_ANCHORS[letter];
  if (!raw) return null;
  const v = resolveVariant(letter, variant) || {};
  const segs = joinSegsForVariant(letter, v);
  const pick = (spec, key) => {
    if (!spec) return null;
    if (typeof spec.x === 'number') return spec;
    return spec[key] || null;
  };
  const tangents = {};
  if (v.entry !== 'none') {
    const t = tangentAtAnchor(segs.entry, pick(raw.entry, v.entry || 'low'));
    if (t !== null) tangents.entry = t;
  }
  if (v.exit !== 'none') {
    const t = tangentAtAnchor(segs.exit, pick(raw.exit, v.exit || 'low'));
    if (t !== null) tangents.exit = t;
  }
  return Object.keys(tangents).length ? tangents : null;
}

// Per-letter REF_CENTER exports — needed by callers that need to compute
// where a glyph's local origin lands after applying a glyphToScanTransform.
// (Each build function uses its own X_REF_CENTER constant internally; this
// just surfaces them for external transform math.)
export const GLYPH_REF_CENTERS = {
  e: E_REF_CENTER,
  f: F_REF_CENTER,
  m: M_REF_CENTER,
  o: O_REF_CENTER,
  r: R_REF_CENTER,
};

// Structural anchors — stable features on the letter body (downstroke top,
// bowl center, etc.), used for aligning the glyph's rendering with a scan.
// Distinct from join anchors, which live in the curs overlap zone.
export const GLYPH_STRUCTURAL_ANCHORS = {
  e: E_STRUCTURAL_ANCHORS,
  f: F_STRUCTURAL_ANCHORS,
  o: O_STRUCTURAL_ANCHORS,
  r: R_STRUCTURAL_ANCHORS,
};

/**
 * Compute a glyph→scan similarity transform for rendering a glyph on top
 * of a scan image.
 *
 * Given rule lines in both frames and one pair of corresponding anchor
 * points, solve for a uniform scale + 2D translation such that:
 *
 *   scan_pt = { x: glyph_pt.x * scale + offsetX,
 *               y: glyph_pt.y * scale + offsetY }
 *
 * y-axis alignment comes from the rule lines (linear map yCenter→yCenter,
 * yBottom→yBottom). x-axis alignment comes from the one matching anchor.
 * No rotation assumed.
 *
 * Intended to be called with STRUCTURAL anchors (e.g. downstrokeTop) for
 * body-alignment purposes — not join anchors, which live in the overlap
 * zone and don't correspond to stable body features.
 *
 * Params:
 *   scanRule    — { yTop, yCenter, yBottom } in scan coords
 *   glyphRule   — { yTop, yCenter, yBottom } in glyph local coords
 *   scanAnchor  — { x, y } in scan coords
 *   glyphAnchor — { x, y } in glyph local coords (same semantic point)
 *
 * Returns { scale, offsetX, offsetY }.
 */
export function glyphToScanTransform(scanRule, glyphRule, scanAnchor, glyphAnchor) {
  // Uniform scale from the x-height zone (well-defined for every letter).
  const scale = (scanRule.yBottom  - scanRule.yCenter)
              / (glyphRule.yBottom - glyphRule.yCenter);

  // y-offset: yBottom maps to yBottom.
  const offsetY = scanRule.yBottom - scale * glyphRule.yBottom;
  // x-offset: the given anchor maps to the given anchor.
  const offsetX = scanAnchor.x - scale * glyphAnchor.x;

  return { scale, offsetX, offsetY };
}
