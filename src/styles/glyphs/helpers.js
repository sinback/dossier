/**
 * glyphs/helpers.js — shared, letter-independent geometry helpers for the
 * Matlack glyph system.
 *
 * Extracted from matlackGlyphs.js so per-letter modules (glyphs/<letter>.js)
 * can import them without creating a letter→aggregator→letter import cycle.
 * Everything here is pure (no per-letter constants, no registry reads).
 *
 * matlackGlyphs.js re-exports the members that were part of its public API
 * (buildRibbon, sampleSegments, glyphOuterEllipse stays there) so external
 * importers (MatlackCanvas, matlackSVGExport) keep working unchanged.
 */

// ── Coordinate transform ─────────────────────────────────────────────────────
// Converts a point from reference image coords to canvas coords.
// refCenter: the anchor point in ref coords (maps to cx, cy on canvas).
// scale: (size * dpr) / 100 — how many canvas pixels per ref pixel.
export function refToCanvas(rx, ry, cx, cy, scale, refCenter) {
  return {
    x: cx + (rx - refCenter.x) * scale,
    y: cy + (ry - refCenter.y) * scale,
  };
}

// ── Offset resolution ────────────────────────────────────────────────────────
// Returns { dx, dy } in DPR-scaled canvas pixels.
// If the overrides object has a key for this component, use it; otherwise fall
// back to the baked-in default. All values are CSS px before DPR.
export function resolveOffset(componentName, defaults, overrides, dpr) {
  const raw = overrides[componentName] ?? defaults;
  return { dx: (raw.dx ?? 0) * dpr, dy: (raw.dy ?? 0) * dpr };
}

// ── Scale polygon around centroid ─────────────────────────────────────────────
// Scales an array of {x, y} points by (sx, sy) around their centroid.
// Used for review-grid scale variations on blobs, flicks, etc.
export function scalePolygon(points, sx, sy) {
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
export function buildTaperedRibbon(centerline, startWidth, taperPower, liftPoint = 1.0) {
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
export function buildConnectorRibbon(centerline, hairlineWidth, fadeStart = 0.85, opts = {}) {
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
export function sampleBezier(p0, p1, p2, p3, n, cx, cy, scale, refCenter) {
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
export function smoothStep(a, b, t) {
  const s = t < 0 ? 0 : t > 1 ? 1 : t;
  return a + (b - a) * (0.5 - 0.5 * Math.cos(s * Math.PI));
}

// ── Scale ellipse from ref coords to canvas coords ───────────────────────────
// Translates center, scales semi-axes, preserves tilt (degrees).
export function scaleEllipse(e, cx, cy, scale, refCenter) {
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

// ── Ellipse point sampler (Shapely export) ────────────────────────────────────
// Samples n points around an ellipse. Returns [[x,y], ...].
export function sampleEllipse(e, n = 64) {
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
export function buildBar(x0, y0, x1, y1, halfWidth) {
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
export function resolveRefOffset(componentName, defaults, overrides) {
  const raw = overrides[componentName] ?? defaults;
  return { dx: raw.dx ?? 0, dy: raw.dy ?? 0 };
}

// ── Tangent at a join anchor ──────────────────────────────────────────────────
// The actual tangent (degrees) of an authored connector curve at an anchor
// point. Anchors sit mid-curve (arc-length fraction ~0.4-0.7, not at a
// segment's control points), so this finds the closest sampled point and
// finite-differences its neighbors rather than evaluating a cubic derivative
// analytically: some connectors have degenerate control points (p0=p1, p2=p3),
// which would make an analytic B'(t) blow up right at the tip/body ends.
//
// Every entry/exit SEGS chain is authored in downstream pen-travel order
// (entry: tip → body attachment; exit: body → free tip), so the returned angle
// already points "forward" along the writing direction.
export function tangentAtAnchor(segs, anchor, samplesPerSeg = 300) {
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

// ── Bowl phase constant ──────────────────────────────────────────────────────
// Shifts the width/density profile ~10° CCW around the bowl.
// This aligns the computed thickness zones with where Matlack actually
// deposits ink. Without this, the thin/fat transitions land about 10°
// off from the reference images. Value found empirically during 'a' iteration.
export const BOWL_PHASE = 0.03;  // ~10° of a full 360° revolution

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
export const ARC_ENTRY = 0.00;  // upper-right: pen enters
export const ARC_LIFT  = 0.22;  // top-left: pen lightens
export const ARC_PRESS = 0.55;  // bottom-left: peak pressure begins
export const ARC_RISE  = 0.78;  // bottom-right: pen starts rising

// ── Variant resolution (pure core) ────────────────────────────────────────────
// Returns the variant to actually build, given the letter's OWN support table
// (passed in — no global read, so this is safe to call from per-letter modules
// without a letter→aggregator→letter cycle). Throws on 'never', warns +
// substitutes on 'notYet', returns the input (with defaults filled) for
// 'supported'. `label` is the letter, used only for message text.
export function variantMatches(v, list) {
  return list.some(x => x.entry === v.entry && x.exit === v.exit);
}

export function resolveVariantPure(support, variant, label) {
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
      `build${label.toUpperCase()}: variant ${JSON.stringify(variant)} is ` +
      `valid per the rules table but geometry not yet implemented. ` +
      `Falling back to ${JSON.stringify(fallback)}.`
    );
    return fallback;
  }
  throw new Error(
    `build${label.toUpperCase()}: variant ${JSON.stringify(variant)} is not ` +
    `supported for '${label}' (never will be; see lowercase_rules_table.txt).`
  );
}
