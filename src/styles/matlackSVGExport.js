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

import { buildGlyph, GLYPH_RULES, GLYPH_REF_CENTERS } from './matlackGlyphs.js';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('');

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

// ── Bowl → SVG path d string (outer + effective inner, evenodd) ──────────────
// Outer path CW + inner path CCW → evenodd punch-through.
function bowlToD(bowl, segments = 64) {
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
 * Export one glyph as an array of SVG <path> element strings.
 *
 * cx, cy: position of the glyph's REF_CENTER (anchor point) in the SVG viewport.
 * size:   glyph scale, same meaning as in renderGlyph (100 = reference size).
 * dpr:    device pixel ratio (1 for export).
 */
export function exportGlyphPaths(glyph, cx, cy, size = 100, dpr = 1) {
  const geo = buildGlyph(glyph, cx, cy, size, dpr);
  return geoPaths(geo).map(({ d, evenodd }) =>
    evenodd ? `<path fill-rule="evenodd" d="${d}" />` : `<path d="${d}" />`
  );
}

/**
 * Export one glyph as a standalone SVG string (for visual inspection).
 */
export function exportGlyphSVG(glyph, size = 100) {
  const margin = size * 0.5;
  const viewSize = size * 2;
  const cx = size;
  const cy = size;

  const pathEls = exportGlyphPaths(glyph, cx, cy, size, 1);

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
export function exportGlyphsForFont(size = 200) {
  const result = {
    size,
    upm:       1000,
    xHeight:    500,
    ascender:   800,
    descender: -200,
    lsb: 50, rsb: 50,
    glyphs: {},
  };
  for (const l of ALPHABET) {
    const geo = buildGlyph(l, 0, 0, size, 1);
    result.glyphs[l] = {
      paths:     geoPaths(geo),
      rule:      GLYPH_RULES[l]       || null,
      refCenter: GLYPH_REF_CENTERS[l] || null,
    };
  }
  return JSON.stringify(result, null, 2);
}
