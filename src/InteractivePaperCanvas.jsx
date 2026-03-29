import React, { useEffect, useMemo, useRef } from "react";

class PerlinNoise {
  constructor() {
    this.permutation = [
      151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225,
      140, 36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148,
      247, 120, 234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32,
      57, 177, 33, 88, 237, 149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175,
      74, 165, 71, 134, 139, 48, 27, 166, 77, 146, 158, 231, 83, 111, 229, 122,
      60, 211, 133, 230, 220, 105, 92, 41, 55, 46, 245, 40, 244, 102, 143, 54,
      65, 25, 63, 161, 1, 216, 80, 73, 209, 76, 132, 187, 208, 89, 18, 169,
      200, 196, 135, 130, 116, 188, 159, 86, 164, 100, 109, 198, 173, 186, 3, 64,
      52, 217, 226, 250, 124, 123, 5, 202, 38, 147, 118, 126, 255, 82, 85, 212,
      207, 206, 59, 227, 47, 16, 58, 17, 182, 189, 28, 42, 223, 183, 170, 213,
      119, 248, 152, 2, 44, 154, 163, 70, 221, 153, 101, 155, 167, 43, 172, 9,
      129, 22, 39, 253, 19, 98, 108, 110, 79, 113, 224, 232, 178, 185, 112, 104,
      218, 246, 97, 228, 251, 34, 242, 193, 238, 210, 144, 12, 191, 179, 162, 241,
      81, 51, 145, 235, 249, 14, 239, 107, 49, 192, 214, 31, 181, 199, 106, 157,
      184, 84, 204, 176, 115, 121, 50, 45, 127, 4, 150, 254, 138, 236, 205, 93,
      222, 114, 67, 29, 24, 72, 243, 141, 128, 195, 78, 66, 215, 61, 156, 180,
    ];

    this.p = new Array(512);
    for (let i = 0; i < 512; i++) {
      this.p[i] = this.permutation[i % 256];
    }
  }

  fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  lerp(t, a, b) {
    return a + t * (b - a);
  }

  grad(hash, x, y) {
    const h = hash & 7;
    const u = h < 4 ? x : y;
    const v = h < 4 ? y : x;
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
  }

  noise(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;

    x -= Math.floor(x);
    y -= Math.floor(y);

    const u = this.fade(x);
    const v = this.fade(y);

    const aa = this.p[this.p[X] + Y];
    const ab = this.p[this.p[X] + Y + 1];
    const ba = this.p[this.p[X + 1] + Y];
    const bb = this.p[this.p[X + 1] + Y + 1];

    return this.lerp(
      v,
      this.lerp(u, this.grad(aa, x, y), this.grad(ba, x - 1, y)),
      this.lerp(u, this.grad(ab, x, y - 1), this.grad(bb, x - 1, y - 1))
    );
  }

  fbm(x, y, octaves = 5, persistence = 0.5) {
    let total = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      total += this.noise(x * frequency, y * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= 2;
    }

    return total / maxValue;
  }

  ridged(x, y, octaves = 5, persistence = 0.5) {
    let total = 0;
    let amplitude = 0.5;
    let frequency = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      let n = this.noise(x * frequency, y * frequency);
      n = 1 - Math.abs(n);
      n *= n;
      total += n * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= 2;
    }

    return total / maxValue;
  }
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export default function InteractivePaperCanvas({
  width = 900,
  height = 600,
  inkColor = { r: 40, g: 50, b: 70 },
  style = {},
  className = "",
}) {
  const paperCanvasRef = useRef(null);
  const inkCanvasRef = useRef(null);
  const containerRef = useRef(null);

  const noise = useMemo(() => new PerlinNoise(), []);

  const stateRef = useRef({
    isPointerDown: false,
    lastPoint: null,
    heightField: null,
    wetness: null,
    ink: null,
    animationFrame: null,
    dpr: 1,
  });

  useEffect(() => {
    const paperCanvas = paperCanvasRef.current;
    const inkCanvas = inkCanvasRef.current;
    if (!paperCanvas || !inkCanvas) return;

    const state = stateRef.current;
    const dpr = window.devicePixelRatio || 1;
    state.dpr = dpr;

    paperCanvas.width = Math.floor(width * dpr);
    paperCanvas.height = Math.floor(height * dpr);
    inkCanvas.width = Math.floor(width * dpr);
    inkCanvas.height = Math.floor(height * dpr);

    paperCanvas.style.width = `${width}px`;
    paperCanvas.style.height = `${height}px`;
    inkCanvas.style.width = `${width}px`;
    inkCanvas.style.height = `${height}px`;

    const W = paperCanvas.width;
    const H = paperCanvas.height;

    state.heightField = new Float32Array(W * H);
    state.wetness = new Float32Array(W * H);
    state.ink = new Float32Array(W * H);

    generatePaperTexture(W, H, state.heightField, noise);
    renderPaper(paperCanvas, W, H, state.heightField);
    renderInk(inkCanvas, W, H, state.ink, state.heightField, inkColor);

    const tick = () => {
      simulateInk(W, H, state.ink, state.wetness, state.heightField);
      renderInk(inkCanvas, W, H, state.ink, state.heightField, inkColor);
      state.animationFrame = requestAnimationFrame(tick);
    };

    state.animationFrame = requestAnimationFrame(tick);

    return () => {
      if (state.animationFrame) cancelAnimationFrame(state.animationFrame);
    };
  }, [width, height, inkColor, noise]);

  const addCrumpleAndInk = (xCss, yCss, pressure = 1) => {
    const state = stateRef.current;
    const W = Math.floor(width * state.dpr);
    const H = Math.floor(height * state.dpr);
    const x = Math.floor(xCss * state.dpr);
    const y = Math.floor(yCss * state.dpr);

    applyLocalCrumple(W, H, state.heightField, noise, x, y, 45 * state.dpr, 0.18 * pressure);
    stampInk(
      W,
      H,
      state.ink,
      state.wetness,
      state.heightField,
      x,
      y,
      10 * state.dpr * lerp(0.8, 1.3, pressure),
      0.85 * pressure
    );

    renderPaper(paperCanvasRef.current, W, H, state.heightField);
  };

  const getPoint = (event) => {
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const handlePointerDown = (event) => {
    event.preventDefault();
    const point = getPoint(event);
    stateRef.current.isPointerDown = true;
    stateRef.current.lastPoint = point;
    addCrumpleAndInk(point.x, point.y, 1);
  };

  const handlePointerMove = (event) => {
    if (!stateRef.current.isPointerDown) return;
    const point = getPoint(event);
    const last = stateRef.current.lastPoint || point;

    const dx = point.x - last.x;
    const dy = point.y - last.y;
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(dist / 4));

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = lerp(last.x, point.x, t);
      const y = lerp(last.y, point.y, t);
      addCrumpleAndInk(x, y, 0.7);
    }

    stateRef.current.lastPoint = point;
  };

  const stopPointer = () => {
    stateRef.current.isPointerDown = false;
    stateRef.current.lastPoint = null;
  };

  return (
    <div
      ref={containerRef}
      className={className}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopPointer}
      onPointerLeave={stopPointer}
      onPointerCancel={stopPointer}
      style={{
        position: "relative",
        width,
        height,
        borderRadius: 16,
        overflow: "hidden",
        cursor: "crosshair",
        boxShadow:
          "0 12px 30px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.65)",
        touchAction: "none",
        background: "#e8e2d5",
        ...style,
      }}
    >
      <canvas
        ref={paperCanvasRef}
        style={{ position: "absolute", inset: 0, display: "block" }}
      />
      <canvas
        ref={inkCanvasRef}
        style={{ position: "absolute", inset: 0, display: "block" }}
      />
    </div>
  );
}

function generatePaperTexture(W, H, heightField, noise) {
  const baseScale = 0.008;
  const ridgeScale = 0.018;
  const fineScale = 0.06;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;

      const broad = noise.fbm(x * baseScale, y * baseScale, 5, 0.52);
      const ridges = noise.ridged(x * ridgeScale, y * ridgeScale, 5, 0.56);
      const fine = noise.ridged(x * fineScale, y * fineScale, 3, 0.52);

      let h = 0.28 * broad + 0.92 * ridges + 0.14 * fine;

      // subtle sheet warp so it doesn't feel uniformly procedural
      const cx = (x / W) * 2 - 1;
      const cy = (y / H) * 2 - 1;
      h += 0.03 * (1 - Math.sqrt(cx * cx + cy * cy));

      heightField[i] = h;
    }
  }
}

function applyLocalCrumple(W, H, heightField, noise, cx, cy, radius, strength) {
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(W - 1, Math.ceil(cx + radius));
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(H - 1, Math.ceil(cy + radius));

  const localScale = 0.09;
  const swirlScale = 0.035;
  const seedX = Math.random() * 1000;
  const seedY = Math.random() * 1000;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > radius) continue;

      const falloff = 1 - smoothstep(0, radius, dist);

      const wrinkle =
        noise.ridged((x + seedX) * localScale, (y + seedY) * localScale, 4, 0.58) * 2 - 1;

      const swirl =
        noise.fbm((x - seedX) * swirlScale, (y - seedY) * swirlScale, 3, 0.6) * 2 - 1;

      const creaseBias = (1 - dist / radius) * (1 - dist / radius);

      heightField[y * W + x] += (wrinkle * 0.09 + swirl * 0.03 + creaseBias * 0.06) * strength;
    }
  }
}

function stampInk(W, H, ink, wetness, heightField, cx, cy, radius, amount) {
  const minX = Math.max(0, Math.floor(cx - radius * 2));
  const maxX = Math.min(W - 1, Math.ceil(cx + radius * 2));
  const minY = Math.max(0, Math.floor(cy - radius * 2));
  const maxY = Math.min(H - 1, Math.ceil(cy + radius * 2));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.hypot(dx, dy);

      if (d > radius * 1.8) continue;

      const radial = Math.exp(-(d * d) / (2 * radius * radius * 0.45));
      const edgeBreakup = 0.85 + 0.35 * Math.sin(x * 0.22 + y * 0.17 + heightField[y * W + x] * 8);
      const deposit = radial * edgeBreakup * amount;

      const i = y * W + x;
      ink[i] = clamp(ink[i] + deposit * 0.35, 0, 1.6);
      wetness[i] = clamp(wetness[i] + deposit * 0.9, 0, 2);
    }
  }
}

function simulateInk(W, H, ink, wetness, heightField) {
  const inkNext = new Float32Array(ink.length);
  const wetNext = new Float32Array(wetness.length);

  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;

      let retainedInk = ink[i] * 0.90;
      let retainedWet = wetness[i] * 0.92;

      const neighbors = [
        i - 1,
        i + 1,
        i - W,
        i + W,
      ];

      for (const n of neighbors) {
        const slope = heightField[n] - heightField[i];
        const flowBias = clamp(0.25 + slope * 2.5, 0, 0.75);

        const spread =
          ink[i] *
          wetness[i] *
          0.028 *
          flowBias;

        retainedInk -= spread;
        inkNext[n] += spread;

        const waterSpread = wetness[i] * 0.018 * clamp(0.4 + slope * 1.6, 0.05, 0.5);
        retainedWet -= waterSpread;
        wetNext[n] += waterSpread;
      }

      // slight capillary spread even uphill
      const capillary = ink[i] * wetness[i] * 0.01;
      inkNext[i - 1] += capillary * 0.25;
      inkNext[i + 1] += capillary * 0.25;
      inkNext[i - W] += capillary * 0.25;
      inkNext[i + W] += capillary * 0.25;
      retainedInk -= capillary;

      // absorb into paper
      const absorb = Math.min(retainedInk, 0.003 + (1 - Math.min(1, wetness[i])) * 0.004);
      retainedInk -= absorb;

      inkNext[i] += Math.max(0, retainedInk);
      wetNext[i] += Math.max(0, retainedWet);
    }
  }

  for (let i = 0; i < ink.length; i++) {
    ink[i] = inkNext[i];
    wetness[i] = wetNext[i];
  }
}

function renderPaper(canvas, W, H, heightField) {
  const ctx = canvas.getContext("2d");
  const imageData = ctx.createImageData(W, H);
  const data = imageData.data;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;

      const left = heightField[y * W + Math.max(0, x - 1)];
      const right = heightField[y * W + Math.min(W - 1, x + 1)];
      const up = heightField[Math.max(0, y - 1) * W + x];
      const down = heightField[Math.min(H - 1, y + 1) * W + x];

      const dx = right - left;
      const dy = down - up;
      const light = -dx * 0.8 - dy * 0.65;

      const grain = ((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1) * 2 - 1;
      const base = 229 + heightField[i] * 16 + light * 58 + grain * 5;

      const di = i * 4;
      data[di] = clamp(base + 6, 210, 255);
      data[di + 1] = clamp(base + 3, 208, 252);
      data[di + 2] = clamp(base - 2, 200, 245);
      data[di + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

function renderInk(canvas, W, H, ink, heightField, inkColor) {
  const ctx = canvas.getContext("2d");
  const imageData = ctx.createImageData(W, H);
  const data = imageData.data;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const a = clamp(ink[i], 0, 1);

      const left = heightField[y * W + Math.max(0, x - 1)];
      const right = heightField[y * W + Math.min(W - 1, x + 1)];
      const up = heightField[Math.max(0, y - 1) * W + x];
      const down = heightField[Math.min(H - 1, y + 1) * W + x];

      const dx = right - left;
      const dy = down - up;
      const paperLight = clamp(0.92 + (-dx * 0.06 - dy * 0.05), 0.82, 1.08);

      const feather = clamp(a * 0.75 + Math.pow(a, 2) * 0.3, 0, 1);
      const r = clamp(inkColor.r * paperLight, 0, 255);
      const g = clamp(inkColor.g * paperLight, 0, 255);
      const b = clamp(inkColor.b * paperLight, 0, 255);

      const di = i * 4;
      data[di] = r;
      data[di + 1] = g;
      data[di + 2] = b;
      data[di + 3] = Math.floor(feather * 255);
    }
  }

  ctx.putImageData(imageData, 0, 0);
}