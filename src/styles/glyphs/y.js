/**
 * glyphs/y.js — Matlack lowercase 'y'.
 * Per-letter descriptor module; see glyphs/t.js for the pattern.
 */
import {
  resolveOffset, buildRibbon, buildTaperedRibbon, smoothStep, scaleEllipse, sampleSegments, sampleEllipse, BOWL_PHASE,
} from './helpers.js';

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

function build(cx, cy, scale, dpr, overrides) {
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

function exportOutlines(overrides) {
  return { barBowl: { inner: sampleEllipse(Y_BAR_BOWL.inner), outer: sampleEllipse(Y_BAR_BOWL.outer) } };
}

export default {
  letter: 'y',
  build,
  exportOutlines,
};
