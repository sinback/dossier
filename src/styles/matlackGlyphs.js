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
    // (85.6 → 85.28 when the entrance went band-true: the canonical low
    // scan point through the slice transform; the old value was read off
    // the extended flick and carried a 0.32 su offset every band-true
    // partner exit would have inherited as drift.)
    low:  { x: -7.55, y: 85.28 },
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

// Entrance — band-true slice of to/01 path3 (derive_band.py low --xh 56
// --ybottom 94 --anchor-x -7.55 --skip-head 12.1 --fade-len 20), bridged
// onto the traced entrance line (r/01 flick tip (18.10, 64.90) → body
// junction (51.44, 37.99)). Replaces the original straight-line
// extension of the traced flick, which predates the band-true-entry
// lesson (h, 2026-07-10): a straight extension crosses a band-true
// partner's exit at a shallow angle instead of riding it — u→r scored
// coart 0.02 (essentially offset-parallel). The bridge is G1-ish at
// both ends (slice end tangent −40.3°, line −38.9°). Note r has no
// entry-none variant: this chain is also the word-initial render, whose
// deep baseline-crawling tip matches the table's "naturally y-bottom"
// entry note.
const R_ENTRANCE_SEGS = [
  // Band-true slice; anchor (-7.55, 85.28) at 15.6% x-height.
  [[-25.54, 93.51], [-24.12, 93.31], [-23.05, 93.07], [-22.73, 92.78]],
  [[-22.73, 92.78], [-20.07, 94.53], [-4.07, 81.92], [9.61, 70.31]],
  // Bridge (authored): band → the traced entrance line.
  [[9.61, 70.31], [14.2, 66.42], [19.72, 63.6], [24.0, 60.15]],
  // The traced entrance line, on to the body junction.
  [[24.0, 60.15], [24.0, 60.15], [51.44, 37.99], [51.44, 37.99]],
];
// Reversed render (body→tip fade): anchor sits ~0.78 of arc from the
// body side; hold hairline ~4 su past it, fade over the deep tail.
const R_ENTRANCE_LOW = { fadeStart: 0.83 };

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
    a: aGlyph.outerEllipse,
    b: bGlyph.outerEllipse,
    c: cGlyph.outerEllipse,
    d: dGlyph.outerEllipse,
    f: fGlyph.outerEllipse,
    o: { outer: O_BOWL.outer, refCenter: O_REF_CENTER },
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
  e: eGlyph.variantSupport,
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
      return buildM(cx, cy, scale, dpr, overrides, variant)
    case 'n':
      return nGlyph.build(cx, cy, scale, dpr, overrides)
    case 'o':
      return buildO(cx, cy, scale, dpr, overrides, variant)
    case 'p':
      return pGlyph.build(cx, cy, scale, dpr, overrides)
    case 'q':
      return qGlyph.build(cx, cy, scale, dpr, overrides)
    case 'r':
      return buildR(cx, cy, scale, dpr, overrides, variant)
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
    isAfterHigh ? 0.9 : R_ENTRANCE_LOW.fadeStart,
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
    case 'm': return { humps: 'single-stroke' };
    case 'n': return nGlyph.exportOutlines(overrides);
    case 'p': return pGlyph.exportOutlines(overrides);
    case 'k': return kGlyph.exportOutlines(overrides);
    case 'o': return exportOutlinesO();
    case 'r': return { stroke: 'ribbon' };
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
  m: M_RULE,
  o: O_RULE,
  r: R_RULE,
  t: tGlyph.rule,
  u: U_RULE,
};

export const GLYPH_JOIN_ANCHORS = {
  e: eGlyph.joinAnchors,
  f: fGlyph.joinAnchors,
  h: H_JOIN_ANCHORS,
  l: L_JOIN_ANCHORS,
  m: M_JOIN_ANCHORS,
  o: O_JOIN_ANCHORS,
  r: R_JOIN_ANCHORS,
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
  if (letter === 'e') return eGlyph.joinSegs(v);
  if (letter === 'o') {
    return {
      entry: v.entry === 'high' ? O_ENTRANCE_AFTERHIGH_SEGS
           : v.entry === 'low'  ? O_ENTRANCE_DEFAULT_SEGS : null,
      exit:  v.exit === 'high' ? O_EXIT_SEGS : null,
    };
  }
  if (letter === 'f') {
    return fGlyph.joinSegs(v);
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
  m: M_REF_CENTER,
  o: O_REF_CENTER,
  r: R_REF_CENTER,
  t: tGlyph.refCenter,
  u: U_REF_CENTER,
};

// Structural anchors — stable features on the letter body (downstroke top,
// bowl center, etc.), used for aligning the glyph's rendering with a scan.
// Distinct from join anchors, which live in the curs overlap zone.
export const GLYPH_STRUCTURAL_ANCHORS = {
  e: eGlyph.structuralAnchors,
  f: fGlyph.structuralAnchors,
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
