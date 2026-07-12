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
//
// Letter-independent geometry helpers now live in ./glyphs/helpers.js so that
// per-letter modules can import them without a letter→aggregator→letter cycle.
// Imported here for the letter build functions still in this file; the two
// that were part of the public API (buildRibbon, sampleSegments) are re-exported.
// ═════════════════════════════════════════════════════════════════════════════
import {
  refToCanvas, resolveOffset, scalePolygon,
  buildRibbon, buildTaperedRibbon, buildConnectorRibbon,
  smoothStep, scaleEllipse, sampleSegments,
  sampleEllipse, buildBar, resolveRefOffset, tangentAtAnchor,
  resolveVariantPure,
  BOWL_PHASE, ARC_LIFT, ARC_PRESS, ARC_RISE,
} from './glyphs/helpers.js';

// Re-export the helpers that external importers pull from matlackGlyphs.js.
export { buildRibbon, sampleSegments };

// ── Per-letter modules ────────────────────────────────────────────────────────
// Each letter is migrating to its own descriptor module under ./glyphs/. The
// registries, dispatch, and join-seg lookups below reference these descriptors
// for migrated letters and inline constants for the rest (see Phase D of
// matlack/analysis/parallel-bringup-plan.md, which finishes the derivation).
import tGlyph from './glyphs/t.js';
import fGlyph from './glyphs/f.js';
import uGlyph from './glyphs/u.js';
import lGlyph from './glyphs/l.js';
import hGlyph from './glyphs/h.js';
import rGlyph from './glyphs/r.js';
import mGlyph from './glyphs/m.js';
import oGlyph from './glyphs/o.js';
import eGlyph from './glyphs/e.js';
import wGlyph from './glyphs/w.js';
import zGlyph from './glyphs/z.js';
import kGlyph from './glyphs/k.js';
import jGlyph from './glyphs/j.js';
import yGlyph from './glyphs/y.js';
import xGlyph from './glyphs/x.js';
import vGlyph from './glyphs/v.js';
import sGlyph from './glyphs/s.js';
import pGlyph from './glyphs/p.js';
import nGlyph from './glyphs/n.js';
import iGlyph from './glyphs/i.js';
import qGlyph from './glyphs/q.js';
import gGlyph from './glyphs/g.js';
import dGlyph from './glyphs/d.js';
import cGlyph from './glyphs/c.js';
import bGlyph from './glyphs/b.js';
import aGlyph from './glyphs/a.js';

// ═════════════════════════════════════════════════════════════════════════════
// DESCRIPTOR REGISTRY — single source of truth
//
// Every letter's geometry, variants, join segments, and registry data live in
// its own module under ./glyphs/. This map keys those descriptors by letter;
// the build/outline dispatch, all GLYPH_* registries, VARIANT_SUPPORT, and
// glyphOuterEllipse below are derived from it — and matlackSVGExport.js derives
// VARIANT_EXPORTS from it too. A letter is a member of a registry iff its
// descriptor carries the corresponding field (rule, joinAnchors, refCenter,
// structuralAnchors, variantSupport, outerEllipse), so bringing a letter up
// touches only its module, not this file.
// ═════════════════════════════════════════════════════════════════════════════
export const GLYPHS = {
  a: aGlyph, b: bGlyph, c: cGlyph, d: dGlyph, e: eGlyph, f: fGlyph, g: gGlyph,
  h: hGlyph, i: iGlyph, j: jGlyph, k: kGlyph, l: lGlyph, m: mGlyph, n: nGlyph,
  o: oGlyph, p: pGlyph, q: qGlyph, r: rGlyph, s: sGlyph, t: tGlyph, u: uGlyph,
  v: vGlyph, w: wGlyph, x: xGlyph, y: yGlyph, z: zGlyph,
};

// Derive a registry object { letter: descriptor[field] } over letters whose
// descriptor defines `field`. Iteration order is alphabetical (GLYPHS order).
function byDescriptorField(field) {
  return Object.fromEntries(
    Object.entries(GLYPHS)
      .filter(([, g]) => g[field] !== undefined)
      .map(([k, g]) => [k, g[field]]));
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
  return GLYPHS[glyph]?.outerEllipse ?? null;
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
export const VARIANT_SUPPORT = byDescriptorField('variantSupport');

// Public wrapper: looks the letter's support table up in the assembled
// VARIANT_SUPPORT registry, then delegates to the pure resolver in helpers.js.
// (Per-letter build functions call resolveVariantPure directly with their own
// module-local support so they don't depend on this aggregator — see the
// cycle-cut note in glyphs/helpers.js.)
export function resolveVariant(letter, variant) {
  return resolveVariantPure(VARIANT_SUPPORT[letter], variant, letter);
}

export function buildGlyph(glyph, cx, cy, size, dpr, overrides = {}, variant) {
  const g = GLYPHS[glyph];
  if (!g) throw new Error(`Glyph ${glyph} not yet supported`);
  const scale = (size * dpr) / 100;
  return g.build(cx, cy, scale, dpr, overrides, variant);
}

export function renderGlyph(glyph, renderer, cx, cy, size, dpr, overrides = {}, variant) {
  const geo = buildGlyph(glyph, cx, cy, size, dpr, overrides, variant);
  renderFromGeo(renderer, geo);
}


// ═════════════════════════════════════════════════════════════════════════════
// OUTLINE EXPORT (for Hypothesis / Shapely intersection checks)
//
// Exports component outlines as coordinate arrays in ref-pixel space.
// No canvas, no DPR — just raw geometry with overrides applied.
// Python side: json.load → Shapely Polygon for each component.
// ═════════════════════════════════════════════════════════════════════════════

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
  const g = GLYPHS[glyph];
  if (!g) throw new Error(`Glyph ${glyph} not yet supported`);
  return g.exportOutlines(overrides);
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
export const GLYPH_RULES = byDescriptorField('rule');

export const GLYPH_JOIN_ANCHORS = byDescriptorField('joinAnchors');

// ── Join tangents (direction of travel at a join anchor) ────────────────────
// tangentAtAnchor (closest-sample finite difference; handles degenerate
// control points) lives in ./glyphs/helpers.js — imported above.

// Connector Bezier chains feeding each letter's join anchors, keyed the same
// way buildE/buildO/buildR pick them internally (see those functions).
// NOTE: kept in sync by hand — if a build function's entry/exit seg
// selection changes, mirror the change here too. Returns the SEGS as
// authored, before any per-call transform a build function applies to them
// (e.g. buildO's overrides.defaultEntryRotation) — fine for compose_word.py
// today (it passes no such override), but a future caller that does would
// get a stale tangent out of joinTangentsForVariant below.
function joinSegsForVariant(letter, variant) {
  const g = GLYPHS[letter];
  if (!g || !g.joinSegs) return { entry: null, exit: null };
  const v = resolveVariant(letter, variant) || {};
  return g.joinSegs(v);
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
export const GLYPH_REF_CENTERS = byDescriptorField('refCenter');

// Structural anchors — stable features on the letter body (downstroke top,
// bowl center, etc.), used for aligning the glyph's rendering with a scan.
// Distinct from join anchors, which live in the curs overlap zone.
export const GLYPH_STRUCTURAL_ANCHORS = byDescriptorField('structuralAnchors');

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
