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
import fGlyph, { fBarBowlWidth, fBarBowlDensity } from './glyphs/f.js';
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
// LOWERCASE 'a'
// Source: sinback's hand traces on ref a/09 (4x upscaled Declaration facsimile)
// ═════════════════════════════════════════════════════════════════════════════


// ── 'a' geometry builders ────────────────────────────────────────────────────



// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 'b'
// Source: sinback's hand traces on ref b/01 (4x upscaled Declaration facsimile)
// ═════════════════════════════════════════════════════════════════════════════



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

// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 'c'
// Source: hand-traced inner + outer arcs on c/02 from high-res facsimile,
// ellipse fit via least-squares with tilt constrained to [-40, -52].
// 'c' is a partial bowl (~260° arc, gap on the right side).
// ═════════════════════════════════════════════════════════════════════════════

// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 'd'
// Source: hand-traced on d/01 from high-res 1823 facsimile (151×156, 1x).
// Structure: bowl (like 'a') + straight downstroke extending above.
// ═════════════════════════════════════════════════════════════════════════════

// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 'q'
// Source: hand-traced on q/01 from high-res 1823 facsimile (84×117, 1x).
// Structure: bowl + straight downstroke extending below (descender).
// Very similar to 'd' but the downstroke goes down instead of up.
// ═════════════════════════════════════════════════════════════════════════════

// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 'e'
// Source: hand-traced on e/01 from high-res 1823 facsimile (69×64, 1x).
// Structure: single continuous loop stroke — no separate bowl or crossbar.
// The pen traces: entry top-right → crossbar left → sweep down around bowl →
//                 come back up → exit right.
// Rendered as a variable-width ribbon following the loop centerline.
// ═════════════════════════════════════════════════════════════════════════════

// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 'g'
// Source: hand-traced on g/01 from high-res 1823 facsimile (182×200, 1x).
// Structure: bowl (like 'a'/'d') + wiggly descender stroke rendered as
//            variable-width ribbon. The descender has a reversal/wiggle in
//            the middle and tapers to hairline at the bottom.
// ═════════════════════════════════════════════════════════════════════════════

// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 'h'
// Source: hand-traced on h/01 from high-res 1823 facsimile (160×182, 1x).
// Structure: entrance flick + bar-bowl (tall stem) + fat bar (short downstroke)
//            + variable-width hump.
// ═════════════════════════════════════════════════════════════════════════════

// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 'i'
// Source: hand-traced on i/01 from high-res 1823 facsimile (121×137, 1x).
// Structure: entrance flick + downstroke (tapered ribbon) + dot (filled blob).
// The downstroke is a simple power taper — no piecewise width function needed.
// ═════════════════════════════════════════════════════════════════════════════

// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 'j'
// Source: hand-traced on j/01 from high-res 1823 facsimile (218×249, 1x).
// Structure: dot + entrance flick + downstroke (fat bar) + bar-bowl (bottom loop)
//            + exit flick. Similar to 'f' structurally.
// ═════════════════════════════════════════════════════════════════════════════

// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 'k'
// Source: hand-traced on k/01 from high-res 1823 facsimile (119×130, 1x).
// Three-stroke letter: 1) entrance flick + bar-bowl + downstroke,
// 2) retrace up along downstroke (implicit), 3) upper crescent + exit stroke.
// ═════════════════════════════════════════════════════════════════════════════

// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 'l'
// Source: hand-traced on l/01 from high-res 1823 facsimile (136×171, 1x).
// Structure: single continuous loop stroke, like 'e' but taller (ascender).
// Rendered as a variable-width ribbon following the loop centerline.
// ═════════════════════════════════════════════════════════════════════════════

// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 'm'
// Source: hand-traced on m/01 from high-res 1823 facsimile (175×118, 1x).
// Structure: entrance flick + double-hump stroke (one continuous ribbon).
// ═════════════════════════════════════════════════════════════════════════════

// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 'n'
// Source: hand-traced on n/01 from high-res 1823 facsimile (107×93, 1x).
// Structure: entrance flick + single-hump stroke (like 'm' with one hump).
// ═════════════════════════════════════════════════════════════════════════════

// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 'p'
// Source: hand-traced on p/01 from high-res 1823 facsimile (160×196, 1x).
// Structure: main downstroke (long fat bar descender) + upstroke hairline
//            + second downstroke (power taper). No bowl — Matlack's 'p' form.
// ═════════════════════════════════════════════════════════════════════════════

// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 'r'
// Source: hand-traced on r/01 from high-res 1823 facsimile (90×116, 1x).
// Beginning-of-word form. Structure: entrance flick + swoop/downstroke
// (combined ribbon) + exit flick.
// ═════════════════════════════════════════════════════════════════════════════

// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 'w'
// Source: hand-traced on w/03 from high-res 1823 facsimile (134×87, 1x).
// Structure: entrance flick + double-descent stroke (like 'm' mirrored) +
//            ink blob at third peak + exit flick.
// ═════════════════════════════════════════════════════════════════════════════

// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 's'
// Source: hand-traced on s/01 from high-res 1823 facsimile (91×91, 1x).
// Structure: entrance flick + swoopy S-curve.
// Surprisingly consistent width — nearly uniform through the whole stroke.
// ═════════════════════════════════════════════════════════════════════════════

// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 'u'
// Source: hand-traced on u/01 from high-res 1823 facsimile (123×85, 1x).
// Structure: entrance flick + single descent/rise stroke + exit flick.
// Like 'w' with one fewer hump, or 'n' mirrored.
// ═════════════════════════════════════════════════════════════════════════════

// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 'v'
// Source: hand-traced on v/02 from high-res 1823 facsimile (91×87, 1x).
// Structure: entrance flick + V-stroke (downstroke + upstroke combined) +
//            fat exit (NOT a hairline flick — stays thick).
// ═════════════════════════════════════════════════════════════════════════════

// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 'x'
// Source: hand-traced on x/01 from high-res 1823 facsimile (116×82, 1x).
// Structure: two crossing crescent strokes (like a backwards 'c' + a 'c').
// Each rendered as a variable-width ribbon, fat in the middle, thin at tips.
// ═════════════════════════════════════════════════════════════════════════════

// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 'z'
// Source: hand-traced on z/01 from high-res 1823 facsimile (118×173, 1x).
// Structure: entry flick + "main weird stroke" (the zigzag z-shape) +
//            bar-bowl descender loop + exit flick.
// ═════════════════════════════════════════════════════════════════════════════

// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 'y'
// Source: hand-traced on y/01 from high-res 1823 facsimile (227×196, 1x).
// Structure: entry flick + initial downstroke (variable-width ribbon) +
//            second downstroke (fat bar / ribbon) + bar-bowl loop (descender)
//            + exit flick.
// REF_CENTER at the junction point where all strokes converge.
// ═════════════════════════════════════════════════════════════════════════════

// ═════════════════════════════════════════════════════════════════════════════
// LOWERCASE 'o'
// Source: automated crescent fit on o/03 from high-res 1823 facsimile.
// 'o' is the simplest letter: just a bowl, no extra components.
// Confirmed tilt consistency with a/b/f at -45.5°.
// ═════════════════════════════════════════════════════════════════════════════

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
    a: aGlyph.outerEllipse,
    b: bGlyph.outerEllipse,
    c: cGlyph.outerEllipse,
    d: dGlyph.outerEllipse,
    f: fGlyph.outerEllipse,
    o: oGlyph.outerEllipse,
    q: qGlyph.outerEllipse,
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
export const VARIANT_SUPPORT = {
  u: uGlyph.variantSupport,
  l: lGlyph.variantSupport,
  h: hGlyph.variantSupport,
  r: rGlyph.variantSupport,
  m: mGlyph.variantSupport,
  o: oGlyph.variantSupport,
  e: eGlyph.variantSupport,
  t: tGlyph.variantSupport,
};

// Public wrapper: looks the letter's support table up in the assembled
// VARIANT_SUPPORT registry, then delegates to the pure resolver in helpers.js.
// (Per-letter build functions call resolveVariantPure directly with their own
// module-local support so they don't depend on this aggregator — see the
// cycle-cut note in glyphs/helpers.js.)
export function resolveVariant(letter, variant) {
  return resolveVariantPure(VARIANT_SUPPORT[letter], variant, letter);
}

export function buildGlyph(glyph, cx, cy, size, dpr, overrides = {}, variant) {
  const scale = (size * dpr) / 100;
  switch(glyph) {
    case 'a':
      return aGlyph.build(cx, cy, scale, dpr, overrides)
    case 'b':
      return bGlyph.build(cx, cy, scale, dpr, overrides)
    case 'c':
      return cGlyph.build(cx, cy, scale, dpr, overrides)
    case 'd':
      return dGlyph.build(cx, cy, scale, dpr, overrides)
    case 'e':
      return eGlyph.build(cx, cy, scale, dpr, overrides, variant)
    case 'f':
      return fGlyph.build(cx, cy, scale, dpr, overrides)
    case 'g':
      return gGlyph.build(cx, cy, scale, dpr, overrides)
    case 'h':
      return hGlyph.build(cx, cy, scale, dpr, overrides, variant)
    case 'i':
      return iGlyph.build(cx, cy, scale, dpr, overrides)
    case 'j':
      return jGlyph.build(cx, cy, scale, dpr, overrides)
    case 'k':
      return kGlyph.build(cx, cy, scale, dpr, overrides)
    case 'l':
      return lGlyph.build(cx, cy, scale, dpr, overrides, variant)
    case 'm':
      return mGlyph.build(cx, cy, scale, dpr, overrides, variant)
    case 'n':
      return nGlyph.build(cx, cy, scale, dpr, overrides)
    case 'o':
      return oGlyph.build(cx, cy, scale, dpr, overrides, variant)
    case 'p':
      return pGlyph.build(cx, cy, scale, dpr, overrides)
    case 'q':
      return qGlyph.build(cx, cy, scale, dpr, overrides)
    case 'r':
      return rGlyph.build(cx, cy, scale, dpr, overrides, variant)
    case 's':
      return sGlyph.build(cx, cy, scale, dpr, overrides)
    case 't':
      return tGlyph.build(cx, cy, scale, dpr, overrides, variant)
    case 'u':
      return uGlyph.build(cx, cy, scale, dpr, overrides, variant)
    case 'v':
      return vGlyph.build(cx, cy, scale, dpr, overrides)
    case 'w':
      return wGlyph.build(cx, cy, scale, dpr, overrides)
    case 'x':
      return xGlyph.build(cx, cy, scale, dpr, overrides)
    case 'y':
      return yGlyph.build(cx, cy, scale, dpr, overrides)
    case 'z':
      return zGlyph.build(cx, cy, scale, dpr, overrides)
    default:
      throw new Error(`Glyph ${glyph} not yet supported`)
  }
}

export function renderGlyph(glyph, renderer, cx, cy, size, dpr, overrides = {}, variant) {
  const geo = buildGlyph(glyph, cx, cy, size, dpr, overrides, variant);
  renderFromGeo(renderer, geo);
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
 * Render a Matlack-style lowercase 'g'.
 * Components: bowl + variable-width descender ribbon.
 */
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
  switch (glyph) {
    case 'a': return aGlyph.exportOutlines(overrides);
    case 'b': return bGlyph.exportOutlines(overrides);
    case 'c': return cGlyph.exportOutlines(overrides);
    case 'd': return dGlyph.exportOutlines(overrides);
    case 'e': return eGlyph.exportOutlines(overrides);
    case 'f': return fGlyph.exportOutlines(overrides);
    case 'g': return gGlyph.exportOutlines(overrides);
    case 'h': return hGlyph.exportOutlines(overrides);
    case 'i': return iGlyph.exportOutlines(overrides);
    case 'j': return jGlyph.exportOutlines(overrides);
    case 'l': return lGlyph.exportOutlines(overrides);
    case 'm': return mGlyph.exportOutlines(overrides);
    case 'n': return nGlyph.exportOutlines(overrides);
    case 'p': return pGlyph.exportOutlines(overrides);
    case 'k': return kGlyph.exportOutlines(overrides);
    case 'o': return oGlyph.exportOutlines(overrides);
    case 'r': return rGlyph.exportOutlines(overrides);
    case 'w': return wGlyph.exportOutlines(overrides);
    case 's': return sGlyph.exportOutlines(overrides);
    case 'u': return uGlyph.exportOutlines(overrides);
    case 'v': return vGlyph.exportOutlines(overrides);
    case 'x': return xGlyph.exportOutlines(overrides);
    case 't': return tGlyph.exportOutlines(overrides);
    case 'y': return yGlyph.exportOutlines(overrides);
    case 'z': return zGlyph.exportOutlines(overrides);
    case 'q': return qGlyph.exportOutlines(overrides);
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
  e: eGlyph.rule,
  f: fGlyph.rule,
  h: hGlyph.rule,
  l: lGlyph.rule,
  m: mGlyph.rule,
  o: oGlyph.rule,
  r: rGlyph.rule,
  t: tGlyph.rule,
  u: uGlyph.rule,
};

export const GLYPH_JOIN_ANCHORS = {
  e: eGlyph.joinAnchors,
  f: fGlyph.joinAnchors,
  h: hGlyph.joinAnchors,
  l: lGlyph.joinAnchors,
  m: mGlyph.joinAnchors,
  o: oGlyph.joinAnchors,
  r: rGlyph.joinAnchors,
  t: tGlyph.joinAnchors,
  u: uGlyph.joinAnchors,
};

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
  const v = resolveVariant(letter, variant) || {};
  if (letter === 'u') return uGlyph.joinSegs(v);
  if (letter === 'l') return lGlyph.joinSegs(v);
  if (letter === 'h') return hGlyph.joinSegs(v);
  if (letter === 'r') return rGlyph.joinSegs(v);
  if (letter === 'm') return mGlyph.joinSegs(v);
  if (letter === 'o') return oGlyph.joinSegs(v);
  if (letter === 'e') return eGlyph.joinSegs(v);
  if (letter === 'f') {
    return fGlyph.joinSegs(v);
  }
  if (letter === 't') {
    return tGlyph.joinSegs(v);
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
  e: eGlyph.refCenter,
  f: fGlyph.refCenter,
  h: hGlyph.refCenter,
  l: lGlyph.refCenter,
  m: mGlyph.refCenter,
  o: oGlyph.refCenter,
  r: rGlyph.refCenter,
  t: tGlyph.refCenter,
  u: uGlyph.refCenter,
};

// Structural anchors — stable features on the letter body (downstroke top,
// bowl center, etc.), used for aligning the glyph's rendering with a scan.
// Distinct from join anchors, which live in the curs overlap zone.
export const GLYPH_STRUCTURAL_ANCHORS = {
  e: eGlyph.structuralAnchors,
  f: fGlyph.structuralAnchors,
  o: oGlyph.structuralAnchors,
  r: rGlyph.structuralAnchors,
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
