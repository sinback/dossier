// Stroke-order-aware handwritten text animation for InteractivePaperCanvas.
//
// For characters in STROKE_TABLE: uses hardcoded normalized waypoints based on
// standard US print penmanship stroke order, mapped to the rendered char bbox.
// For unknown characters: renders to offscreen 2D canvas, column-scans ink pixels,
// animates along the resulting centerline path.

// ── Stroke table ──────────────────────────────────────────────────────────────
// Each entry: array of strokes. Each stroke: array of [nx, ny] normalized coords.
// [0,0] = top-left of character bounding box, [1,1] = bottom-right.
// Follows US grade-school print penmanship: top-down, left-to-right preference.
const STROKE_TABLE = {

  // ── Uppercase ─────────────────────────────────────────────────────────────
  'A': [
    [[0.50, 0.00], [0.36, 0.32], [0.22, 0.62], [0.08, 1.00]],
    [[0.50, 0.00], [0.64, 0.32], [0.78, 0.62], [0.92, 1.00]],
    [[0.22, 0.57], [0.50, 0.57], [0.78, 0.57]],
  ],
  'B': [
    [[0.18, 0.00], [0.18, 1.00]],
    [[0.18, 0.00], [0.65, 0.06], [0.82, 0.20], [0.78, 0.40], [0.18, 0.50]],
    [[0.18, 0.50], [0.75, 0.56], [0.88, 0.70], [0.82, 0.88], [0.18, 1.00]],
  ],
  'C': [
    [[0.84, 0.20], [0.66, 0.04], [0.40, 0.01], [0.14, 0.18],
     [0.03, 0.44], [0.05, 0.70], [0.20, 0.90], [0.44, 0.99], [0.68, 0.96], [0.84, 0.80]],
  ],
  'D': [
    [[0.18, 0.00], [0.18, 1.00]],
    [[0.18, 0.00], [0.56, 0.04], [0.84, 0.22], [0.92, 0.50],
     [0.84, 0.78], [0.56, 0.96], [0.18, 1.00]],
  ],
  'E': [
    [[0.18, 0.00], [0.18, 0.35], [0.18, 0.65], [0.18, 1.00]],
    [[0.18, 0.00], [0.51, 0.00], [0.84, 0.00]],
    [[0.18, 0.50], [0.44, 0.50], [0.70, 0.50]],
    [[0.18, 1.00], [0.51, 1.00], [0.84, 1.00]],
  ],
  'F': [
    [[0.18, 0.00], [0.18, 0.35], [0.18, 0.65], [0.18, 1.00]],
    [[0.18, 0.00], [0.51, 0.00], [0.84, 0.00]],
    [[0.18, 0.50], [0.45, 0.50], [0.72, 0.50]],
  ],
  'G': [
    [[0.84, 0.20], [0.66, 0.04], [0.40, 0.01], [0.14, 0.18],
     [0.03, 0.44], [0.05, 0.70], [0.20, 0.90], [0.44, 0.99], [0.68, 0.96],
     [0.84, 0.80], [0.84, 0.52], [0.54, 0.52]],
  ],
  'H': [
    [[0.15, 0.00], [0.15, 0.35], [0.15, 0.65], [0.15, 1.00]],
    [[0.85, 0.00], [0.85, 0.35], [0.85, 0.65], [0.85, 1.00]],
    [[0.15, 0.50], [0.50, 0.50], [0.85, 0.50]],
  ],
  'I': [
    [[0.50, 0.00], [0.50, 0.35], [0.50, 0.65], [0.50, 1.00]],
  ],
  'J': [
    [[0.65, 0.00], [0.65, 0.80], [0.54, 0.96], [0.34, 1.00], [0.18, 0.88]],
  ],
  'K': [
    [[0.15, 0.00], [0.15, 0.35], [0.15, 0.65], [0.15, 1.00]],
    [[0.80, 0.00], [0.55, 0.20], [0.32, 0.38], [0.15, 0.50]],
    [[0.15, 0.50], [0.32, 0.62], [0.55, 0.80], [0.84, 1.00]],
  ],
  'L': [
    [[0.15, 0.00], [0.15, 0.35], [0.15, 0.65], [0.15, 1.00]],
    [[0.15, 1.00], [0.50, 1.00], [0.84, 1.00]],
  ],
  'M': [
    [[0.08, 0.00], [0.08, 0.50], [0.08, 1.00]],
    [[0.08, 0.00], [0.22, 0.20], [0.38, 0.42], [0.50, 0.54]],
    [[0.50, 0.54], [0.62, 0.42], [0.78, 0.20], [0.92, 0.00]],
    [[0.92, 0.00], [0.92, 0.50], [0.92, 1.00]],
  ],
  'N': [
    [[0.12, 0.00], [0.12, 0.35], [0.12, 0.65], [0.12, 1.00]],
    [[0.12, 0.00], [0.37, 0.33], [0.63, 0.67], [0.88, 1.00]],
    [[0.88, 0.00], [0.88, 0.35], [0.88, 0.65], [0.88, 1.00]],
  ],
  'O': [
    [[0.50, 0.01], [0.24, 0.06], [0.05, 0.26], [0.02, 0.50],
     [0.06, 0.74], [0.24, 0.94], [0.50, 0.99], [0.76, 0.94],
     [0.94, 0.74], [0.98, 0.50], [0.92, 0.26], [0.76, 0.06], [0.50, 0.01]],
  ],
  'P': [
    [[0.18, 0.00], [0.18, 1.00]],
    [[0.18, 0.00], [0.64, 0.06], [0.82, 0.20], [0.80, 0.40], [0.18, 0.50]],
  ],
  'Q': [
    [[0.50, 0.01], [0.24, 0.06], [0.05, 0.26], [0.02, 0.50],
     [0.06, 0.74], [0.24, 0.94], [0.50, 0.99], [0.76, 0.94],
     [0.94, 0.74], [0.98, 0.50], [0.92, 0.26], [0.76, 0.06], [0.50, 0.01]],
    [[0.62, 0.72], [0.88, 0.96]],
  ],
  'R': [
    [[0.18, 0.00], [0.18, 1.00]],
    [[0.18, 0.00], [0.64, 0.06], [0.82, 0.20], [0.80, 0.40], [0.18, 0.50]],
    [[0.45, 0.50], [0.88, 1.00]],
  ],
  'S': [
    [[0.82, 0.16], [0.62, 0.03], [0.38, 0.04], [0.18, 0.18],
     [0.16, 0.36], [0.32, 0.48], [0.58, 0.52], [0.78, 0.64],
     [0.80, 0.82], [0.62, 0.96], [0.38, 0.98], [0.18, 0.86]],
  ],
  'T': [
    [[0.10, 0.01], [0.50, 0.01], [0.90, 0.01]],
    [[0.50, 0.01], [0.50, 0.35], [0.50, 0.65], [0.50, 1.00]],
  ],
  'U': [
    [[0.12, 0.00], [0.12, 0.72], [0.22, 0.92], [0.42, 1.00],
     [0.58, 1.00], [0.78, 0.92], [0.88, 0.72], [0.88, 0.00]],
  ],
  'V': [
    [[0.08, 0.00], [0.22, 0.32], [0.36, 0.64], [0.50, 1.00]],
    [[0.92, 0.00], [0.78, 0.32], [0.64, 0.64], [0.50, 1.00]],
  ],
  'W': [
    [[0.05, 0.00], [0.12, 0.32], [0.19, 0.66], [0.26, 1.00]],
    [[0.26, 1.00], [0.33, 0.80], [0.42, 0.60], [0.50, 0.48]],
    [[0.50, 0.48], [0.58, 0.60], [0.67, 0.80], [0.74, 1.00]],
    [[0.74, 1.00], [0.81, 0.66], [0.88, 0.32], [0.95, 0.00]],
  ],
  'X': [
    [[0.08, 0.00], [0.34, 0.30], [0.64, 0.68], [0.92, 1.00]],
    [[0.92, 0.00], [0.66, 0.30], [0.36, 0.68], [0.08, 1.00]],
  ],
  'Y': [
    [[0.10, 0.00], [0.24, 0.18], [0.38, 0.36], [0.50, 0.50]],
    [[0.90, 0.00], [0.76, 0.18], [0.62, 0.36], [0.50, 0.50]],
    [[0.50, 0.50], [0.50, 0.75], [0.50, 1.00]],
  ],
  'Z': [
    [[0.10, 0.02], [0.50, 0.02], [0.90, 0.02]],
    [[0.90, 0.02], [0.60, 0.32], [0.40, 0.68], [0.10, 0.98]],
    [[0.10, 0.98], [0.50, 0.98], [0.90, 0.98]],
  ],

  // ── Lowercase ─────────────────────────────────────────────────────────────
  // y reference: x-height top ≈ 0.25, baseline ≈ 0.73, ascender = 0.00, descender = 1.00
  'a': [
    [[0.76, 0.48], [0.60, 0.25], [0.38, 0.24], [0.18, 0.38], [0.14, 0.54],
     [0.20, 0.68], [0.40, 0.76], [0.62, 0.73], [0.76, 0.60], [0.76, 0.73]],
  ],
  'b': [
    [[0.18, 0.00], [0.18, 0.73]],
    [[0.18, 0.38], [0.46, 0.24], [0.70, 0.36], [0.74, 0.52], [0.56, 0.72], [0.18, 0.73]],
  ],
  'c': [
    [[0.78, 0.38], [0.62, 0.24], [0.40, 0.24], [0.18, 0.38], [0.14, 0.54],
     [0.20, 0.68], [0.42, 0.76], [0.64, 0.74], [0.78, 0.62]],
  ],
  'd': [
    [[0.74, 0.48], [0.58, 0.24], [0.36, 0.24], [0.16, 0.38], [0.14, 0.54],
     [0.20, 0.68], [0.42, 0.76], [0.62, 0.73], [0.74, 0.60]],
    [[0.74, 0.24], [0.74, 0.00], [0.74, 0.73]],
  ],
  'e': [
    [[0.18, 0.52], [0.70, 0.52],
     [0.70, 0.36], [0.56, 0.24], [0.36, 0.24], [0.16, 0.40], [0.14, 0.56],
     [0.22, 0.70], [0.44, 0.76], [0.66, 0.72], [0.78, 0.60]],
  ],
  'f': [
    [[0.66, 0.16], [0.56, 0.04], [0.42, 0.00], [0.28, 0.08], [0.26, 0.22], [0.26, 0.73]],
    [[0.10, 0.36], [0.58, 0.36]],
  ],
  'g': [
    [[0.76, 0.48], [0.60, 0.24], [0.38, 0.24], [0.18, 0.38], [0.14, 0.54],
     [0.20, 0.68], [0.40, 0.76], [0.62, 0.73], [0.76, 0.60], [0.76, 0.73]],
    [[0.76, 0.73], [0.76, 0.94], [0.60, 1.02], [0.38, 1.00], [0.22, 0.88]],
  ],
  'h': [
    [[0.18, 0.00], [0.18, 0.73]],
    [[0.18, 0.36], [0.36, 0.24], [0.58, 0.24], [0.72, 0.36], [0.72, 0.73]],
  ],
  'i': [
    [[0.50, 0.25], [0.50, 0.73]],
    [[0.50, 0.10], [0.50, 0.14]],
  ],
  'j': [
    [[0.54, 0.25], [0.54, 0.90], [0.42, 1.00], [0.26, 0.96], [0.16, 0.84]],
    [[0.54, 0.10], [0.54, 0.14]],
  ],
  'k': [
    [[0.18, 0.00], [0.18, 0.24], [0.18, 0.49], [0.18, 0.73]],
    [[0.72, 0.24], [0.50, 0.35], [0.32, 0.45], [0.18, 0.52]],
    [[0.18, 0.52], [0.35, 0.59], [0.54, 0.66], [0.76, 0.73]],
  ],
  'l': [
    [[0.46, 0.00], [0.46, 0.24], [0.46, 0.49], [0.46, 0.73]],
  ],
  'm': [
    [[0.08, 0.25], [0.08, 0.73]],
    [[0.08, 0.30], [0.24, 0.24], [0.44, 0.24], [0.48, 0.36], [0.48, 0.73]],
    [[0.48, 0.30], [0.64, 0.24], [0.84, 0.24], [0.88, 0.36], [0.88, 0.73]],
  ],
  'n': [
    [[0.18, 0.25], [0.18, 0.73]],
    [[0.18, 0.30], [0.36, 0.24], [0.58, 0.24], [0.72, 0.36], [0.72, 0.73]],
  ],
  'o': [
    [[0.50, 0.24], [0.26, 0.28], [0.12, 0.44], [0.12, 0.60], [0.22, 0.72],
     [0.42, 0.78], [0.62, 0.76], [0.78, 0.62], [0.78, 0.46], [0.66, 0.30], [0.50, 0.24]],
  ],
  'p': [
    [[0.18, 0.25], [0.18, 1.00]],
    [[0.18, 0.30], [0.48, 0.24], [0.70, 0.36], [0.72, 0.52], [0.54, 0.72], [0.18, 0.73]],
  ],
  'q': [
    [[0.74, 0.48], [0.58, 0.24], [0.36, 0.24], [0.16, 0.38], [0.14, 0.54],
     [0.20, 0.68], [0.42, 0.76], [0.62, 0.73], [0.74, 0.60]],
    [[0.74, 0.24], [0.74, 1.00]],
  ],
  'r': [
    [[0.20, 0.25], [0.20, 0.73]],
    [[0.20, 0.36], [0.38, 0.24], [0.62, 0.24], [0.72, 0.34]],
  ],
  's': [
    [[0.74, 0.38], [0.58, 0.24], [0.36, 0.24], [0.18, 0.36], [0.20, 0.50],
     [0.42, 0.57], [0.62, 0.62], [0.74, 0.70], [0.58, 0.78], [0.36, 0.78], [0.20, 0.68]],
  ],
  't': [
    [[0.46, 0.08], [0.46, 0.30], [0.46, 0.52], [0.46, 0.73]],
    [[0.14, 0.36], [0.45, 0.36], [0.76, 0.36]],
  ],
  'u': [
    [[0.16, 0.25], [0.16, 0.60], [0.28, 0.74], [0.50, 0.78], [0.70, 0.72], [0.74, 0.48], [0.74, 0.25], [0.74, 0.45]],
  ],
  'v': [
    [[0.10, 0.25], [0.24, 0.40], [0.38, 0.56], [0.50, 0.73]],
    [[0.90, 0.25], [0.76, 0.40], [0.62, 0.56], [0.50, 0.73]],
  ],
  'w': [
    [[0.06, 0.25], [0.12, 0.40], [0.18, 0.57], [0.24, 0.73]],
    [[0.24, 0.73], [0.32, 0.60], [0.42, 0.48], [0.50, 0.40]],
    [[0.50, 0.40], [0.58, 0.48], [0.68, 0.60], [0.76, 0.73]],
    [[0.76, 0.73], [0.82, 0.57], [0.88, 0.40], [0.94, 0.25]],
  ],
  'x': [
    [[0.10, 0.25], [0.36, 0.39], [0.62, 0.57], [0.88, 0.73]],
    [[0.88, 0.25], [0.62, 0.39], [0.36, 0.57], [0.10, 0.73]],
  ],
  'y': [
    [[0.14, 0.25], [0.52, 0.60]],
    [[0.88, 0.25], [0.52, 0.60], [0.40, 0.82], [0.26, 0.96], [0.16, 0.90]],
  ],
  'z': [
    [[0.12, 0.25], [0.84, 0.25], [0.16, 0.73], [0.84, 0.73]],
  ],

  // ── Digits ────────────────────────────────────────────────────────────────
  '0': [
    [[0.50, 0.01], [0.26, 0.05], [0.06, 0.22], [0.02, 0.50],
     [0.06, 0.78], [0.26, 0.95], [0.50, 0.99], [0.74, 0.95],
     [0.94, 0.78], [0.98, 0.50], [0.94, 0.22], [0.74, 0.05], [0.50, 0.01]],
  ],
  '1': [
    [[0.36, 0.14], [0.44, 0.07], [0.52, 0.00]],
    [[0.52, 0.00], [0.52, 0.35], [0.52, 0.65], [0.52, 1.00]],
  ],
  '2': [
    [[0.18, 0.22], [0.28, 0.07], [0.50, 0.00], [0.72, 0.06], [0.82, 0.22],
     [0.78, 0.42], [0.55, 0.62], [0.15, 0.96], [0.15, 1.00], [0.85, 1.00]],
  ],
  '3': [
    [[0.18, 0.10], [0.38, 0.02], [0.62, 0.04], [0.80, 0.18],
     [0.78, 0.38], [0.56, 0.50],
     [0.78, 0.62], [0.82, 0.80], [0.62, 0.96], [0.38, 0.98], [0.18, 0.90]],
  ],
  '4': [
    [[0.68, 0.00], [0.45, 0.28], [0.26, 0.50], [0.10, 0.68]],
    [[0.10, 0.68], [0.50, 0.68], [0.90, 0.68]],
    [[0.68, 0.00], [0.68, 0.35], [0.68, 0.65], [0.68, 1.00]],
  ],
  '5': [
    [[0.78, 0.00], [0.18, 0.00]],
    [[0.18, 0.00], [0.18, 0.44]],
    [[0.18, 0.44], [0.62, 0.42], [0.82, 0.58], [0.80, 0.78],
     [0.60, 0.96], [0.36, 0.98], [0.16, 0.84]],
  ],
  '6': [
    [[0.76, 0.08], [0.52, 0.00], [0.28, 0.08], [0.12, 0.28],
     [0.08, 0.52], [0.10, 0.74], [0.24, 0.90], [0.46, 0.98],
     [0.65, 0.94], [0.78, 0.80], [0.80, 0.62], [0.65, 0.48],
     [0.42, 0.44], [0.22, 0.52]],
  ],
  '7': [
    [[0.12, 0.00], [0.50, 0.00], [0.88, 0.00]],
    [[0.88, 0.00], [0.70, 0.32], [0.52, 0.66], [0.35, 1.00]],
  ],
  '8': [
    [[0.50, 0.50], [0.72, 0.42], [0.82, 0.26], [0.76, 0.10], [0.58, 0.02],
     [0.38, 0.04], [0.22, 0.16], [0.20, 0.34], [0.32, 0.46], [0.50, 0.50],
     [0.72, 0.56], [0.84, 0.72], [0.80, 0.88], [0.62, 0.98],
     [0.40, 0.98], [0.22, 0.88], [0.18, 0.72], [0.28, 0.56], [0.50, 0.50]],
  ],
  '9': [
    [[0.50, 0.46], [0.70, 0.42], [0.82, 0.28], [0.78, 0.12], [0.62, 0.02],
     [0.42, 0.02], [0.26, 0.12], [0.20, 0.28], [0.24, 0.46],
     [0.38, 0.54], [0.56, 0.56], [0.76, 0.50], [0.84, 0.70], [0.76, 0.92], [0.58, 1.00]],
  ],

  // ── Punctuation ────────────────────────────────────────────────────────────
  '.': [[[0.50, 0.88], [0.50, 0.96]]],
  ',': [[[0.50, 0.86], [0.42, 1.05]]],
  '-': [[[0.15, 0.50], [0.85, 0.50]]],
  "'": [[[0.50, 0.00], [0.44, 0.22]]],
  '!': [
    [[0.50, 0.00], [0.50, 0.74]],
    [[0.50, 0.88], [0.50, 0.96]],
  ],
  '?': [
    [[0.20, 0.18], [0.30, 0.06], [0.52, 0.00], [0.72, 0.08],
     [0.78, 0.26], [0.72, 0.44], [0.56, 0.56], [0.52, 0.74]],
    [[0.50, 0.88], [0.50, 0.96]],
  ],
  ':': [
    [[0.50, 0.24], [0.50, 0.32]],
    [[0.50, 0.68], [0.50, 0.76]],
  ],
};

// ── Minimum-jerk trajectory ──────────────────────────────────────────────────
// Flash & Hogan (1985): humans minimize ∫‖d³x/dt³‖² dt over a movement.
// The optimal position interpolant is a 5th-degree polynomial with zero
// velocity and acceleration at both endpoints.

// Position interpolant: τ ∈ [0,1] → [0,1].  Used for endpoint ramps.
function minJerkPos(tau) {
  const t2 = tau * tau;
  const t3 = t2 * tau;
  return 10 * t3 - 15 * t3 * tau + 6 * t3 * t2;
}

// ── Natural cubic spline ────────────────────────────────────────────────────
// C² interpolation through (knots[i], values[i]) with natural BCs (S''=0 at ends).
// Supports non-uniform knot spacing (chord-length parameterization).

function naturalCubicSpline(knots, values) {
  const n = values.length - 1;

  if (n < 1) {
    const v = values[0] ?? 0;
    return { eval: () => v, deriv: () => 0, deriv2: () => 0 };
  }

  const h = new Float64Array(n);
  for (let i = 0; i < n; i++) h[i] = Math.max(1e-8, knots[i + 1] - knots[i]);

  if (n === 1) {
    const slope = (values[1] - values[0]) / h[0];
    const t0 = knots[0];
    return {
      eval:   (t) => values[0] + slope * (t - t0),
      deriv:  ()  => slope,
      deriv2: ()  => 0,
    };
  }

  // Tridiagonal system for second derivatives M[i] = S''(knots[i]).
  // M[0] = M[n] = 0.  Solve for M[1]...M[n-1] via Thomas algorithm.
  const m = n - 1;
  const diag  = new Float64Array(m);
  const upper = new Float64Array(m);
  const lower = new Float64Array(m);
  const rhs   = new Float64Array(m);

  for (let j = 0; j < m; j++) {
    const i = j + 1;
    diag[j] = 2 * (h[i - 1] + h[i]);
    rhs[j]  = 6 * ((values[i + 1] - values[i]) / h[i]
                  - (values[i] - values[i - 1]) / h[i - 1]);
    if (j < m - 1) upper[j] = h[i];
    if (j > 0)     lower[j] = h[i - 1];
  }

  for (let j = 1; j < m; j++) {
    const w = lower[j] / diag[j - 1];
    diag[j] -= w * upper[j - 1];
    rhs[j]  -= w * rhs[j - 1];
  }

  const sol = new Float64Array(m);
  sol[m - 1] = rhs[m - 1] / diag[m - 1];
  for (let j = m - 2; j >= 0; j--) {
    sol[j] = (rhs[j] - upper[j] * sol[j + 1]) / diag[j];
  }

  const M = new Float64Array(n + 1);
  for (let j = 0; j < m; j++) M[j + 1] = sol[j];

  // Segment coefficients: S_i(t) = a + b·δ + c·δ² + d·δ³,  δ = t − knots[i]
  const segs = new Array(n);
  for (let i = 0; i < n; i++) {
    segs[i] = {
      a: values[i],
      b: (values[i + 1] - values[i]) / h[i] - h[i] * (2 * M[i] + M[i + 1]) / 6,
      c: M[i] / 2,
      d: (M[i + 1] - M[i]) / (6 * h[i]),
      t0: knots[i],
    };
  }

  function findSeg(t) {
    if (t <= knots[0]) return { s: segs[0], dt: 0 };
    if (t >= knots[n]) return { s: segs[n - 1], dt: h[n - 1] };
    let lo = 0, hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (knots[mid] <= t) lo = mid; else hi = mid - 1;
    }
    return { s: segs[lo], dt: t - knots[lo] };
  }

  return {
    eval(t)   { const {s,dt}=findSeg(t); return s.a + s.b*dt + s.c*dt*dt + s.d*dt*dt*dt; },
    deriv(t)  { const {s,dt}=findSeg(t); return s.b + 2*s.c*dt + 3*s.d*dt*dt; },
    deriv2(t) { const {s,dt}=findSeg(t); return 2*s.c + 6*s.d*dt; },
  };
}

// ── Stroke trajectory planner ───────────────────────────────────────────────
// Builds a smooth spline through the stroke's waypoints, computes curvature at
// dense samples, applies the 2/3 power law (Lacquaniti et al. 1983) for speed,
// tapers with a minimum-jerk ramp at endpoints, and returns stamp-ready points.

function planStroke(waypoints, baseSpeed, stepSize) {
  if (waypoints.length < 2) return [];

  // Chord-length parameterization
  const chords = [0];
  for (let i = 1; i < waypoints.length; i++) {
    chords.push(chords[i - 1] + Math.hypot(
      waypoints[i][0] - waypoints[i - 1][0],
      waypoints[i][1] - waypoints[i - 1][1],
    ));
  }
  const totalChord = chords[chords.length - 1];
  if (totalChord < 0.5) return [];

  const spX = naturalCubicSpline(chords, waypoints.map(p => p[0]));
  const spY = naturalCubicSpline(chords, waypoints.map(p => p[1]));

  // Dense sampling for curvature + arc length
  const N = Math.max(40, Math.ceil(totalChord / (stepSize * 0.4)));
  const pts = new Array(N + 1);
  for (let i = 0; i <= N; i++) {
    const t   = (i / N) * totalChord;
    const x   = spX.eval(t),    y   = spY.eval(t);
    const dx  = spX.deriv(t),   dy  = spY.deriv(t);
    const ddx = spX.deriv2(t),  ddy = spY.deriv2(t);
    const sSq = dx * dx + dy * dy;
    const sMag = Math.sqrt(sSq);
    const kappa = sMag > 1e-6 ? Math.abs(dx * ddy - dy * ddx) / (sSq * sMag) : 0;
    pts[i] = { x, y, kappa, s: 0, v: 0 };
  }

  // True arc lengths
  for (let i = 1; i <= N; i++) {
    pts[i].s = pts[i - 1].s + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  const totalArc = pts[N].s;
  if (totalArc < 0.5) return [];

  // 2/3 power law: v ∝ κ^(−1/3).  MIN_K bounds the speed ratio on straight runs.
  const MIN_K = 0.002;
  let rawSum = 0;
  for (let i = 0; i <= N; i++) {
    pts[i].v = Math.pow(Math.max(MIN_K, pts[i].kappa), -1 / 3);
    rawSum += pts[i].v;
  }
  const vScale = baseSpeed / (rawSum / (N + 1));
  const vMin = baseSpeed * 0.08, vMax = baseSpeed * 3;
  for (let i = 0; i <= N; i++) {
    pts[i].v = Math.min(vMax, Math.max(vMin, pts[i].v * vScale));
  }

  // Minimum-jerk ramp at stroke endpoints (15% of arc each end)
  const rampLen = totalArc * 0.15;
  for (let i = 0; i <= N; i++) {
    let env = 1;
    if (pts[i].s < rampLen)              env = minJerkPos(pts[i].s / rampLen);
    else if (pts[i].s > totalArc - rampLen) env = minJerkPos((totalArc - pts[i].s) / rampLen);
    pts[i].v = Math.max(vMin, pts[i].v * env);
  }

  // Emit stamps at ~stepSize arc-length intervals
  const stamps = [];
  let nextS = 0;
  for (let i = 0; i <= N; i++) {
    if (pts[i].s >= nextS || i === 0) {
      const velNorm = Math.min(1, pts[i].v / (baseSpeed * 2));
      stamps.push({ x: pts[i].x, y: pts[i].y, pressure: 0.92 - 0.14 * velNorm, v: pts[i].v });
      nextS = pts[i].s + stepSize;
    }
  }
  // Ensure the final point is stamped
  const last = pts[N], tail = stamps[stamps.length - 1];
  if (tail && Math.hypot(last.x - tail.x, last.y - tail.y) > stepSize * 0.3) {
    const velNorm = Math.min(1, last.v / (baseSpeed * 2));
    stamps.push({ x: last.x, y: last.y, pressure: 0.92 - 0.14 * velNorm, v: last.v });
  }

  // Inter-stamp delays from average local speed
  if (stamps.length > 0) stamps[0].delayMs = 0;
  for (let i = 1; i < stamps.length; i++) {
    const dist = Math.hypot(stamps[i].x - stamps[i - 1].x, stamps[i].y - stamps[i - 1].y);
    const avgV = (stamps[i].v + stamps[i - 1].v) / 2;
    stamps[i].delayMs = avgV > 0.01 ? (dist / avgV) * 1000 : 0;
  }

  return stamps;
}

// ── Tremor ──────────────────────────────────────────────────────────────────
// Quasi-periodic displacement simulating physiological hand tremor (~8–12 Hz).
// Sum of incommensurate sinusoids stays band-limited around the fundamental
// while avoiding exact repetition — matching real tremor's spectral shape.
// Output range: approximately [−1, 1].

const TREMOR_HZ = 10;       // dominant frequency (physiological range: 8–12 Hz)
const TREMOR_SCALE = 0.35;  // amplitude as fraction of strokeRadius

// ── Nib geometry ────────────────────────────────────────────────────────────
// Models a quill/broad-nib pen held at a fixed angle. The slit (long axis of
// the contact ellipse) stays at NIB_ANGLE; pressure splays the tines, making
// the short axis wider (aspect → 1). Low pressure keeps tines together
// (aspect → NIB_ASPECT_MAX, thin hairlines perpendicular to the slit).
const NIB_ANGLE = (40 * Math.PI) / 180;  // 40° from horizontal
const NIB_ASPECT_MAX = 3.0;              // closed tines: 3:1 slit
const NIB_ASPECT_MIN = 1.4;              // full splay: nearly round

// ── Waypoint jitter ─────────────────────────────────────────────────────────
// Per-render random perturbation of interior waypoints so the same letter
// never looks identical twice.  Amplitude is a fraction of glyph height,
// keeping it proportional across font sizes.  Endpoints are pinned so
// strokes still begin/end at their intended positions.

const JITTER_SCALE = 0.025; // fraction of glyphH per axis

// ── Baseline wander ─────────────────────────────────────────────────────────
// Slow vertical drift across a line of text.  Incommensurate sinusoids give
// non-repeating wander.  Amplitude is a fraction of font size.

const WANDER_SCALE = 0.018; // fraction of font size

function baselineWander(charIndex, phase) {
  return Math.sin(charIndex * 0.31 + phase)       * 0.60
       + Math.sin(charIndex * 0.73 + phase * 1.4) * 0.30
       + Math.sin(charIndex * 1.87 + phase * 0.7) * 0.10;
}

function tremor1D(phase) {
  const w = 2 * Math.PI;
  return 0.60 * Math.sin(phase * w)
       + 0.25 * Math.sin(phase * w * 2.37)
       + 0.15 * Math.sin(phase * w * 4.91);
}

// ── Pixel-scan fallback ────────────────────────────────────────────────────────
// Renders the character to an offscreen canvas, finds the column-by-column
// centerline of ink pixels, and returns it as a single stroke path.
// This approximates the glyph shape for characters not in STROKE_TABLE.
function pixelScanFallback(char, charX, charY, charW, charH, size, font) {
  const scale = 3;
  const ow = Math.max(4, Math.ceil(charW * scale));
  const oh = Math.max(4, Math.ceil(charH * scale));
  const oc = document.createElement('canvas');
  oc.width = ow; oc.height = oh;
  const ctx = oc.getContext('2d');
  ctx.font = `${size * scale}px ${font}`;
  ctx.fillStyle = '#000';
  ctx.fillText(char, 0, size * scale * 0.82);

  const img = ctx.getImageData(0, 0, ow, oh).data;

  // Build column centerline: for each x column, find the vertical center of ink.
  const points = [];
  const colStep = Math.max(1, Math.round(scale * 1.2));
  for (let px = 0; px < ow; px += colStep) {
    let sumY = 0, count = 0;
    for (let py = 0; py < oh; py++) {
      if (img[(py * ow + px) * 4 + 3] > 48) { sumY += py; count++; }
    }
    if (count > 0) {
      points.push([
        charX + (px / ow) * charW,
        charY + (sumY / count / oh) * charH,
      ]);
    }
  }

  // Deduplicate consecutive duplicates and return as a single stroke.
  if (points.length < 2) return null;
  return [points];
}

// ── Animation engine ───────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Resolve strokes for one character, returning them in canvas CSS-pixel coords.
// Interior waypoints are jittered so each render is unique; endpoints are pinned
// so strokes still start/end at their intended positions.
function resolveStrokes(char, charX, charY, charW, charH, size, font, jitterScale) {
  const upper = char.toUpperCase();
  const table = STROKE_TABLE[char] ?? STROKE_TABLE[upper];
  if (table) {
    const jAmt = charH * jitterScale;
    return table.map(stroke => {
      // Map to pixel space, then apply tangent-biased jitter to interior points.
      const pts = stroke.map(([nx, ny]) => [charX + nx * charW, charY + ny * charH]);
      const last = pts.length - 1;
      return pts.map((pt, idx) => {
        if (idx === 0 || idx === last) return pt;
        // Tangent direction from neighbors
        const prev = pts[idx - 1], next = pts[idx + 1];
        let tx = next[0] - prev[0], ty = next[1] - prev[1];
        const tLen = Math.hypot(tx, ty);
        if (tLen < 0.001) {
          // Degenerate — fall back to isotropic
          return [pt[0] + (Math.random()*2-1)*jAmt, pt[1] + (Math.random()*2-1)*jAmt];
        }
        tx /= tLen; ty /= tLen;
        // Full jitter along tangent, 25% perpendicular — keeps straight strokes straight-ish
        const tJ = (Math.random() * 2 - 1) * jAmt;
        const pJ = (Math.random() * 2 - 1) * jAmt * 0.25;
        return [pt[0] + tx*tJ + (-ty)*pJ, pt[1] + ty*tJ + tx*pJ];
      });
    });
  }
  return pixelScanFallback(char, charX, charY, charW, charH, size, font) ?? [];
}


// Animate a text draw command onto an InteractivePaperCanvas ref.
// Returns a cancel() function; calling it stops the animation mid-flight.
//
// command shape:
//   { type: "text", content, region: {x,y,w,h}, size?, font?, color?, speed? }
//
// speed: pen speed in CSS pixels per second (default 480).
export async function animateText(canvasRef, command) {
  const {
    content,
    region,
    size    = 32,
    font    = 'Caveat',
    color     = null,
    speed     = 480,
    jitter    = JITTER_SCALE,
  } = command;

  // Wait until fonts are ready so measureText is accurate.
  await document.fonts.ready;

  let cancelled = false;
  const cancel = () => { cancelled = true; };

  // Set ink color upfront if provided (matches fillRect behavior).
  if (color && canvasRef.current) {
    canvasRef.current.setInkColor(color.r, color.g, color.b);
  }

  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d');
  mctx.font = `${size}px ${font}`;

  // Stroke radius: ~6.5% of font size gives good coverage without blobbing.
  const strokeRadius = Math.max(1.5, size * 0.065);
  // Step: slightly smaller than radius so stamps overlap for solid strokes.
  const step = strokeRadius * 0.6;
  // Pen-lift speed: how fast the pen travels through the air between strokes.
  // Faster than pen-down so lifts feel snappy but not instantaneous.
  const liftSpeed = speed * 2.2;

  (async () => {
    let cursorX = region.x;
    const glyphTop = region.y;
    const glyphH   = size * 1.12; // generous height to cover ascenders
    const wanderAmp   = size * WANDER_SCALE;
    const wanderPhase = Math.random() * 100; // unique per text block
    let charIdx = 0;

    for (const char of content) {
      if (cancelled) break;

      if (char === ' ' || char === '\u00a0') {
        cursorX += mctx.measureText('\u2002').width; // en-space approximation
        charIdx++;
        continue;
      }
      if (char === '\n') {
        // Simple newline: not implemented yet (would need multi-line layout).
        continue;
      }

      const charW  = mctx.measureText(char).width;
      const yOff   = baselineWander(charIdx, wanderPhase) * wanderAmp;
      const strokes = resolveStrokes(char, cursorX, glyphTop + yOff, charW, glyphH, size, font, jitter);

      for (let si = 0; si < strokes.length; si++) {
        if (cancelled) break;
        const stroke = strokes[si];
        if (stroke.length < 2) continue;

        // Plan smooth trajectory: cubic spline + 2/3 power law + min-jerk ramp.
        const stamps = planStroke(stroke, speed, step);
        const tremorAmp = strokeRadius * TREMOR_SCALE;
        const tremorOffset = Math.random() * 100; // desync strokes
        let cumTimeS = 0;

        for (let sti = 0; sti < stamps.length; sti++) {
          if (cancelled) break;
          const stamp = stamps[sti];
          cumTimeS += stamp.delayMs / 1000;

          // Perpendicular direction from neighboring stamps
          let tx, ty;
          if (sti < stamps.length - 1) {
            tx = stamps[sti + 1].x - stamp.x;
            ty = stamps[sti + 1].y - stamp.y;
          } else if (sti > 0) {
            tx = stamp.x - stamps[sti - 1].x;
            ty = stamp.y - stamps[sti - 1].y;
          } else { tx = 1; ty = 0; }
          const tLen = Math.hypot(tx, ty);
          if (tLen > 0.001) { tx /= tLen; ty /= tLen; }

          // Tremor: quasi-periodic perpendicular displacement at TREMOR_HZ
          const disp = tremor1D(cumTimeS * TREMOR_HZ + tremorOffset) * tremorAmp;
          const sx = stamp.x + (-ty) * disp;
          const sy = stamp.y + tx * disp;

          // Nib aspect: low pressure = tines closed (thin), high pressure = splayed (wide)
          const nibAspect = NIB_ASPECT_MAX - (NIB_ASPECT_MAX - NIB_ASPECT_MIN) * stamp.pressure;

          canvasRef.current?.stampAt(sx, sy, {
            radius: strokeRadius, pressure: stamp.pressure,
            nibAngle: NIB_ANGLE, nibAspect,
          });
          if (stamp.delayMs > 0.5) await sleep(stamp.delayMs);
        }

        // Pen-lift pause: time proportional to air-travel distance to the next
        // stroke's start point. No next stroke → brief settle pause only.
        if (!cancelled) {
          const nextStroke = strokes[si + 1];
          let liftMs = 30;
          if (nextStroke?.length) {
            const lastPt = stroke[stroke.length - 1];
            const [nx, ny] = nextStroke[0];
            const airDist = Math.hypot(nx - lastPt[0], ny - lastPt[1]);
            liftMs = Math.max(30, airDist / liftSpeed * 1000);
          }
          await sleep(liftMs);
        }
      }

      cursorX += charW;
      charIdx++;
    }
  })();

  return cancel;
}
