/**
 * matlackSVGExport.js — SVG path export for Matlack glyph geometry.
 *
 * Converts the geo format (bowls + fills) from buildGlyph into SVG path data.
 * Primary use: feeding the fonttools pipeline to generate a draft .otf font.
 *
 * Bowl sampling mirrors the renderer's variableInnerEllipse logic exactly:
 *   effective_inner(arcFrac) = lerp(inner_pt, outer_pt, 1 - widthFn(arcFrac))
 * so the SVG outline matches what the WebGL renderer draws.
 */

import { buildGlyph, GLYPH_RULES, GLYPH_REF_CENTERS,
         GLYPH_JOIN_ANCHORS, resolveVariant } from './matlackGlyphs.js';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('');

// Per-letter variant-glyph exports. First entry (suffix '') is the "default"
// used without any calt substitution. Remaining entries become separate glyphs
// named `<letter>.<suffix>`, referenced by the calt rules emitted alongside.
const VARIANT_EXPORTS = {
  o: [
    ['',          { entry: 'low',  exit: 'high' }],   // mid-word default
    ['afterHigh', { entry: 'high', exit: 'high' }],   // after b/f/o/v/w
    ['init',      { entry: 'none', exit: 'high' }],   // word-initial
    ['isol',      { entry: 'none', exit: 'none' }],   // standalone (no neighbors)
  ],
  r: [
    ['',          { entry: 'low',  exit: 'low' }],    // mid-word default
    ['afterHigh', { entry: 'high', exit: 'low' }],    // after b/f/o/v/w
  ],
  e: [
    ['',          { entry: 'low',  exit: 'low' }],    // mid-word default
    ['afterHigh', { entry: 'high', exit: 'low' }],    // after b/f/o/v/w
  ],
};

// Returns a minimal calt+classes `.fea` snippet covering the variant glyphs
// above. Written into the UFO features.fea by the Python side.
function generateFeatures() {
  const highExit   = 'b f o v w';
  const allLowers  = 'a b c d e f g h i j k l m n o p q r s t u v w x y z';
  return `
@high_exit   = [${highExit}];
@all_letters = [${allLowers}];

feature calt {
  # Standalone o (neither preceded nor followed by a letter) → isol form.
  # Both ignore-subs guard the substitution; it fires only when neither
  # context matches, i.e. the o is truly alone.
  ignore sub @all_letters o';
  ignore sub              o' @all_letters;
           sub            o' by o.isol;

  # Word-initial o (not preceded by a letter, IS followed by one) → init.
  # The ignore inverts the preceding-letter context; the lookahead
  # @all_letters in the sub restricts to the "followed by letter" case —
  # which rules out the standalone case already handled above.
  ignore sub @all_letters o';
           sub            o' @all_letters by o.init;

  # Contextual joins after @high_exit letters.
  sub @high_exit e' by e.afterHigh;
  sub @high_exit o' by o.afterHigh;
  sub @high_exit r' by r.afterHigh;
} calt;
`.trim() + '\n';
}

// ── Ellipse point sampler ─────────────────────────────────────────────────────
// Returns {x, y} on the ellipse at the given angle (radians).
// Matches renderer: angle = -arcFrac * 2π (negative = CW in math coords).
function ellipsePoint(e, angle) {
  const tiltR = (e.tilt || 0) * Math.PI / 180;
  const cosT = Math.cos(tiltR), sinT = Math.sin(tiltR);
  const lx = e.a * Math.cos(angle);
  const ly = e.b * Math.sin(angle);
  return {
    x: e.cx + cosT * lx - sinT * ly,
    y: e.cy + sinT * lx + cosT * ly,
  };
}

// ── Polygon → SVG path d string ───────────────────────────────────────────────
function ptsToD(pts) {
  if (pts.length === 0) return '';
  const f = n => n.toFixed(3);
  let d = `M ${f(pts[0].x)} ${f(pts[0].y)}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${f(pts[i].x)} ${f(pts[i].y)}`;
  }
  return d + ' Z';
}

// ── Bowl → sampled ring point arrays (outer + effective inner) ───────────────
function bowlRings(bowl, segments = 64) {
  const { outer, inner, widthFn } = bowl;
  const wFn = widthFn || (() => 1.0);

  const outerPts = [];
  const innerEffPts = [];

  for (let i = 0; i < segments; i++) {
    const arcFrac = i / segments;
    const angle = -arcFrac * 2 * Math.PI;  // match renderer winding

    const op = ellipsePoint(outer, angle);
    const ip = ellipsePoint(inner, angle);
    const w = wFn(arcFrac);

    outerPts.push(op);
    // effective inner: lerp from inner toward outer as widthFn decreases
    // w=1 → inner stays (full stroke); w=0 → inner = outer (no stroke)
    innerEffPts.push({
      x: ip.x + (op.x - ip.x) * (1 - w),
      y: ip.y + (op.y - ip.y) * (1 - w),
    });
  }

  return { outerPts, innerEffPts };
}

// ── Bowl → SVG path d string (outer + effective inner, evenodd) ──────────────
// Outer path CW + inner path CCW → evenodd punch-through.
function bowlToD(bowl, segments = 64) {
  const { outerPts, innerEffPts } = bowlRings(bowl, segments);
  // outer CW (angle goes negative = CW in math) + inner reversed (CCW) = evenodd cutout
  return ptsToD(outerPts) + ' ' + ptsToD([...innerEffPts].reverse());
}

// ── Fill polygon → SVG path d string ─────────────────────────────────────────
function fillToD(fill) {
  return ptsToD(fill.points);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Low-level: extract raw SVG path `d` strings from a geo object.
 * Returns [{d, evenodd}, ...] where evenodd=true means the path needs fill-rule="evenodd".
 */
export function geoPaths(geo) {
  const result = [];
  for (const bowl of geo.bowls) {
    result.push({ d: bowlToD(bowl), evenodd: true });
    for (const ef of (bowl.extraFills || [])) {
      result.push({ d: fillToD(ef), evenodd: false });
    }
    for (const of_ of (bowl.overlayFills || [])) {
      result.push({ d: fillToD(of_), evenodd: false });
    }
  }
  for (const fill of geo.fills) {
    result.push({ d: fillToD(fill), evenodd: false });
  }
  return result;
}

/**
 * Low-level: extract raw ring coordinates from a geo object, in draw order.
 * Returns [{kind: 'bowl', outer: [[x,y],...], inner: [[x,y],...]} |
 *          {kind: 'fill', points: [[x,y],...]}, ...]
 * Bowl entries are crescents: ink = outer minus inner. Fill entries are
 * plain polygons. Coordinates are in the same frame as geoPaths output.
 */
export function geoRings(geo) {
  const pairs = pts => pts.map(p => [p.x, p.y]);
  const result = [];
  for (const bowl of geo.bowls) {
    const { outerPts, innerEffPts } = bowlRings(bowl);
    result.push({ kind: 'bowl', outer: pairs(outerPts), inner: pairs(innerEffPts) });
    for (const ef of (bowl.extraFills || [])) {
      result.push({ kind: 'fill', points: pairs(ef.points), label: ef.label ?? null });
    }
    for (const of_ of (bowl.overlayFills || [])) {
      result.push({ kind: 'fill', points: pairs(of_.points), label: of_.label ?? null });
    }
  }
  for (const fill of geo.fills) {
    result.push({ kind: 'fill', points: pairs(fill.points), label: fill.label ?? null });
  }
  return result;
}

/**
 * Export one glyph as an array of SVG <path> element strings.
 *
 * cx, cy: position of the glyph's REF_CENTER (anchor point) in the SVG viewport.
 * size:   glyph scale, same meaning as in renderGlyph (100 = reference size).
 * dpr:    device pixel ratio (1 for export).
 */
export function exportGlyphPaths(glyph, cx, cy, size = 100, dpr = 1, overrides = {}, variant) {
  const geo = buildGlyph(glyph, cx, cy, size, dpr, overrides, variant);
  return geoPaths(geo).map(({ d, evenodd }) =>
    evenodd ? `<path fill-rule="evenodd" d="${d}" />` : `<path d="${d}" />`
  );
}

/**
 * Export one glyph as a standalone SVG string (for visual inspection).
 */
export function exportGlyphSVG(glyph, size = 100, overrides = {}, variant) {
  const margin = size * 0.5;
  const viewSize = size * 2;
  const cx = size;
  const cy = size;

  const pathEls = exportGlyphPaths(glyph, cx, cy, size, 1, overrides, variant);

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg"`,
    `     width="${viewSize + margin}" height="${viewSize + margin}"`,
    `     viewBox="${-margin / 2} ${-margin / 2} ${viewSize + margin} ${viewSize + margin}">`,
    `<g fill="black">`,
    ...pathEls,
    `</g>`,
    `</svg>`,
  ].join('\n');
}

/**
 * Export one glyph as raw geometry for external analysis/rasterization
 * (Shapely, PIL, etc.). Same framing as exportGlyphSVG: REF_CENTER sits at
 * (size, size), frame spans [-size/4, size*2.25] in both axes.
 *
 * Returns { frame: {minX, minY, width, height}, anchor: [cx, cy],
 *           rules: {yTop, yCenter, yBottom, yBelow?} | null,
 *           rings: geoRings(...) }
 * Rule y-values are transformed into the same frame; null for letters
 * without GLYPH_RULES data.
 */
export function exportGlyphRender(glyph, size = 100, overrides = {}, variant) {
  const margin = size * 0.5;
  const viewSize = size * 2;
  const cx = size;
  const cy = size;

  const geo = buildGlyph(glyph, cx, cy, size, 1, overrides, variant);

  const rule = GLYPH_RULES[glyph];
  const refCenter = GLYPH_REF_CENTERS[glyph];
  let rules = null;
  if (rule && refCenter) {
    const toY = ry => (ry - refCenter.y) * (size / 100) + cy;
    rules = {
      yTop: toY(rule.yTop),
      yCenter: toY(rule.yCenter),
      yBottom: toY(rule.yBottom),
      ...(rule.yBelow != null ? { yBelow: toY(rule.yBelow) } : {}),
    };
  }

  // Join anchors (variant-aware), mapped into the same frame as the rings.
  const joinRaw = anchorsForVariant(glyph, variant, size);
  const joinAnchors = joinRaw
    ? Object.fromEntries(Object.entries(joinRaw).map(([k, p]) => [k, [p.x + cx, p.y + cy]]))
    : null;

  return {
    frame: {
      minX: -margin / 2,
      minY: -margin / 2,
      width: viewSize + margin,
      height: viewSize + margin,
    },
    anchor: [cx, cy],
    rules,
    joinAnchors,
    rings: geoRings(geo),
  };
}

/**
 * Export all 26 lowercase letters as a single SVG grid (for visual inspection).
 * Letters are arranged in rows of `cols` glyphs, spaced by `cellSize`.
 */
export function exportAlphabetSVG(size = 80, cols = 10) {
  const cell = size * 1.6;
  const rows = Math.ceil(ALPHABET.length / cols);
  const svgW = cols * cell;
  const svgH = rows * cell;

  const groups = ALPHABET.map((l, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = cell * col + cell * 0.5;
    const cy = cell * row + cell * 0.5;
    const pathEls = exportGlyphPaths(l, cx, cy, size, 1);
    return `<g id="glyph-${l}">\n  ${pathEls.join('\n  ')}\n</g>`;
  });

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg"`,
    `     width="${svgW}" height="${svgH}"`,
    `     viewBox="0 0 ${svgW} ${svgH}">`,
    `<g fill="black">`,
    ...groups,
    `</g>`,
    `</svg>`,
  ].join('\n');
}

/**
 * Export all glyph path data as a JSON object for the fonttools pipeline.
 *
 * Coordinate convention:
 *   - Each glyph is built via `buildGlyph(letter, 0, 0, size, 1)`, so paths
 *     are in an "output frame" with REF_CENTER at origin and scaled by
 *     (size / 100).
 *   - SVG y-down within that frame.
 *
 * Per-letter `rule` + `refCenter` (for letters that have GLYPH_RULES) let
 * the Python side position each letter's baseline at the font baseline and
 * scale so all x-height-zones come out the same in font units. Letters
 * without metadata fall back to uniform scaling on the Python side.
 *
 * Each letter entry:
 *   {
 *     paths:     [{d, evenodd}, ...],
 *     rule:      { yTop, yCenter, yBottom } in glyph-local-ref units, or null
 *     refCenter: { x, y } in glyph-local-ref units, or null
 *   }
 */
// Transform GLYPH_JOIN_ANCHORS values into the same output frame as the
// paths (REF_CENTER at origin, scaled by size/100). Drop entry/exit
// anchors that don't apply to this variant (e.g. init has no entry).
function anchorsForVariant(letter, variant, size) {
  const raw = GLYPH_JOIN_ANCHORS[letter];
  const ref = GLYPH_REF_CENTERS[letter];
  if (!raw || !ref) return null;
  const v = resolveVariant(letter, variant) || {};
  const scale = size / 100;
  const toOutput = (pt) => ({
    x: (pt.x - ref.x) * scale,
    y: (pt.y - ref.y) * scale,
  });
  // Anchor spec is either a plain point (variant-independent) or a map
  // keyed by the variant's entry/exit value ({low: pt, high: pt}) — an
  // afterHigh entry arrives at y-center, so its anchor differs from the
  // low form's.
  const pick = (spec, key) => {
    if (!spec) return null;
    if (typeof spec.x === 'number') return spec;
    return spec[key] || null;
  };
  const anchors = {};
  if (v.entry !== 'none') {
    const pt = pick(raw.entry, v.entry || 'low');
    if (pt) anchors.entry = toOutput(pt);
  }
  if (v.exit !== 'none') {
    const pt = pick(raw.exit, v.exit || 'low');
    if (pt) anchors.exit = toOutput(pt);
  }
  return Object.keys(anchors).length ? anchors : null;
}

export function exportGlyphsForFont(size = 200) {
  const result = {
    size,
    upm:       1000,
    xHeight:    500,
    ascender:   800,
    descender: -200,
    lsb: 50, rsb: 50,
    features:  generateFeatures(),
    glyphs:    {},
  };
  for (const l of ALPHABET) {
    const variants = VARIANT_EXPORTS[l] || [['', undefined]];
    for (const [suffix, variant] of variants) {
      const geo = buildGlyph(l, 0, 0, size, 1, {}, variant);
      const glyphName = suffix ? `${l}.${suffix}` : l;
      result.glyphs[glyphName] = {
        paths:     geoPaths(geo),
        rule:      GLYPH_RULES[l]       || null,
        refCenter: GLYPH_REF_CENTERS[l] || null,
        letter:    l,
        isDefault: !suffix,
        joinAnchors: anchorsForVariant(l, variant, size),
      };
    }
  }
  return JSON.stringify(result, null, 2);
}
