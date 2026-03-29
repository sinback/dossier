import React, { useEffect, useRef, useState, useCallback } from "react";

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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smoothStep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function generatePaperTexture({
  width,
  height,
  crumples,
  seedNoise,
}) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;

  const values = new Float32Array(width * height);

  const baseScale = 0.012;
  const ridgeScale = 0.03;
  const fineScale = 0.11;
  const clickRidgeScale = 0.09;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;

      const broad = seedNoise.fbm(x * baseScale, y * baseScale, 5, 0.52);
      const ridges = seedNoise.ridged(x * ridgeScale, y * ridgeScale, 5, 0.55);
      const fine = seedNoise.ridged(x * fineScale, y * fineScale, 3, 0.5);

      let localCrumple = 0;

      for (const c of crumples) {
        const dx = x - c.x;
        const dy = y - c.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < c.radius) {
          const falloff = 1 - smoothStep(0, c.radius, dist);

          const directional =
            seedNoise.ridged(
              (x + c.offsetX) * clickRidgeScale,
              (y + c.offsetY) * clickRidgeScale,
              4,
              0.58
            ) * 2 - 1;

          localCrumple += directional * falloff * c.strength;
        }
      }

      values[i] = 0.34 * broad + 0.85 * ridges + 0.16 * fine + localCrumple;
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;

      const left = values[y * width + Math.max(0, x - 1)];
      const right = values[y * width + Math.min(width - 1, x + 1)];
      const up = values[Math.max(0, y - 1) * width + x];
      const down = values[Math.min(height - 1, y + 1) * width + x];

      const dx = right - left;
      const dy = down - up;

      const light = -dx * 0.85 - dy * 0.65;
      const grain = (Math.random() - 0.5) * 8;

      const base = 232 + values[i] * 16 + light * 58 + grain;

      const di = i * 4;
      data[di] = clamp(base + 4, 214, 255);
      data[di + 1] = clamp(base + 2, 212, 252);
      data[di + 2] = clamp(base - 3, 205, 245);
      data[di + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

export default function CrumpledPaperBackground({
  width = 900,
  height = 500,
  style = {},
  className = "",
  children,
}) {
  const noiseRef = useRef(null);
  const containerRef = useRef(null);
  const [backgroundImage, setBackgroundImage] = useState("");
  const [crumples, setCrumples] = useState([]);

  if (!noiseRef.current) {
    noiseRef.current = new PerlinNoise();
  }

  const regenerate = useCallback(() => {
    const dataUrl = generatePaperTexture({
      width,
      height,
      crumples,
      seedNoise: noiseRef.current,
    });
    setBackgroundImage(`url(${dataUrl})`);
  }, [width, height, crumples]);

  useEffect(() => {
    regenerate();
  }, [regenerate]);

  const handleClick = useCallback(
    (event) => {
      const rect = containerRef.current.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * width;
      const y = ((event.clientY - rect.top) / rect.height) * height;

      const newCrumple = {
        x,
        y,
        radius: 90 + Math.random() * 50,
        strength: 0.18 + Math.random() * 0.08,
        offsetX: Math.random() * 1000,
        offsetY: Math.random() * 1000,
      };

      setCrumples((prev) => [...prev.slice(-7), newCrumple]);
    },
    [width, height]
  );

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      className={className}
      style={{
        width,
        height,
        backgroundImage,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        borderRadius: 16,
        boxShadow:
          "0 10px 30px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.6)",
        color: "#2f2a24",
        position: "relative",
        overflow: "hidden",
        cursor: "pointer",
        userSelect: "none",
        ...style,
      }}
    >
      {children ? (
        <div
          style={{
            position: "relative",
            zIndex: 1,
            width: "100%",
            height: "100%",
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}