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
const F_REF_CENTER = { x: 171.4, y: 74.6 };

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
    case 'f':
      return renderF(renderer, cx, cy, scale, dpr, overrides)
    case 'o':
      return renderO(renderer, cx, cy, scale, dpr, overrides)
    case 'q':
      return renderQ(renderer, cx, cy, scale, dpr, overrides)
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
  const blob = sampleSegments(
    C_TOP_BLOB_SEGS,
    [0, 1, 2, 3],
    12, cx + blobOff.dx, cy + blobOff.dy, scale, C_REF_CENTER
  );

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
  const flickFills = flickQuads.map(quad => ({ points: quad, pressure: 0.85 }));

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
    case 'f': return exportOutlinesF(overrides);
    case 'o': return exportOutlinesO();
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
