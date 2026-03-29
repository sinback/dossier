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
    [[0.50, 0.00], [0.08, 1.00]],
    [[0.50, 0.00], [0.92, 1.00]],
    [[0.22, 0.57], [0.78, 0.57]],
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
    [[0.18, 0.00], [0.18, 1.00]],
    [[0.18, 0.00], [0.84, 0.00]],
    [[0.18, 0.50], [0.70, 0.50]],
    [[0.18, 1.00], [0.84, 1.00]],
  ],
  'F': [
    [[0.18, 0.00], [0.18, 1.00]],
    [[0.18, 0.00], [0.84, 0.00]],
    [[0.18, 0.50], [0.72, 0.50]],
  ],
  'G': [
    [[0.84, 0.20], [0.66, 0.04], [0.40, 0.01], [0.14, 0.18],
     [0.03, 0.44], [0.05, 0.70], [0.20, 0.90], [0.44, 0.99], [0.68, 0.96],
     [0.84, 0.80], [0.84, 0.52], [0.54, 0.52]],
  ],
  'H': [
    [[0.15, 0.00], [0.15, 1.00]],
    [[0.85, 0.00], [0.85, 1.00]],
    [[0.15, 0.50], [0.85, 0.50]],
  ],
  'I': [
    [[0.50, 0.00], [0.50, 1.00]],
  ],
  'J': [
    [[0.65, 0.00], [0.65, 0.80], [0.54, 0.96], [0.34, 1.00], [0.18, 0.88]],
  ],
  'K': [
    [[0.15, 0.00], [0.15, 1.00]],
    [[0.80, 0.00], [0.15, 0.50]],
    [[0.15, 0.50], [0.84, 1.00]],
  ],
  'L': [
    [[0.15, 0.00], [0.15, 1.00]],
    [[0.15, 1.00], [0.84, 1.00]],
  ],
  'M': [
    [[0.08, 0.00], [0.08, 1.00]],
    [[0.08, 0.00], [0.50, 0.54]],
    [[0.50, 0.54], [0.92, 0.00]],
    [[0.92, 0.00], [0.92, 1.00]],
  ],
  'N': [
    [[0.12, 0.00], [0.12, 1.00]],
    [[0.12, 0.00], [0.88, 1.00]],
    [[0.88, 0.00], [0.88, 1.00]],
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
    [[0.10, 0.01], [0.90, 0.01]],
    [[0.50, 0.01], [0.50, 1.00]],
  ],
  'U': [
    [[0.12, 0.00], [0.12, 0.72], [0.22, 0.92], [0.42, 1.00],
     [0.58, 1.00], [0.78, 0.92], [0.88, 0.72], [0.88, 0.00]],
  ],
  'V': [
    [[0.08, 0.00], [0.50, 1.00]],
    [[0.92, 0.00], [0.50, 1.00]],
  ],
  'W': [
    [[0.05, 0.00], [0.26, 1.00]],
    [[0.26, 1.00], [0.50, 0.48]],
    [[0.50, 0.48], [0.74, 1.00]],
    [[0.74, 1.00], [0.95, 0.00]],
  ],
  'X': [
    [[0.08, 0.00], [0.92, 1.00]],
    [[0.92, 0.00], [0.08, 1.00]],
  ],
  'Y': [
    [[0.10, 0.00], [0.50, 0.50]],
    [[0.90, 0.00], [0.50, 0.50]],
    [[0.50, 0.50], [0.50, 1.00]],
  ],
  'Z': [
    [[0.10, 0.02], [0.90, 0.02]],
    [[0.90, 0.02], [0.10, 0.98]],
    [[0.10, 0.98], [0.90, 0.98]],
  ],

  // ── Digits ────────────────────────────────────────────────────────────────
  '0': [
    [[0.50, 0.01], [0.26, 0.05], [0.06, 0.22], [0.02, 0.50],
     [0.06, 0.78], [0.26, 0.95], [0.50, 0.99], [0.74, 0.95],
     [0.94, 0.78], [0.98, 0.50], [0.94, 0.22], [0.74, 0.05], [0.50, 0.01]],
  ],
  '1': [
    [[0.36, 0.14], [0.52, 0.00]],
    [[0.52, 0.00], [0.52, 1.00]],
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
    [[0.68, 0.00], [0.10, 0.68]],
    [[0.10, 0.68], [0.90, 0.68]],
    [[0.68, 0.00], [0.68, 1.00]],
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
    [[0.12, 0.00], [0.88, 0.00]],
    [[0.88, 0.00], [0.35, 1.00]],
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
function resolveStrokes(char, charX, charY, charW, charH, size, font) {
  const upper = char.toUpperCase();
  // Exact match first, then uppercase fallback (handles lowercase passably).
  const table = STROKE_TABLE[char] ?? STROKE_TABLE[upper];
  if (table) {
    return table.map(stroke =>
      stroke.map(([nx, ny]) => [charX + nx * charW, charY + ny * charH])
    );
  }
  return pixelScanFallback(char, charX, charY, charW, charH, size, font) ?? [];
}

// Animate a text draw command onto an InteractivePaperCanvas ref.
// Returns a cancel() function; calling it stops the animation mid-flight.
//
// command shape:
//   { type: "text", content, region: {x,y,w,h}, size?, font?, color?, speed? }
//
// speed: pen speed in CSS pixels per second (default 280).
export async function animateText(canvasRef, command) {
  const {
    content,
    region,
    size    = 32,
    font    = 'Caveat',
    color   = null,
    speed   = 280,
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

  (async () => {
    let cursorX = region.x;
    const glyphTop = region.y;
    const glyphH   = size * 1.12; // generous height to cover ascenders

    for (const char of content) {
      if (cancelled) break;

      if (char === ' ' || char === '\u00a0') {
        cursorX += mctx.measureText('\u2002').width; // en-space approximation
        continue;
      }
      if (char === '\n') {
        // Simple newline: not implemented yet (would need multi-line layout).
        continue;
      }

      const charW  = mctx.measureText(char).width;
      const strokes = resolveStrokes(char, cursorX, glyphTop, charW, glyphH, size, font);

      for (const stroke of strokes) {
        if (cancelled) break;
        if (stroke.length < 2) continue;

        // Walk each segment, depositing ink stamps at `step`-pixel intervals.
        for (let i = 0; i < stroke.length - 1; i++) {
          if (cancelled) break;
          const [x0, y0] = stroke[i];
          const [x1, y1] = stroke[i + 1];
          const segDist  = Math.hypot(x1 - x0, y1 - y0);
          if (segDist < 0.1) continue;

          const steps = Math.max(1, Math.ceil(segDist / step));
          const delayMs = (segDist / steps) / speed * 1000;

          for (let s = 0; s <= steps; s++) {
            if (cancelled) break;
            const t  = s / steps;
            const sx = x0 + (x1 - x0) * t;
            const sy = y0 + (y1 - y0) * t;
            canvasRef.current?.stampAt(sx, sy, { radius: strokeRadius, pressure: 0.82 });
            if (delayMs > 0.5) await sleep(delayMs);
          }
        }

        // Brief pen-lift between strokes (feels like lifting and repositioning).
        if (!cancelled) await sleep(38);
      }

      // Brief pause between characters.
      if (!cancelled) await sleep(18);

      cursorX += charW;
    }
  })();

  return cancel;
}
