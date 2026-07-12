/**
 * glyphs/b.js — Matlack lowercase 'b'.
 * Per-letter descriptor module; see glyphs/t.js for the pattern.
 */
import {
  resolveOffset, smoothStep, scaleEllipse, sampleEllipse, resolveRefOffset, BOWL_PHASE, ARC_LIFT, ARC_PRESS, ARC_RISE,
} from './helpers.js';

// Reference anchor: center of 'b's inner (counter) ellipse in ref b/01.
// Image: matlack/reference/lowercase/b_4x/01.png (140×196 at 4x)
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

/**
 * Render a Matlack-style lowercase 'b'.
 * Components: bowl, barBowl.
 */
function build(cx, cy, scale, dpr, overrides) {
  // Main bowl (lower, round)
  const inner = scaleEllipse(B_BOWL.inner, cx, cy, scale, B_REF_CENTER);
  const outer = scaleEllipse(B_BOWL.outer, cx, cy, scale, B_REF_CENTER);

  // Bar-bowl (upper, elongated stem)
  const bbOff = resolveOffset('barBowl', { dx: -4, dy: 0 }, overrides, dpr);
  const bbInner = scaleEllipse(B_BAR_BOWL.inner, cx + bbOff.dx, cy + bbOff.dy, scale, B_REF_CENTER);
  const bbOuter = scaleEllipse(B_BAR_BOWL.outer, cx + bbOff.dx, cy + bbOff.dy, scale, B_REF_CENTER);

  return {
    bowls: [
      {
        outer: outer,
        inner: inner,
        widthFn: bBowlWidth,
        densityFn: bBowlDensity,
      },
      {
        outer: bbOuter,
        inner: bbInner,
        widthFn: bBarBowlWidth,
        densityFn: bBarBowlDensity,
      },
    ],
    fills: [
    ],
  };
}

function exportOutlines(overrides) {
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

export default {
  letter: 'b',
  build,
  exportOutlines,
  outerEllipse: { outer: B_BOWL.outer, refCenter: B_REF_CENTER },
};
