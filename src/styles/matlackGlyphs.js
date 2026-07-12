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
  //
  // NOTE: the review-round-1 offset (dx 4, dy -4, candidate 3) is BAKED
  // into these coordinates (trace coords + (4, -4)) and H_STROKE_OFFSET
  // is now zero. resolveOffset scales by dpr but NOT by size/100, so a
  // live offset meant "4 su" at render size 100 (where GLYPH_RULES,
  // anchors, and compose_word.py live) but only "2 su" at font-export
  // size 200 — the font's h stroke landed ~2 su off its anchors and
  // split the h→e seam. Baking freezes the size-100 interpretation at
  // every size.
  [[74.5,89.3],[74.5,89.3],[31.22,153.87],[31.22,153.87]],
  // Hump portion (curves up and around)
  [[32.35,155.16],[32.35,155.16],[57.74,122.56],[57.74,122.56]],
  [[57.74,122.56],[54.34,120.13],[89.90,99.12],[95.49,103.12]],
  [[95.49,103.12],[96.43,103.07],[102.96,122.12],[97.05,122.39]],
  [[97.05,122.39],[96.91,121.29],[80.75,136.38],[81.17,139.91]],
  [[81.17,139.91],[78.65,140.13],[76.38,151.43],[81.49,150.98]],
  [[81.49,150.98],[81.11,150.79],[93.99,151.75],[94.28,151.90]],
  [[94.28,151.90],[96.57,150.82],[125.51,128.24],[124.73,129.48]],
];
const H_STROKE_OFFSET = { dx: 0, dy: 0 };  // baked into H_STROKE_SEGS above

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

// Rule lines in h's RENDERED frame — i.e. trace coords with
// H_STROKE_OFFSET (+4, -4) folded in, since the stroke (feet, hump) is
// what defines the rules and it renders shifted. In trace coords:
// yCenter from the hump-start knob (61.13, 105.06 — same anatomy anchor
// M_RULE used), agreeing with the arch max (~104.5); yBottom weighted
// toward the hump's baseline crawl (y ≈ 155–156) with the downstroke
// foot overshooting to ~159 (0.05 xh, like to/05's t foot). xh 51.5.
// yTop from the tops-reach-~90% convention (bar-bowl ink, unshifted,
// tops out at y ≈ 8); ascender ≈ 2.8 xh — consistent with f and the
// isolated t.
const H_RULE = { yTop: -8, yCenter: 101, yBottom: 152.5 };

// Mid-word low entrance — band-true slice of to/01 path3 (derive_band.py
// low --xh 51.5 --ybottom 152.5 --anchor-x -0.71 --skip-head 12.1
// --fade-len 6; the entrance renders unshifted, so render-frame rules),
// bridged onto the traced entrance line. A first attempt extended the
// traced hang as a straight line (the r recipe) — it crossed t's
// band-true exit at a shallow angle instead of riding it (t→h coart
// 0.07), the same mixed-pair failure e's dip had; only a slice of the
// same trace can coarticulate with a band-true partner. The slice end
// (1.25, 142.0) lands ~2 su off the traced entrance line, so the bridge
// just eases the band tangent (−38°) onto the line's (−32.5°) and the
// traced entrance carries on to the downstroke junction (56.28, 108.23).
// The traced hang form (H_ENTRANCE_SEGS) remains the word-initial entry.
const H_ENTRANCE_LOW_SEGS = [
  // Band-true slice; anchor (-0.71, 144.48) at 15.6% x-height.
  [[-16.23, 151.89], [-15.44, 151.74], [-14.88, 151.57], [-14.67, 151.38]],
  [[-14.67, 151.38], [-13.11, 152.41], [-6.56, 148.06], [1.25, 142.0]],
  // Bridge (authored): band → traced entrance line.
  [[1.25, 142.0], [4.02, 139.86], [8.22, 138.79], [11.17, 136.91]],
  // The traced entrance, word-initial start point → junction.
  [[11.17, 136.91], [11.17, 136.91], [56.28, 108.23], [56.28, 108.23]],
];
// Connector, body→tip render order: holds hairline through the anchor
// (anchor sits at ~0.79 of arc from the body side), fades over the tip.
const H_ENTRANCE_LOW = { hairline: 0.56, fadeStart: 0.83 };

// Mid-word exit connector — band-true slice of to/01 path3 (the canonical
// LOW band; derive_band.py low --xh 51.5 --ybottom 156.5 --anchor-x 118.59
// --fade-len 6). anchor-x was chosen so the trace START lands on the
// hump's baseline valley (90.28, 155.90) — where H_STROKE_SEGS' last
// segment (the traced h→next tail from the "hi/hu" scan) begins. That
// traced tail rises at ~36° while the canonical band crawls the baseline
// first (13 su apart mid-band), so exit-low variants TRUNCATE the tail
// and use this slice instead — the tail stays in exit:'none' forms as
// the kept word-final stroke (table: h exit rule.y-bottom.). Anchor
// (118.59, 148.48) = the canonical low scan point through this slice's
// transform, 15.6% x-height.
// (Coordinates are derive_band.py output + the baked (4, -4) stroke
// shift, so the slice start meets the baked hump valley (94.28, 151.90).)
const H_EXIT_BAND_SEGS = [
  // Bridge (authored): starts ON the body centerline ~3.4 su back so the
  // ribbon emerges from inside the valley ink. Without it the slice
  // start sat 0.5 su past the body ribbon's end cap — connected at
  // compose scale by sampling luck, but a separate ink island in the
  // integer-unit font (h glyph split into body + floating exit).
  [[90.9, 151.66], [92.0, 151.9], [93.3, 152.2], [94.28, 152.41]],
  [[94.28, 152.41], [93.79, 152.85], [107.36, 152.52], [108.63, 151.38]],
  [[108.63, 151.38], [110.19, 152.41], [116.74, 148.06], [124.55, 142.0]],
];
// hairline rule-consistent (0.65 × 51.5/60); fadeStart holds full width
// ~1 su past the anchor (30.4 su of the 33.3 su slice, plus the ~3.5 su
// bridge) — the profile that put t→o over the 0.6 coarticulation bar.
const H_EXIT_CONN = { hairline: 0.56, fadeStart: 0.948 };

// Join anchors — curs attach points in h's RENDERED frame (see H_RULE's
// comment: the exit rides the stroke, so H_STROKE_OFFSET is folded into
// its anchor; the entrance renders unshifted).
const H_JOIN_ANCHORS = {
  entry: {
    // On the extended entrance line at the low-join convention height
    // (15.6% x-height above the rendered baseline). No afterHigh entry yet.
    low: { x: -0.71, y: 144.47 },
  },
  // The canonical low scan point through H_EXIT_BAND_SEGS's transform,
  // plus H_STROKE_OFFSET: (118.59, 148.48) + (4, -4). 15.6% x-height.
  exit: { x: 122.59, y: 144.48 },
};

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

// Rule lines — trace-derived (anatomy anchors, not scan eyeballing):
// yBottom from the baseline turn's valley (centerline bottoms at
// (20.34, 151.35)); ascender from the tops-reach-~90%-of-yTop convention
// with ascender ≈ 2.8 xh (f/t/h all agree): outer ink tops at y ≈ 6.1,
// so xh = (151.4 − 6.1)/2.8 ≈ 51.9 and yCenter = 99.5. Frame is nearly
// h's (xh 51.5), as expected for same-hand ascender letters.
const L_RULE = { yTop: -10, yCenter: 99.5, yBottom: 151.4 };

// Mid-word low entrance — band-true slice of to/01 path3 (derive_band.py
// low --xh 51.9 --ybottom 151.4 --anchor-x 0.6 --skip-head 12.1
// --fade-len 20), bridged onto the traced upstroke. The traced loop's
// seg 0 starts with a landing hook at a 69% x-height hang — the
// word-INITIAL form (r/t lesson); entry:'low' replaces it with this
// chain. fade-len 20 (not h's 6): the slice must stay band-true deep
// enough to cover the longest partner exit tail (e.exit holds the trace
// ~10 scan-su past the anchor) — with a 6-su cut, e's tail rode the
// authored bridge as unshared near-ink and el scored coart 0.43; the
// o-entrance precedent ("crossfade along the SAME curve") fixed it.
// The bridge is the band's rise continued straight into the ascender
// upstroke: G1 at both ends (slice-end tangent −40.5° vs chord −39.3°;
// seg-0 tangent −39.2° at the join point, which is the de Casteljau
// split of L_LOOP_SEGS[0] at t = 0.78).
const L_ENTRANCE_LOW_SEGS = [
  // Band-true slice; anchor (0.6, 143.32) at 15.6% x-height.
  [[-15.13, 150.8], [-14.29, 150.65], [-13.69, 150.47], [-13.47, 150.27]],
  [[-13.47, 150.27], [-10.9, 151.96], [5.11, 139.19], [18.11, 128.09]],
  // Bridge (authored): straight −39° rise, band → upstroke.
  [[18.11, 128.09], [37.1, 111.87], [56.74, 96.43], [76.11, 80.65]],
  // Traced upstroke tail (seg 0 split at t 0.78) → loop-top junction.
  [[76.11, 80.65], [83.26, 74.83], [89.04, 68.94], [92.15, 63.53]],
];
// Connector, body→tip render order: 139.3 su chain, anchor at ~0.867 of
// arc from the body side; hold hairline ~7 su past it (o's entrance
// profile), fading only over the tip, which overlaps the previous
// letter's full-width zone. hairline rule-consistent (0.65 × 51.9/60).
// bodyWidth 2.6 = the loop ribbon's width at the junction (lLoopWidth
// at full-path frac 0.279); blendEnd 0.17 = the traced-upstroke portion
// of the chain.
const L_ENTRANCE_LOW = { hairline: 0.56, fadeStart: 0.917 };

// Mid-word exit connector — band-true slice of to/01 path3 (the canonical
// LOW band; derive_band.py low --xh 51.9 --ybottom 151.4 --anchor-x 48.9
// --fade-len 6). anchor-x was chosen so the trace START (20.37, 151.31)
// lands dead center of the baseline turn's valley ink (centerline
// (20.34, 151.35), half-width ~1.5 there) — zero bridge, the t recipe.
// The traced l→next tail (L_LOOP_SEGS[7], rising at ~35° to a 42%
// x-height tip while the band crawls the baseline) is truncated in
// exit:'low' forms and kept for exit:'none' fina/isol (table: l exit
// rule.y-bottom. — kept word-finally). Anchor (48.9, 143.32) = the
// canonical low scan point through this slice's transform, 15.6% xh.
const L_EXIT_BAND_SEGS = [
  [[20.37, 151.31], [19.87, 151.75], [33.55, 151.42], [34.83, 150.27]],
  [[34.83, 150.27], [36.4, 151.3], [42.98, 146.94], [50.83, 140.86]],
];
// hairline rule-consistent (0.65 × 51.9/60); fadeStart holds full width
// ~1 su past the anchor (31.6 su of the 33.5 su slice) — the short-hold
// profile that put t→o over the 0.6 coarticulation bar.
const L_EXIT_CONN = { hairline: 0.56, fadeStart: 0.94 };

// Join anchors — curs attach points in l's local frame (no offsets on l;
// trace frame == rendered frame).
const L_JOIN_ANCHORS = {
  entry: {
    // The canonical low scan point through L_ENTRANCE_LOW_SEGS' slice
    // transform (15.6% x-height above baseline). No afterHigh entry yet
    // (l after b/f/o/v/w is a notYet variant).
    low: { x: 0.6, y: 143.32 },
  },
  // The canonical low scan point through L_EXIT_BAND_SEGS' transform.
  exit: { x: 48.9, y: 143.32 },
};

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

// Exit flick — the traced word-edge form: leaves the second valley and
// rises at ~−43° to a 70% x-height tip (the band crawls the baseline
// instead, 15.6% anchor) — so exit:'low' replaces it with the band-true
// connector below and this stays for exit:'none' fina/isol (table: u
// exit rule.y-bottom? — no word-final data, keep what the trace has).
const U_EXIT_SEGS = [
  [[87.30,70.33],[87.30,70.33],[120.07,39.38],[120.07,39.38]],
];
const U_EXIT = { startWidth: 2.0, taperPower: 1.7, liftPoint: 0.85 };

// Rule lines — trace-derived (no visible paper rules in the u/01 crop,
// like m): yBottom 74.4 = where the intermediate flick departs the first
// foot (the functional writing line); valley1's hook then dips 2.3 su
// below it (4.6% xh — within the 0–5% foot-hook convention) and valley2
// bottoms 1.2 su above. yCenter 24.5 from the stroke tops (23.2–25.3).
// yTop nominal one-xh-above (m convention; u has no ascender). xh 49.9.
const U_RULE = { yTop: -25.4, yCenter: 24.5, yBottom: 74.4 };

// Mid-word low entrance — band-true slice of to/01 path3 (derive_band.py
// low --xh 49.9 --ybottom 74.4 --anchor-x 16.7 --skip-head 12.1
// --fade-len 20; long fade-len so the band-true span covers the deepest
// partner exit tail — e.exit rides ~10 scan-su past the anchor), bridged
// onto the traced entrance line. anchor-x 16.7 was solved so the slice
// END (34.37, 51.27) lands ON the traced entrance cubic, which is
// nearly band-parallel there: split at t = 0.56 gives curve tangent
// −40.2° vs chord −40.1° vs slice-end −40.6° — G1 through a short
// bridge. The tail keeps the traced arrival curl into the downstroke
// top junction. The full traced flick (U_ENTRANCE_SEGS, a 19.5%-xh
// hang) stays as the word-initial form (table: entry ~rule.y-bottom,
// nerfed-not-omitted at word start).
const U_ENTRANCE_LOW_SEGS = [
  // Band-true slice; anchor (16.7, 66.63) at 15.6% x-height.
  [[2.01, 73.73], [2.58, 73.61], [3.0, 73.47], [3.17, 73.31]],
  [[3.17, 73.31], [5.7, 74.98], [21.72, 62.1], [34.37, 51.27]],
  // Bridge (authored): −40.6° → −40.2°, band → traced entrance line.
  [[34.37, 51.27], [37.64, 48.47], [40.95, 45.72], [44.24, 42.94]],
  // Traced entrance tail (de Casteljau split at t 0.56) → junction.
  [[44.24, 42.94], [55.36, 33.56], [64.73, 24.67], [64.15, 24.16]],
];
// Connector, body→tip render order: 80.3 su chain, anchor at 0.784 of
// arc from the body side; hold hairline ~7 su past it (o's entrance
// profile — crossfade along the same curve), fade only over the tip.
// hairline rule-consistent (0.65 × 49.9/60).
const U_ENTRANCE_LOW = { hairline: 0.54, fadeStart: 0.872 };

// Mid-word exit connector — band-true slice of to/01 path3 (the
// canonical LOW band; derive_band.py low --xh 49.9 --ybottom 74.4
// --anchor-x 109.4 --fade-len 6). The traced exit flick is dropped in
// exit:'low' along with the body's valley lip (U_STROKE_SEGS[6], which
// existed to carry the flick); the slice start (81.97, 74.31) sits
// 1.9 su past the truncated body's end cap, i.e. just OUTSIDE its ink —
// the h island lesson — so an authored bridge starts ON the body
// centerline inside the descending valley ink (seg 5 @ t 0.7) and eases
// G1 into the slice's baseline crawl. Anchor (109.4, 66.63) = the
// canonical low scan point through this slice's transform, 15.6% xh.
const U_EXIT_BAND_SEGS = [
  // Bridge (authored): body valley → slice start.
  [[78.38, 71.19], [79.18, 72.56], [80.38, 74.31], [81.97, 74.31]],
  // Band-true slice.
  [[81.97, 74.31], [81.49, 74.74], [94.64, 74.42], [95.87, 73.31]],
  [[95.87, 73.31], [97.4, 74.32], [103.85, 70.02], [111.5, 64.07]],
];
// hairline rule-consistent (0.65 × 49.9/60); fadeStart holds full width
// ~1 su past the anchor (bridge 5.0 + 30.4 of the 5.0 + 32.6 su chain)
// — the short-hold profile that put t→o over the coarticulation bar.
const U_EXIT_CONN = { hairline: 0.54, fadeStart: 0.941 };

// Join anchors — curs attach points in u's local frame (no offsets on
// u; trace frame == rendered frame).
const U_JOIN_ANCHORS = {
  entry: {
    // The canonical low scan point through U_ENTRANCE_LOW_SEGS' slice
    // transform (15.6% x-height above baseline). No afterHigh entry yet
    // (u after b/f/o/v/w is a notYet variant).
    low: { x: 16.7, y: 66.63 },
  },
  // The canonical low scan point through U_EXIT_BAND_SEGS' transform.
  exit: { x: 109.4, y: 66.63 },
};

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
  r: rGlyph.variantSupport,
  m: mGlyph.variantSupport,
  o: oGlyph.variantSupport,
  e: eGlyph.variantSupport,
  h: {
    supported: [
      { entry: 'low',  exit: 'low' },       // mid-word default
      { entry: 'none', exit: 'low' },       // word-initial ("the" mid-word h is low-low; this is "hi...")
      { entry: 'none', exit: 'none' },      // isol — traced base incl. the h→next tail
      { entry: 'low',  exit: 'none' },      // word-final after low exit (tail kept per table)
    ],
    notYet: [
      { entry: 'high', exit: 'low' },       // after b/f/o/v/w — no afterHigh entry traced
      { entry: 'high', exit: 'none' },
      { entry: 'low',  exit: 'flourish' },
      { entry: 'none', exit: 'flourish' },
    ],
  },
  u: {
    supported: [
      { entry: 'low',  exit: 'low' },       // mid-word default
      { entry: 'none', exit: 'low' },       // word-initial (traced nerfed flick)
      { entry: 'none', exit: 'none' },      // isol — traced base incl. both flicks
      { entry: 'low',  exit: 'none' },      // word-final after low exit (flick kept: no data)
    ],
    notYet: [
      { entry: 'high', exit: 'low' },       // after b/f/o/v/w — no afterHigh entry traced
      { entry: 'high', exit: 'none' },
      { entry: 'low',  exit: 'flourish' },
      { entry: 'none', exit: 'flourish' },
    ],
  },
  l: {
    supported: [
      { entry: 'low',  exit: 'low' },       // mid-word default
      { entry: 'none', exit: 'low' },       // word-initial ("lorem")
      { entry: 'none', exit: 'none' },      // isol — the traced base incl. the l→next tail
      { entry: 'low',  exit: 'none' },      // word-final after low exit (tail kept per table)
    ],
    notYet: [
      { entry: 'high', exit: 'low' },       // after b/f/o/v/w — no afterHigh entry traced
      { entry: 'high', exit: 'none' },
      { entry: 'low',  exit: 'flourish' },
      { entry: 'none', exit: 'flourish' },
    ],
  },
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
      return buildH(cx, cy, scale, dpr, overrides, variant)
    case 'i':
      return iGlyph.build(cx, cy, scale, dpr, overrides)
    case 'j':
      return jGlyph.build(cx, cy, scale, dpr, overrides)
    case 'k':
      return kGlyph.build(cx, cy, scale, dpr, overrides)
    case 'l':
      return buildL(cx, cy, scale, dpr, overrides, variant)
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
      return buildU(cx, cy, scale, dpr, overrides, variant)
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
 * Render a Matlack-style lowercase 'h'.
 * Components: entrance flick + bar-bowl + combined downstroke/hump ribbon.
 */
function buildH(cx, cy, scale, dpr, overrides, variant = undefined) {
  variant = resolveVariant('h', variant);

  // ── Bar-bowl (tall stem) ──────────────────────────────────────
  const inner = scaleEllipse(H_BAR_BOWL.inner, cx, cy, scale, H_REF_CENTER);
  const outer = scaleEllipse(H_BAR_BOWL.outer, cx, cy, scale, H_REF_CENTER);

  // ── Combined downstroke + hump (one continuous variable-width ribbon) ──
  // H_STROKE_SEGS' last segment is the traced h→next tail from the
  // "hi/hu" scan. exit:'low' variants truncate it (the band-true
  // connector below replaces it — see H_EXIT_BAND_SEGS' comment);
  // exit:'none' keeps it as the word-final/isol stroke. When truncating,
  // remap the width function's arc fraction so the profile stays pinned
  // to the same geometry instead of compressing into the shorter path.
  const strokeOff = resolveOffset('stroke', H_STROKE_OFFSET, overrides, dpr);
  const truncate = variant.exit === 'low';
  const fullIdxs = [0, 1, 2, 3, 4, 5, 6, 7];
  const strokeIdxs = truncate ? [0, 1, 2, 3, 4, 5, 6] : fullIdxs;
  const strokeCenter = sampleSegments(
    H_STROKE_SEGS, strokeIdxs, 12,
    cx + strokeOff.dx, cy + strokeOff.dy, scale, H_REF_CENTER
  );
  const polyLen = (pts) => {
    let L = 0;
    for (let i = 1; i < pts.length; i++) {
      L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }
    return L;
  };
  let widthFrac = 1.0;
  if (truncate) {
    const fullCenter = sampleSegments(
      H_STROKE_SEGS, fullIdxs, 12,
      cx + strokeOff.dx, cy + strokeOff.dy, scale, H_REF_CENTER
    );
    widthFrac = polyLen(strokeCenter) / polyLen(fullCenter);
  }
  const strokeQuads = buildRibbon(strokeCenter, (t) => hStrokeWidth(t * widthFrac, scale));
  const strokeFills = strokeQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'body' }));

  // ── Entrance ─────────────────────────────────────────────────
  // entry 'none' (word-initial/isol): the traced hang form — tapered
  // ribbon, thick at the downstroke junction.
  // entry 'low' (mid-word): the same line extended down through the low
  // join band (H_ENTRANCE_LOW_SEGS), rendered as a connector hairline.
  let entrFills;
  if (variant.entry === 'low') {
    const entrCenter = sampleSegments(
      H_ENTRANCE_LOW_SEGS,
      Array.from({ length: H_ENTRANCE_LOW_SEGS.length }, (_, i) => i),
      12, cx, cy, scale, H_REF_CENTER
    );
    const entrReversed = [...entrCenter].reverse();
    const entrQuads = buildConnectorRibbon(
      entrReversed,
      H_ENTRANCE_LOW.hairline * scale,
      H_ENTRANCE_LOW.fadeStart,
      { bodyWidth: 5.0 * scale, blendEnd: 0.25 },
    );
    entrFills = entrQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'entrance' }));
  } else {
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
    entrFills = entrQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'entrance' }));
  }

  // ── Exit connector (band-true slice; see H_EXIT_BAND_SEGS) ───
  // Segs carry the baked stroke shift, so the slice start meets the
  // hump valley in every frame; strokeOff is zero now but kept in the
  // sampling call so a review-grid override still moves both together.
  let exitFills = [];
  if (variant.exit === 'low') {
    const exitCenter = sampleSegments(
      H_EXIT_BAND_SEGS,
      Array.from({ length: H_EXIT_BAND_SEGS.length }, (_, i) => i),
      12, cx + strokeOff.dx, cy + strokeOff.dy, scale, H_REF_CENTER
    );
    const exitQuads = buildConnectorRibbon(
      exitCenter,
      H_EXIT_CONN.hairline * scale,
      H_EXIT_CONN.fadeStart,
    );
    exitFills = exitQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'exit' }));
  }

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
      ...exitFills,
    ],
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
function buildL(cx, cy, scale, dpr, overrides, variant = undefined) {
  variant = resolveVariant('l', variant);

  // ── Body: the traced loop ─────────────────────────────────────────
  // seg 0 is the word-initial entrance sweep (69% x-height hang +
  // landing hook) — dropped in entry:'low' forms, where the band-true
  // connector (L_ENTRANCE_LOW_SEGS) carries the upstroke instead.
  // seg 7 is the traced l→next tail (word-final form) — truncated in
  // exit:'low' forms (see L_EXIT_BAND_SEGS' comment). When segs are
  // dropped, remap the width function's arc fraction so the profile
  // stays pinned to the same geometry (buildH precedent, generalized
  // to a dropped head segment).
  const fullIdxs = [0, 1, 2, 3, 4, 5, 6, 7];
  const firstIdx = variant.entry === 'low' ? 1 : 0;
  const lastIdx = variant.exit === 'low' ? 6 : 7;
  const bodyIdxs = fullIdxs.slice(firstIdx, lastIdx + 1);
  const bodyCenter = sampleSegments(
    L_LOOP_SEGS, bodyIdxs, 12, cx, cy, scale, L_REF_CENTER
  );
  const polyLen = (pts) => {
    let L = 0;
    for (let i = 1; i < pts.length; i++) {
      L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }
    return L;
  };
  let startFrac = 0, endFrac = 1;
  if (firstIdx !== 0 || lastIdx !== 7) {
    const fullLen = polyLen(sampleSegments(
      L_LOOP_SEGS, fullIdxs, 12, cx, cy, scale, L_REF_CENTER
    ));
    if (firstIdx !== 0) {
      startFrac = polyLen(sampleSegments(
        L_LOOP_SEGS, fullIdxs.slice(0, firstIdx), 12, cx, cy, scale, L_REF_CENTER
      )) / fullLen;
    }
    if (lastIdx !== 7) {
      endFrac = 1 - polyLen(sampleSegments(
        L_LOOP_SEGS, fullIdxs.slice(lastIdx + 1), 12, cx, cy, scale, L_REF_CENTER
      )) / fullLen;
    }
  }
  const bodyQuads = buildRibbon(
    bodyCenter,
    (t) => lLoopWidth(startFrac + t * (endFrac - startFrac), scale)
  );
  const bodyFills = bodyQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'body' }));

  // ── Entrance connector (band-true slice; see L_ENTRANCE_LOW_SEGS) ──
  // entry 'none' keeps the traced sweep inside the body ribbon above.
  let entrFills = [];
  if (variant.entry === 'low') {
    const entrCenter = sampleSegments(
      L_ENTRANCE_LOW_SEGS,
      Array.from({ length: L_ENTRANCE_LOW_SEGS.length }, (_, i) => i),
      12, cx, cy, scale, L_REF_CENTER
    );
    const entrReversed = [...entrCenter].reverse();
    const entrQuads = buildConnectorRibbon(
      entrReversed,
      L_ENTRANCE_LOW.hairline * scale,
      L_ENTRANCE_LOW.fadeStart,
      { bodyWidth: 2.6 * scale, blendEnd: 0.17 },
    );
    entrFills = entrQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'entrance' }));
  }

  // ── Exit connector (band-true slice; see L_EXIT_BAND_SEGS) ─────────
  // The slice's start sits dead center of the baseline turn's valley
  // ink, so there is no bridge (the t recipe).
  let exitFills = [];
  if (variant.exit === 'low') {
    const exitCenter = sampleSegments(
      L_EXIT_BAND_SEGS,
      Array.from({ length: L_EXIT_BAND_SEGS.length }, (_, i) => i),
      12, cx, cy, scale, L_REF_CENTER
    );
    const exitQuads = buildConnectorRibbon(
      exitCenter,
      L_EXIT_CONN.hairline * scale,
      L_EXIT_CONN.fadeStart,
    );
    exitFills = exitQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'exit' }));
  }

  return {
    bowls: [
    ],
    fills: [
      ...bodyFills,
      ...entrFills,
      ...exitFills,
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
function buildU(cx, cy, scale, dpr, overrides, variant = undefined) {
  variant = resolveVariant('u', variant);

  // ── Body stroke ────────────────────────────────────────────────────
  // U_STROKE_SEGS[6] is the second valley's rising lip, which exists to
  // carry the traced exit flick — truncated in exit:'low' (the band-true
  // connector below replaces it; h precedent), kept for exit:'none'.
  // When truncating, remap the width function's arc fraction so the
  // profile stays pinned to the same geometry.
  const truncate = variant.exit === 'low';
  const fullIdxs = [0, 1, 2, 3, 4, 5, 6];
  const strokeIdxs = truncate ? [0, 1, 2, 3, 4, 5] : fullIdxs;
  const strokeCenter = sampleSegments(
    U_STROKE_SEGS, strokeIdxs, 12, cx, cy, scale, U_REF_CENTER
  );
  const polyLen = (pts) => {
    let L = 0;
    for (let i = 1; i < pts.length; i++) {
      L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }
    return L;
  };
  let widthFrac = 1.0;
  if (truncate) {
    const fullCenter = sampleSegments(
      U_STROKE_SEGS, fullIdxs, 12, cx, cy, scale, U_REF_CENTER
    );
    widthFrac = polyLen(strokeCenter) / polyLen(fullCenter);
  }
  const strokeQuads = buildRibbon(strokeCenter, (t) => uStrokeWidth(t * widthFrac, scale));
  const strokeFills = strokeQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'body' }));

  // ── Entrance ───────────────────────────────────────────────────────
  // entry 'none' (word-initial/isol): the traced flick — the nerfed
  // word-start form per the table (~rule.y-bottom).
  // entry 'low' (mid-word): band-true connector (U_ENTRANCE_LOW_SEGS).
  let entrFills;
  if (variant.entry === 'low') {
    const entrCenter = sampleSegments(
      U_ENTRANCE_LOW_SEGS,
      Array.from({ length: U_ENTRANCE_LOW_SEGS.length }, (_, i) => i),
      12, cx, cy, scale, U_REF_CENTER
    );
    const entrReversed = [...entrCenter].reverse();
    const entrQuads = buildConnectorRibbon(
      entrReversed,
      U_ENTRANCE_LOW.hairline * scale,
      U_ENTRANCE_LOW.fadeStart,
      { bodyWidth: 3.0 * scale, blendEnd: 0.25 },
    );
    entrFills = entrQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'entrance' }));
  } else {
    const entrCenter = sampleSegments(
      U_ENTRANCE_SEGS, [0], 12, cx, cy, scale, U_REF_CENTER
    );
    const entrReversed = [...entrCenter].reverse();
    const entrQuads = buildTaperedRibbon(
      entrReversed, 4.0 * scale, U_ENTRANCE.taperPower, U_ENTRANCE.liftPoint,
    );
    entrFills = entrQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'entrance' }));
  }

  // ── Exit ───────────────────────────────────────────────────────────
  // exit 'none': the traced flick (word-edge form, kept per the table).
  // exit 'low': band-true connector via the authored valley bridge
  // (see U_EXIT_BAND_SEGS).
  let exitFills;
  if (variant.exit === 'low') {
    const exitCenter = sampleSegments(
      U_EXIT_BAND_SEGS,
      Array.from({ length: U_EXIT_BAND_SEGS.length }, (_, i) => i),
      12, cx, cy, scale, U_REF_CENTER
    );
    const exitQuads = buildConnectorRibbon(
      exitCenter,
      U_EXIT_CONN.hairline * scale,
      U_EXIT_CONN.fadeStart,
    );
    exitFills = exitQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'exit' }));
  } else {
    const exitCenter = sampleSegments(
      U_EXIT_SEGS, [0], 12, cx, cy, scale, U_REF_CENTER
    );
    const exitQuads = buildTaperedRibbon(
      exitCenter, U_EXIT.startWidth * scale, U_EXIT.taperPower, U_EXIT.liftPoint,
    );
    exitFills = exitQuads.map(quad => ({ points: quad, pressure: 0.85, label: 'exit' }));
  }

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
    case 'h': return { barBowl: { inner: sampleEllipse(H_BAR_BOWL.inner), outer: sampleEllipse(H_BAR_BOWL.outer) } };
    case 'i': return iGlyph.exportOutlines(overrides);
    case 'j': return jGlyph.exportOutlines(overrides);
    case 'l': return { loop: 'single-stroke' };
    case 'm': return mGlyph.exportOutlines(overrides);
    case 'n': return nGlyph.exportOutlines(overrides);
    case 'p': return pGlyph.exportOutlines(overrides);
    case 'k': return kGlyph.exportOutlines(overrides);
    case 'o': return oGlyph.exportOutlines(overrides);
    case 'r': return rGlyph.exportOutlines(overrides);
    case 'w': return wGlyph.exportOutlines(overrides);
    case 's': return sGlyph.exportOutlines(overrides);
    case 'u': return { stroke: 'ribbon' };
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
  h: H_RULE,
  l: L_RULE,
  m: mGlyph.rule,
  o: oGlyph.rule,
  r: rGlyph.rule,
  t: tGlyph.rule,
  u: U_RULE,
};

export const GLYPH_JOIN_ANCHORS = {
  e: eGlyph.joinAnchors,
  f: fGlyph.joinAnchors,
  h: H_JOIN_ANCHORS,
  l: L_JOIN_ANCHORS,
  m: mGlyph.joinAnchors,
  o: oGlyph.joinAnchors,
  r: rGlyph.joinAnchors,
  t: tGlyph.joinAnchors,
  u: U_JOIN_ANCHORS,
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
  if (letter === 'h') {
    return {
      entry: v.entry === 'low' ? H_ENTRANCE_LOW_SEGS : H_ENTRANCE_SEGS,
      exit:  v.exit === 'low'  ? H_EXIT_BAND_SEGS : null,
    };
  }
  if (letter === 'l') {
    // entry 'none' keeps the traced sweep inside the body ribbon
    // (L_LOOP_SEGS seg 0) — no separate entrance segs.
    return {
      entry: v.entry === 'low' ? L_ENTRANCE_LOW_SEGS : null,
      exit:  v.exit === 'low'  ? L_EXIT_BAND_SEGS : null,
    };
  }
  if (letter === 'u') {
    return {
      entry: v.entry === 'low' ? U_ENTRANCE_LOW_SEGS : U_ENTRANCE_SEGS,
      exit:  v.exit === 'low'  ? U_EXIT_BAND_SEGS : null,
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
  e: eGlyph.refCenter,
  f: fGlyph.refCenter,
  h: H_REF_CENTER,
  l: L_REF_CENTER,
  m: mGlyph.refCenter,
  o: oGlyph.refCenter,
  r: rGlyph.refCenter,
  t: tGlyph.refCenter,
  u: U_REF_CENTER,
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
