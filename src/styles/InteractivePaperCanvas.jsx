import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";

// ── Perlin noise ──────────────────────────────────────────────────────────────
class PerlinNoise {
  constructor() {
    this.permutation = [
      151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,
      140,36,103,30,69,142,8,99,37,240,21,10,23,190,6,148,
      247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,
      57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,
      74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,
      60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,
      65,25,63,161,1,216,80,73,209,76,132,187,208,89,18,169,
      200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,
      52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,
      207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,
      119,248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,
      129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,
      218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,
      81,51,145,235,249,14,239,107,49,192,214,31,181,199,106,157,
      184,84,204,176,115,121,50,45,127,4,150,254,138,236,205,93,
      222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180,
    ];
    this.p = new Array(512);
    for (let i = 0; i < 512; i++) this.p[i] = this.permutation[i % 256];
  }
  fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  lerp(t, a, b) { return a + t * (b - a); }
  grad(hash, x, y) {
    const h = hash & 7, u = h < 4 ? x : y, v = h < 4 ? y : x;
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
  }
  noise(x, y) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = this.fade(x), v = this.fade(y);
    const aa = this.p[this.p[X] + Y], ab = this.p[this.p[X] + Y + 1];
    const ba = this.p[this.p[X+1] + Y], bb = this.p[this.p[X+1] + Y + 1];
    return this.lerp(v,
      this.lerp(u, this.grad(aa,x,y),   this.grad(ba,x-1,y)),
      this.lerp(u, this.grad(ab,x,y-1), this.grad(bb,x-1,y-1)));
  }
  fbm(x, y, octaves = 5, persistence = 0.5) {
    let total = 0, amp = 1, freq = 1, max = 0;
    for (let i = 0; i < octaves; i++) {
      total += this.noise(x * freq, y * freq) * amp;
      max += amp; amp *= persistence; freq *= 2;
    }
    return total / max;
  }
  ridged(x, y, octaves = 5, persistence = 0.5) {
    let total = 0, amp = 0.5, freq = 1, max = 0;
    for (let i = 0; i < octaves; i++) {
      let n = this.noise(x * freq, y * freq);
      n = 1 - Math.abs(n); n *= n;
      total += n * amp; max += amp; amp *= persistence; freq *= 2;
    }
    return total / max;
  }
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

// ── GLSL sources ──────────────────────────────────────────────────────────────

// Shared vertex shader: maps clip-space quad (-1,-1)→(1,1) to UV (0,0)→(1,1)
const VERT = `#version 300 es
layout(location = 0) in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Simulation pass: reads current ink/wetness, writes next frame's values.
// This is a gather kernel — each pixel pulls from its 4 neighbors rather than
// pushing to them (GPU can only write to its own output texel).
const SIM_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec2 fragColor; // R=ink, G=wetness
uniform sampler2D u_inkWet;
uniform sampler2D u_height;
uniform vec2 u_texelSize; // 1/W, 1/H

const float DRY = 0.015; // wetness below this = ink has settled permanently

void main() {
  float h   = texture(u_height, v_uv).r;
  vec2  s   = texture(u_inkWet, v_uv).rg;
  float ink = s.r;
  float wet = s.g;

  // Dry pixel: ink is frozen, no more decay or spreading.
  if (wet < DRY) {
    fragColor = vec2(ink, 0.0);
    return;
  }

  // Ink retention increases as the pixel dries: fully wet = 1% loss/frame,
  // nearly dry = ~0% loss. This ensures most ink survives to be frozen at DRY.
  // (The original flat 0.90 factor killed ~99% of ink before it ever dried out.)
  float retention = 1.0 - 0.01 * min(1.0, wet);
  float retInk = ink * retention;
  float retWet = wet * 0.92;
  float inkIn  = 0.0;
  float wetIn  = 0.0;

  vec2 offs[4];
  offs[0] = vec2(-u_texelSize.x,  0.0);
  offs[1] = vec2( u_texelSize.x,  0.0);
  offs[2] = vec2( 0.0, -u_texelSize.y);
  offs[3] = vec2( 0.0,  u_texelSize.y);

  for (int k = 0; k < 4; k++) {
    vec2  ns   = texture(u_inkWet, v_uv + offs[k]).rg;
    float nH   = texture(u_height, v_uv + offs[k]).r;
    float nInk = ns.r;
    float nWet = ns.g;

    float slopeIn = h - nH;
    float biasIn  = clamp(0.25 + slopeIn * 1.2, 0.0, 0.75);
    inkIn += nInk * nWet * 0.028 * biasIn;
    inkIn += nInk * nWet * 0.01 * 0.25;
    wetIn += nWet * 0.018 * clamp(0.4 + slopeIn * 1.6, 0.05, 0.5);

    float slopeOut = nH - h;
    float biasOut  = clamp(0.25 + slopeOut * 1.2, 0.0, 0.75);
    retInk -= ink * wet * 0.028 * biasOut;
    retWet -= wet * 0.018 * clamp(0.4 + slopeOut * 1.6, 0.05, 0.5);
  }

  retInk -= ink * wet * 0.01; // capillary outflow

  fragColor = vec2(max(0.0, retInk) + inkIn, max(0.0, retWet) + wetIn);
}`;

// Render pass: composites paper lighting + ink onto the screen.
const RENDER_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_inkWet;
uniform sampler2D u_height;
uniform vec2 u_texelSize;
uniform vec3 u_inkColor; // 0–1 normalized

void main() {
  float h   = texture(u_height, v_uv).r;
  float ink = texture(u_inkWet, v_uv).r;

  float left  = texture(u_height, v_uv + vec2(-u_texelSize.x,  0.0)).r;
  float right = texture(u_height, v_uv + vec2( u_texelSize.x,  0.0)).r;
  float up    = texture(u_height, v_uv + vec2( 0.0, -u_texelSize.y)).r;
  float down  = texture(u_height, v_uv + vec2( 0.0,  u_texelSize.y)).r;

  float dx = right - left;
  float dy = down  - up;
  float light = -dx * 0.8 - dy * 0.65;

  // Deterministic grain: same formula as the original CPU renderPaper
  vec2  px    = floor(v_uv / u_texelSize);
  float grain = fract(sin(px.x * 12.9898 + px.y * 78.233) * 43758.5453) * 2.0 - 1.0;

  float base = (229.0 + h * 16.0 + light * 100.0 + grain * 5.0) / 255.0;
  vec3 paper = vec3(
    clamp(base + 6.0/255.0,  210.0/255.0, 1.0),
    clamp(base + 3.0/255.0,  208.0/255.0, 252.0/255.0),
    clamp(base - 2.0/255.0,  200.0/255.0, 245.0/255.0)
  );

  float a       = clamp(ink, 0.0, 1.0);
  float feather = clamp(a * 0.75 + a * a * 0.3, 0.0, 1.0);
  float pl      = clamp(0.92 + (-dx * 0.06 - dy * 0.05), 0.82, 1.08);
  vec3  inkRGB  = clamp(u_inkColor * pl, 0.0, 1.0);

  fragColor = vec4(mix(paper, inkRGB, feather), 1.0);
}`;

// Stamp pass: reads current ink/wetness, adds a Gaussian ink blob, writes to
// the next ping-pong buffer. Runs once per pointer sub-step, not every frame.
const STAMP_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec2 fragColor;
uniform sampler2D u_inkWet;
uniform sampler2D u_height;
uniform vec2 u_texelSize;
uniform vec2 u_stampCenter; // UV coords of stamp center
uniform float u_stampRadius; // radius in texels (long axis — along the nib slit)
uniform float u_stampAmount;
uniform float u_nibAngle;  // nib slit angle in radians (0 = horizontal slit)
uniform float u_nibAspect; // long-axis / short-axis ratio (1 = circle, 3 = narrow slit)
uniform vec2  u_smearDir;  // stroke velocity direction in texels (length = smear distance)

void main() {
  vec2  state = texture(u_inkWet, v_uv).rg;
  float ink   = state.r;
  float wet   = state.g;
  float h     = texture(u_height, v_uv).r;

  vec2  diff = (v_uv - u_stampCenter) / u_texelSize; // distance in texels
  float r    = u_stampRadius;

  // Early exit using the long axis + smear reach
  float smearLen = length(u_smearDir);
  if (length(diff) > r * 1.8 + smearLen) { fragColor = state; return; }

  // ── Smear: nib drags wet ink forward along stroke direction ──
  // Sample ink at the trailing edge (where the nib just came from).
  // Move a fraction of that wet ink to the current position.
  if (smearLen > 0.1) {
    // Trailing-edge UV: look behind the stamp in the stroke direction
    vec2 trailUV = v_uv - u_smearDir * u_texelSize;
    vec2 trailState = texture(u_inkWet, trailUV).rg;
    float trailInk = trailState.r;
    float trailWet = trailState.g;

    // Only smear wet ink, proportional to how much nib overlaps this texel
    float nibDist = length(diff);
    float nibMask = smoothstep(r * 1.4, r * 0.3, nibDist);
    float smearAmt = nibMask * trailWet * 0.10;

    ink += trailInk * smearAmt;
    wet += trailWet * smearAmt * 0.5;
    // Don't subtract from the trail here — that texel gets its own pass
  }

  // ── Nib deposit: elliptical Gaussian ──
  // Rotate into nib-aligned coordinates: x along slit, y perpendicular
  float ca = cos(u_nibAngle);
  float sa = sin(u_nibAngle);
  vec2 nd = vec2(diff.x * ca + diff.y * sa,
                -diff.x * sa + diff.y * ca);

  // Elliptical Gaussian: long axis (along slit) = r, short axis = r / aspect
  float ry = r / u_nibAspect;
  float e2 = (nd.x * nd.x) / (r * r) + (nd.y * nd.y) / (ry * ry);
  float radial = exp(-e2 / (2.0 * 0.45));

  vec2  px          = v_uv / u_texelSize;
  float edgeBreakup = 0.85 + 0.35 * sin(px.x * 0.22 + px.y * 0.17 + h * 8.0);
  float deposit     = radial * edgeBreakup * u_stampAmount;

  fragColor = vec2(
    clamp(ink + deposit * 0.50, 0.0, 1.6),
    clamp(wet + deposit * 0.9,  0.0, 2.0)
  );
}`;

// ── WebGL helpers ─────────────────────────────────────────────────────────────

function compileShader(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error("Shader compile error:\n" + gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }
  return s;
}

function linkProgram(gl, vs, fsSrc) {
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const p = gl.createProgram();
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.error("Program link error:\n" + gl.getProgramInfoLog(p));
    return null;
  }
  return p;
}

// Two triangles covering the full clip-space quad, bound to attribute location 0
function makeQuadVAO(gl) {
  const verts = new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return vao;
}

function makeFloatTex(gl, W, H, iformat, format, data = null) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, iformat, W, H, 0, format, gl.FLOAT, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

function makeFBO(gl, tex) {
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return fbo;
}

// Returns a function (name) => WebGLUniformLocation, cached after first lookup
function makeUniCache(gl, prog) {
  const cache = Object.create(null);
  return (name) => {
    if (name in cache) return cache[name];
    return (cache[name] = gl.getUniformLocation(prog, name));
  };
}

// ── CPU-side paper generation ─────────────────────────────────────────────────

function generateHeightField(W, H, out, noise, roughness = 1.0) {
  const base = 0.008, ridge = 0.018, fine = 0.06;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const broad  = noise.fbm(x * base,   y * base,   5, 0.52);
      const ridges = noise.ridged(x * ridge, y * ridge, 5, 0.56) * roughness;
      const f      = noise.ridged(x * fine,  y * fine,  3, 0.52) * roughness;
      const cx = (x / W) * 2 - 1, cy = (y / H) * 2 - 1;
      out[i] = 1.0 * broad + 0.1 * ridges + 0.14 * f
             + 0.03 * (1 - Math.sqrt(cx * cx + cy * cy));
    }
  }
}

// Returns the dirty bounding rect so the caller can do a partial texSubImage2D
function applyLocalCrumple(W, H, hf, noise, cx, cy, radius, strength) {
  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(W - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(H - 1, Math.ceil(cy + radius));
  const seedX = Math.random() * 1000, seedY = Math.random() * 1000;
  const localScale = 0.09, swirlScale = 0.035;

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dist = Math.hypot(x - cx, y - cy);
      if (dist > radius) continue;
      const falloff = 1 - smoothstep(0, radius, dist);
      const wrinkle = noise.ridged((x + seedX) * localScale, (y + seedY) * localScale, 4, 0.58) * 2 - 1;
      const swirl   = noise.fbm(  (x - seedX) * swirlScale,  (y - seedY) * swirlScale,  3, 0.60) * 2 - 1;
      const crease  = (1 - dist / radius) ** 2;
      hf[y * W + x] += (wrinkle * 0.09 + swirl * 0.03 + crease * 0.06) * strength * falloff;
    }
  }
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// ── Component ─────────────────────────────────────────────────────────────────

const InteractivePaperCanvas = forwardRef(function InteractivePaperCanvas({
  width = 900,
  height = 600,
  inkColor = { r: 30, g: 38, b: 58 },
  brushRadius = 8,
  crumpleStrength = 1.0,
  paperRoughness = 1.0,
  simScale = 2,        // internal resolution multiplier (2 = supersample at 2× CSS pixels)
  interactive = true,
  storageKey = null,
  style = {},
  className = "",
}, ref) {
  const canvasRef = useRef(null);
  const glState   = useRef(null);
  const ptrState  = useRef({ down: false, last: null });
  const noise     = useMemo(() => new PerlinNoise(), []);

  // ── Public API (via ref) ──────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    reset() {
      const s = glState.current;
      if (!s) return;
      for (const tex of s.inkTex) {
        s.gl.bindTexture(s.gl.TEXTURE_2D, tex);
        s.gl.texImage2D(s.gl.TEXTURE_2D, 0, s.gl.RG32F, s.W, s.H, 0, s.gl.RG, s.gl.FLOAT, null);
      }
      s.activeBounds = { x: 0, y: 0, w: 0, h: 0 };
      if (storageKey) localStorage.removeItem(storageKey);
      s.startLoop(); // re-render so the cleared ink is visible immediately
    },
    exportPNG() {
      return canvasRef.current?.toDataURL("image/png");
    },
    // Deposit a single ink stamp at a CSS-pixel position.
    // Used by inkText.js to animate handwritten strokes.
    stampAt(xCss, yCss, { pressure = 1, radius = null, nibAngle = 0, nibAspect = 1, smearDirX = 0, smearDirY = 0 } = {}) {
      stamp(xCss, yCss, pressure, radius, nibAngle, nibAspect, smearDirX, smearDirY);
    },
    // Set the active ink color (r/g/b 0-255). Persists until changed again.
    setInkColor(r, g, b) {
      const s = glState.current;
      if (!s) return;
      s.inkRGB = new Float32Array([r / 255, g / 255, b / 255]);
    },
    // Fill a rectangle with settled ink immediately (no animation).
    // region is in CSS pixels. Returns { ok, error? }.
    fillRect(region, color) {
      const s = glState.current;
      if (!s) return { ok: false, error: "Canvas not initialized" };
      const { gl, inkTex, W, H, dpr } = s;

      const px = Math.floor(region.x * dpr);
      const py = Math.floor(region.y * dpr);
      const pw = Math.ceil(region.width * dpr);
      const ph = Math.ceil(region.height * dpr);

      if (px < 0 || py < 0 || px + pw > W || py + ph > H) {
        return {
          ok: false,
          error: `Region (${region.x},${region.y} ${region.width}×${region.height}) exceeds canvas bounds (${W/dpr}×${H/dpr} CSS px)`,
        };
      }

      // CSS y is top-down; GL texture y is bottom-up
      const glY = H - py - ph;

      // Settled ink: wetness=0 so the simulation's dry early-exit preserves it
      const data = new Float32Array(pw * ph * 2);
      for (let i = 0; i < pw * ph; i++) {
        data[i * 2]     = 1.0; // ink
        data[i * 2 + 1] = 0.0; // wetness (already dry = permanent)
      }
      gl.bindTexture(gl.TEXTURE_2D, inkTex[s.current]);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, px, glY, pw, ph, gl.RG, gl.FLOAT, data);
      gl.bindTexture(gl.TEXTURE_2D, null);

      if (color) {
        s.inkRGB = new Float32Array([color.r / 255, color.g / 255, color.b / 255]);
      }

      // Expand active bounds to cover the new region and kick the render loop
      const ab = s.activeBounds;
      if (ab.w === 0) {
        ab.x = px; ab.y = glY; ab.w = pw; ab.h = ph;
      } else {
        const x0 = Math.min(ab.x, px),        y0 = Math.min(ab.y, glY);
        const x1 = Math.max(ab.x + ab.w, px + pw), y1 = Math.max(ab.y + ab.h, glY + ph);
        ab.x = x0; ab.y = y0; ab.w = x1 - x0; ab.h = y1 - y0;
      }
      s.startLoop();
      return { ok: true };
    },
  }));

  // ── WebGL init ────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    // Effective DPR includes the quality multiplier so the sim runs at higher
    // internal resolution than the display.  The browser downsamples the canvas
    // backing store to CSS size automatically.
    const dpr = (window.devicePixelRatio || 1) * simScale;
    const W = Math.floor(width * dpr);
    const H = Math.floor(height * dpr);
    canvas.width  = W;
    canvas.height = H;

    // preserveDrawingBuffer keeps the last frame alive so exportPNG works
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
    if (!gl) { console.error("WebGL2 not supported"); return; }

    // Unlocks rendering to float framebuffers (needed for ping-pong FBOs)
    gl.getExtension("EXT_color_buffer_float");

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERT);
    const simProg    = linkProgram(gl, vs, SIM_FRAG);
    const renderProg = linkProgram(gl, vs, RENDER_FRAG);
    const stampProg  = linkProgram(gl, vs, STAMP_FRAG);
    gl.deleteShader(vs);

    const simUni    = makeUniCache(gl, simProg);
    const renderUni = makeUniCache(gl, renderProg);
    const stampUni  = makeUniCache(gl, stampProg);

    const quadVAO = makeQuadVAO(gl);

    // Height field: R32F — single float per texel
    const hfData = new Float32Array(W * H);
    generateHeightField(W, H, hfData, noise, paperRoughness);
    const heightTex = makeFloatTex(gl, W, H, gl.R32F, gl.RED, hfData);

    // Ink + wetness ping-pong: RG32F — red=ink, green=wetness
    const inkTex = [
      makeFloatTex(gl, W, H, gl.RG32F, gl.RG, null),
      makeFloatTex(gl, W, H, gl.RG32F, gl.RG, null),
    ];
    const inkFBO = [makeFBO(gl, inkTex[0]), makeFBO(gl, inkTex[1])];

    let current = 0;
    let rafId   = null;

    const texelSize = new Float32Array([1 / W, 1 / H]);

    function bindTex(unit, tex, loc) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(loc, unit);
    }

    function simulate() {
      const next = 1 - current;
      const ab = glState.current.activeBounds;

      // Copy the current texture into the next slot first. This keeps settled ink
      // in the regions the scissor won't touch, so we don't lose it each frame.
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, inkFBO[current]);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, inkFBO[next]);
      gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST);

      // Run simulation only over the active bounds (scissor discards all other fragments).
      gl.bindFramebuffer(gl.FRAMEBUFFER, inkFBO[next]);
      gl.viewport(0, 0, W, H);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(ab.x, ab.y, ab.w, ab.h);
      gl.useProgram(simProg);
      bindTex(0, inkTex[current], simUni("u_inkWet"));
      bindTex(1, heightTex,       simUni("u_height"));
      gl.uniform2fv(simUni("u_texelSize"), texelSize);
      gl.bindVertexArray(quadVAO);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.disable(gl.SCISSOR_TEST);
      current = next;
    }

    function render() {
      gl.viewport(0, 0, W, H);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.useProgram(renderProg);
      bindTex(0, inkTex[current], renderUni("u_inkWet"));
      bindTex(1, heightTex,       renderUni("u_height"));
      gl.uniform2fv(renderUni("u_texelSize"), texelSize);
      gl.uniform3fv(renderUni("u_inkColor"), glState.current.inkRGB);
      gl.bindVertexArray(quadVAO);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    // ── Persistence ───────────────────────────────────────────────────────────
    // We only save the ink channel (R), not wetness (G) — settled ink always has
    // wetness=0 so there's nothing to round-trip. The ink values are encoded as
    // a grayscale PNG via an offscreen 2D canvas, which compresses very well for
    // sparse ink and keeps the localStorage footprint to ~50–200KB.

    function saveInkState() {
      if (!storageKey) return;
      const raw = new Float32Array(W * H * 2);
      gl.bindFramebuffer(gl.FRAMEBUFFER, inkFBO[current]);
      gl.readPixels(0, 0, W, H, gl.RG, gl.FLOAT, raw);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      const offscreen = document.createElement("canvas");
      offscreen.width = W; offscreen.height = H;
      const ctx = offscreen.getContext("2d");
      const img = ctx.createImageData(W, H);
      for (let i = 0; i < W * H; i++) {
        const byte = Math.min(255, Math.floor((raw[i * 2] / 1.6) * 255));
        img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = byte;
        img.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      try {
        localStorage.setItem(storageKey, JSON.stringify({ W, H, src: offscreen.toDataURL("image/png") }));
      } catch (e) {
        console.warn("[PaperCanvas] localStorage save failed:", e);
      }
    }

    function loadInkState() {
      if (!storageKey) return;
      const saved = localStorage.getItem(storageKey);
      if (!saved) return;
      const { W: sW, H: sH, src } = JSON.parse(saved);
      if (sW !== W || sH !== H) return; // dimensions changed (e.g. DPR or resize), skip

      const image = new Image();
      image.onload = () => {
        const offscreen = document.createElement("canvas");
        offscreen.width = W; offscreen.height = H;
        const ctx = offscreen.getContext("2d");
        ctx.drawImage(image, 0, 0);
        const px = ctx.getImageData(0, 0, W, H).data;

        const inkData = new Float32Array(W * H * 2);
        for (let i = 0; i < W * H; i++) {
          inkData[i * 2]     = (px[i * 4] / 255) * 1.6; // R → ink
          inkData[i * 2 + 1] = 0;                         // wetness = 0
        }
        gl.bindTexture(gl.TEXTURE_2D, inkTex[current]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, W, H, 0, gl.RG, gl.FLOAT, inkData);
        gl.bindTexture(gl.TEXTURE_2D, null);

        // Cover the full canvas so the render loop shows the restored ink
        glState.current.activeBounds = { x: 0, y: 0, w: W, h: H };
        startLoop();
      };
      image.src = src;
    }

    // Wetness decays by 0.92/frame. After 200 frames: 0.92^200 ≈ 1e-7 — fully dry.
    // Once idle that long with no new stamps, the loop stops. Ink remains visible
    // in the textures; we just stop asking the GPU to keep simulating nothing.
    const IDLE_FRAMES = 200;

    function tick() {
      const s = glState.current;
      if (s.framesSinceStamp >= IDLE_FRAMES) {
        s.running = false;
        saveInkState(); // ink is fully settled — good moment to persist
        return; // don't reschedule — loop is stopped until next stamp
      }
      simulate();
      render();
      s.framesSinceStamp++;
      rafId = requestAnimationFrame(tick);
      s.rafId = rafId;
    }

    function startLoop() {
      const s = glState.current;
      if (s.running) return;
      s.running = true;
      s.framesSinceStamp = 0;
      rafId = requestAnimationFrame(tick);
      s.rafId = rafId;
    }

    glState.current = {
      gl, quadVAO,
      simProg, renderProg, stampProg,
      simUni, renderUni, stampUni,
      heightTex, hfData,
      inkTex, inkFBO,
      texelSize,
      inkRGB: new Float32Array([inkColor.r / 255, inkColor.g / 255, inkColor.b / 255]),
      W, H, dpr,
      get current() { return current; },
      set current(v) { current = v; },
      rafId: null,
      running: false,
      framesSinceStamp: IDLE_FRAMES, // start idle; stamp() will trigger startLoop
      activeBounds: { x: 0, y: 0, w: 0, h: 0 },
      startLoop,
    };

    rafId = requestAnimationFrame(tick);
    glState.current.running = true;
    glState.current.framesSinceStamp = 0;
    glState.current.rafId = rafId;

    // Load persisted ink after the first render frame so the canvas is ready
    requestAnimationFrame(() => loadInkState());

    // Save on page close in case the loop is still running when the user leaves
    const handleUnload = () => saveInkState();
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      cancelAnimationFrame(glState.current?.rafId ?? rafId);
      window.removeEventListener("beforeunload", handleUnload);
      gl.deleteTexture(heightTex);
      inkTex.forEach(t => gl.deleteTexture(t));
      inkFBO.forEach(f => gl.deleteFramebuffer(f));
      [simProg, renderProg, stampProg].forEach(p => gl.deleteProgram(p));
      gl.deleteVertexArray(quadVAO);
      glState.current = null;
    };
  }, [width, height, noise, paperRoughness, simScale]);

  // Live-update ink color without reinitializing
  useEffect(() => {
    if (!glState.current) return;
    glState.current.inkRGB = new Float32Array([
      inkColor.r / 255, inkColor.g / 255, inkColor.b / 255,
    ]);
  }, [inkColor.r, inkColor.g, inkColor.b]);

  // ── Stamp ─────────────────────────────────────────────────────────────────
  // GPU pass: copies current ink/wetness + adds Gaussian blob → writes to next slot.
  // Then modifies the CPU height field in the crumple region and re-uploads
  // only that sub-rectangle (UNPACK_ROW_LENGTH lets us pass the full array with
  // an offset instead of extracting a sub-buffer).
  const stamp = useCallback((xCss, yCss, pressure = 1, radiusOverride = null, nibAngle = 0, nibAspect = 1, smearDirX = 0, smearDirY = 0) => {
    const s = glState.current;
    if (!s) return;
    const { gl, stampProg, stampUni, quadVAO, inkTex, inkFBO, heightTex, hfData, texelSize, W, H, dpr } = s;

    const next   = 1 - s.current;
    const xPx    = xCss * dpr;
    const yPx    = yCss * dpr;
    const radius = radiusOverride !== null
      ? radiusOverride * dpr
      : brushRadius * dpr * lerp(0.8, 1.3, pressure);

    // Expand active bounds to cover this stamp (GL coords: y from bottom).
    // Pad generously so the ink has room to spread beyond the brush tip.
    const cx_gl = xPx;
    const cy_gl = H - yPx;
    const pad   = Math.max(radius, 45 * dpr) * 3;
    const nx0 = Math.max(0,     Math.floor(cx_gl - pad));
    const ny0 = Math.max(0,     Math.floor(cy_gl - pad));
    const nx1 = Math.min(W,     Math.ceil(cx_gl  + pad));
    const ny1 = Math.min(H,     Math.ceil(cy_gl  + pad));
    const ab  = s.activeBounds;
    ab.x = ab.w === 0 ? nx0 : Math.min(ab.x, nx0);
    ab.y = ab.h === 0 ? ny0 : Math.min(ab.y, ny0);
    ab.w = (ab.w === 0 ? nx1 : Math.max(ab.x + ab.w, nx1)) - ab.x;
    ab.h = (ab.h === 0 ? ny1 : Math.max(ab.y + ab.h, ny1)) - ab.y;

    // Reset idle counter and restart the loop if it was resting.
    s.framesSinceStamp = 0;
    s.startLoop();

    gl.viewport(0, 0, W, H);
    gl.bindFramebuffer(gl.FRAMEBUFFER, inkFBO[next]);
    gl.useProgram(stampProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, inkTex[s.current]);
    gl.uniform1i(stampUni("u_inkWet"), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, heightTex);
    gl.uniform1i(stampUni("u_height"), 1);
    gl.uniform2fv(stampUni("u_texelSize"), texelSize);
    gl.uniform2f(stampUni("u_stampCenter"), xPx / W, 1.0 - yPx / H);
    gl.uniform1f(stampUni("u_stampRadius"), radius);
    gl.uniform1f(stampUni("u_stampAmount"), 0.85 * pressure);
    gl.uniform1f(stampUni("u_nibAngle"), nibAngle);
    gl.uniform1f(stampUni("u_nibAspect"), nibAspect);
    // Smear direction in texels — scale by DPR, flip Y for GL coordinates
    gl.uniform2f(stampUni("u_smearDir"), smearDirX * dpr, -smearDirY * dpr);
    gl.bindVertexArray(quadVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    s.current = next;

    // Partial height field re-upload: only the crumpled sub-rectangle
    const { x0, y0, w, h } = applyLocalCrumple(
      W, H, hfData, noise, xPx, yPx,
      45 * dpr, 0.18 * pressure * crumpleStrength
    );
    gl.bindTexture(gl.TEXTURE_2D, heightTex);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, W); // source row stride = full texture width
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, y0, w, h, gl.RED, gl.FLOAT, hfData, y0 * W + x0);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }, [brushRadius, crumpleStrength, noise]);

  // ── Pointer events ────────────────────────────────────────────────────────
  const handlePointerDown = useCallback((e) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    ptrState.current = { down: true, last: pt };
    stamp(pt.x, pt.y, 1.0);
  }, [stamp]);

  const handlePointerMove = useCallback((e) => {
    if (!ptrState.current.down) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pt   = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const last = ptrState.current.last ?? pt;
    const dist  = Math.hypot(pt.x - last.x, pt.y - last.y);
    const steps = Math.max(1, Math.ceil(dist / 4));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      stamp(last.x + (pt.x - last.x) * t, last.y + (pt.y - last.y) * t, 0.7);
    }
    ptrState.current.last = pt;
  }, [stamp]);

  const stopPointer = useCallback(() => {
    ptrState.current = { down: false, last: null };
  }, []);

  return (
    <div
      className={className}
      onPointerDown={interactive ? handlePointerDown : undefined}
      onPointerMove={interactive ? handlePointerMove : undefined}
      onPointerUp={interactive ? stopPointer : undefined}
      onPointerLeave={interactive ? stopPointer : undefined}
      onPointerCancel={interactive ? stopPointer : undefined}
      style={{
        position: "relative",
        width,
        height,
        borderRadius: 16,
        overflow: "hidden",
        cursor: interactive ? "crosshair" : "default",
        boxShadow: "0 12px 30px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.65)",
        touchAction: "none",
        ...style,
      }}
    >
      <canvas ref={canvasRef} style={{ display: "block", width, height }} />
    </div>
  );
});

export default InteractivePaperCanvas;
