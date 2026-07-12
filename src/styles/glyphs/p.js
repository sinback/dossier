/**
 * glyphs/p.js — Matlack lowercase 'p'.
 * Per-letter descriptor module; see glyphs/t.js for the pattern.
 */
import {
  refToCanvas, resolveOffset, buildRibbon, buildTaperedRibbon, smoothStep, sampleSegments,
} from './helpers.js';

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

/**
 * Render a Matlack-style lowercase 'p'.
 * Components: main downstroke (fat bar) + upstroke hairline + second downstroke (power taper).
 * No bowl — Matlack's actual 'p' form.
 */
function build(cx, cy, scale, dpr, overrides) {
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

function exportOutlines(overrides) {
  return { mainDownstroke: 'fat-bar', secondDownstroke: 'tapered-ribbon' };
}

export default {
  letter: 'p',
  build,
  exportOutlines,
};
