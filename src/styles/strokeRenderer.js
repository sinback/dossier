/**
 * strokeRenderer.js — WebGL2 stroke renderer for the Matlack canvas.
 *
 * Draws broad-nib pen strokes as triangle strips with:
 *   - Nib-angle-dependent width (elliptical contact patch projected onto stroke normal)
 *   - Pressure-modulated opacity
 *   - Two-pass rendering: coverage to offscreen FBO (MAX blend), then composite
 *
 * Usage:
 *   const renderer = createStrokeRenderer(gl);
 *   renderer.clear();
 *   renderer.drawStroke(points, radius);
 */

// ── Shaders: Pass 1 — stroke coverage ───────────────────────────────────────
// Renders stroke geometry to a single-channel (R) coverage texture.
// MAX blending ensures overlapping triangles don't accumulate — just takes the
// highest coverage value at each pixel.

const COVERAGE_VERT = `#version 300 es
precision highp float;

in vec2 a_position;
in float a_pressure;
in float a_edgeDist;

uniform vec2 u_resolution;

out float v_pressure;
out float v_edgeDist;

void main() {
  vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
  v_pressure = a_pressure;
  v_edgeDist = a_edgeDist;
}
`;

const COVERAGE_FRAG = `#version 300 es
precision highp float;

in float v_pressure;
in float v_edgeDist;

out vec4 fragColor;

void main() {
  float edge = abs(v_edgeDist);
  float aa = 1.0 - smoothstep(0.7, 1.0, edge);
  // Coverage: linear ramp from faint to full — even light strokes are visible
  float coverage = (0.08 + 0.92 * v_pressure) * aa;
  fragColor = vec4(coverage, 0.0, 0.0, 1.0);
}
`;

// ── Shaders: Pass 2 — composite coverage onto main canvas ───────────────────

const COMPOSITE_VERT = `#version 300 es
precision highp float;

in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const COMPOSITE_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
uniform sampler2D u_coverage;
uniform vec3 u_inkColor;

out vec4 fragColor;

void main() {
  float c = texture(u_coverage, v_uv).r;
  if (c < 0.01) discard;
  fragColor = vec4(u_inkColor, c);
}
`;

// ── Nib model ────────────────────────────────────────────────────────────────

const NIB_ANGLE = (52 * Math.PI) / 180;  // English round hand — steeper than generic 40°
const NIB_SEMI_MAJOR = 1.0;
const NIB_SEMI_MINOR_MIN = 0.06;   // tines closed — near-hairline
const NIB_SEMI_MINOR_MAX = 0.5;    // tines splayed — heavy pressure

// Ink drag factor: at low pressure (fast movement), the nib's effective angle
// tilts toward the stroke tangent — ink smears along the direction of travel,
// making the stroke thinner perpendicular to the tangent. At high pressure
// (slow movement), the static nib shape dominates.
const DRAG_BLEND = 0.3;  // max tangent-following at zero pressure

function nibHalfWidth(tangentAngle, pressure, radius) {
  const b = NIB_SEMI_MINOR_MIN + (NIB_SEMI_MINOR_MAX - NIB_SEMI_MINOR_MIN) * pressure;
  const a = NIB_SEMI_MAJOR;
  // Blend nib angle toward tangent at low pressure (ink drag)
  const drag = DRAG_BLEND * (1 - pressure);
  const effectiveNibAngle = NIB_ANGLE + drag * (tangentAngle - NIB_ANGLE);
  const delta = tangentAngle - effectiveNibAngle;
  return Math.sqrt((a * Math.sin(delta)) ** 2 + (b * Math.cos(delta)) ** 2) * radius;
}

// ── Triangle strip builder ───────────────────────────────────────────────────

function buildStripGeometry(points, radius) {
  const n = points.length;
  if (n < 2) return null;

  const positions = new Float32Array(n * 2 * 2);
  const pressures = new Float32Array(n * 2);
  const edgeDists = new Float32Array(n * 2);

  for (let i = 0; i < n; i++) {
    const p = points[i];

    let tx, ty;
    if (i < n - 1) {
      tx = points[i + 1].x - p.x;
      ty = points[i + 1].y - p.y;
    } else {
      tx = p.x - points[i - 1].x;
      ty = p.y - points[i - 1].y;
    }
    if (i > 0 && i < n - 1) {
      const ptx = p.x - points[i - 1].x;
      const pty = p.y - points[i - 1].y;
      const pl = Math.hypot(ptx, pty);
      const nl = Math.hypot(tx, ty);
      if (pl > 0.001 && nl > 0.001) {
        tx = tx / nl + ptx / pl;
        ty = ty / nl + pty / pl;
      }
    }

    const tLen = Math.hypot(tx, ty);
    if (tLen > 0.001) { tx /= tLen; ty /= tLen; }
    else { tx = 1; ty = 0; }

    const nx = -ty, ny = tx;
    const tangentAngle = Math.atan2(ty, tx);
    const hw = nibHalfWidth(tangentAngle, p.pressure, radius);

    const li = i * 2;
    positions[li * 2]     = p.x + nx * hw;
    positions[li * 2 + 1] = p.y + ny * hw;
    pressures[li] = p.pressure;
    edgeDists[li] = -1.0;

    const ri = li + 1;
    positions[ri * 2]     = p.x - nx * hw;
    positions[ri * 2 + 1] = p.y - ny * hw;
    pressures[ri] = p.pressure;
    edgeDists[ri] = 1.0;
  }

  return { positions, pressures, edgeDists, count: n * 2 };
}

function buildCapGeometry(cx, cy, tangentAngle, pressure, radius, segments = 16) {
  const b = NIB_SEMI_MINOR_MIN + (NIB_SEMI_MINOR_MAX - NIB_SEMI_MINOR_MIN) * pressure;
  const a = NIB_SEMI_MAJOR;

  const count = segments + 2;
  const positions = new Float32Array(count * 2);
  const pressures = new Float32Array(count);
  const edgeDists = new Float32Array(count);

  positions[0] = cx;
  positions[1] = cy;
  pressures[0] = pressure;
  edgeDists[0] = 0.0;

  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const lx = a * Math.cos(angle) * radius;
    const ly = b * Math.sin(angle) * radius;
    const rx = lx * Math.cos(NIB_ANGLE) - ly * Math.sin(NIB_ANGLE);
    const ry = lx * Math.sin(NIB_ANGLE) + ly * Math.cos(NIB_ANGLE);

    const vi = i + 1;
    positions[vi * 2]     = cx + rx;
    positions[vi * 2 + 1] = cy + ry;
    pressures[vi] = pressure;
    edgeDists[vi] = 1.0;
  }

  return { positions, pressures, edgeDists, count };
}

// ── WebGL helpers ────────────────────────────────────────────────────────────

function compileShader(gl, type, src) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl, vertSrc, fragSrc) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(prog));
    return null;
  }
  return prog;
}

// ── Public API ───────────────────────────────────────────────────────────────

export function createStrokeRenderer(gl) {
  // ── Coverage pass setup ──────────────────────────────────────────────────
  const covProg = createProgram(gl, COVERAGE_VERT, COVERAGE_FRAG);
  const cov_a_position = gl.getAttribLocation(covProg, 'a_position');
  const cov_a_pressure = gl.getAttribLocation(covProg, 'a_pressure');
  const cov_a_edgeDist = gl.getAttribLocation(covProg, 'a_edgeDist');
  const cov_u_resolution = gl.getUniformLocation(covProg, 'u_resolution');

  const covVao = gl.createVertexArray();
  const covPosBuf = gl.createBuffer();
  const covPresBuf = gl.createBuffer();
  const covEdgeBuf = gl.createBuffer();

  gl.bindVertexArray(covVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, covPosBuf);
  gl.enableVertexAttribArray(cov_a_position);
  gl.vertexAttribPointer(cov_a_position, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, covPresBuf);
  gl.enableVertexAttribArray(cov_a_pressure);
  gl.vertexAttribPointer(cov_a_pressure, 1, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, covEdgeBuf);
  gl.enableVertexAttribArray(cov_a_edgeDist);
  gl.vertexAttribPointer(cov_a_edgeDist, 1, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  // ── Composite pass setup ─────────────────────────────────────────────────
  const compProg = createProgram(gl, COMPOSITE_VERT, COMPOSITE_FRAG);
  const comp_a_position = gl.getAttribLocation(compProg, 'a_position');
  const comp_u_coverage = gl.getUniformLocation(compProg, 'u_coverage');
  const comp_u_inkColor = gl.getUniformLocation(compProg, 'u_inkColor');

  // Full-screen quad
  const quadBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

  const compVao = gl.createVertexArray();
  gl.bindVertexArray(compVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.enableVertexAttribArray(comp_a_position);
  gl.vertexAttribPointer(comp_a_position, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  // ── FBO for coverage texture ─────────────────────────────────────────────
  let fbo = null;
  let covTex = null;
  let fboW = 0, fboH = 0;

  function ensureFBO() {
    const w = gl.canvas.width, h = gl.canvas.height;
    if (fbo && fboW === w && fboH === h) return;

    if (fbo) { gl.deleteFramebuffer(fbo); gl.deleteTexture(covTex); }

    covTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, covTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, covTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    fboW = w;
    fboH = h;
  }

  function uploadCoverage(geom, mode) {
    if (!geom || geom.count === 0) return;
    gl.bindVertexArray(covVao);

    gl.bindBuffer(gl.ARRAY_BUFFER, covPosBuf);
    gl.bufferData(gl.ARRAY_BUFFER, geom.positions, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, covPresBuf);
    gl.bufferData(gl.ARRAY_BUFFER, geom.pressures, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, covEdgeBuf);
    gl.bufferData(gl.ARRAY_BUFFER, geom.edgeDists, gl.DYNAMIC_DRAW);

    gl.drawArrays(mode, 0, geom.count);
    gl.bindVertexArray(null);
  }

  // Default ink color
  let inkR = 30 / 255, inkG = 38 / 255, inkB = 58 / 255;

  return {
    /**
     * Draw a stroke with proper coverage compositing.
     * @param {Array<{x: number, y: number, pressure: number}>} points
     * @param {number} radius - base stroke radius in pixels
     */
    drawStroke(points, radius = 3) {
      if (points.length < 2) return;

      ensureFBO();

      // ── Pass 1: render coverage to FBO with MAX blending ──────────────
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, fboW, fboH);
      gl.clearColor(0.0, 0.0, 0.0, 0.0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.useProgram(covProg);
      gl.uniform2f(cov_u_resolution, fboW, fboH);

      // MAX blend: overlapping fragments take the highest coverage, no accumulation
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.MAX);
      gl.blendFunc(gl.ONE, gl.ONE);

      // Stroke body
      const strip = buildStripGeometry(points, radius);
      uploadCoverage(strip, gl.TRIANGLE_STRIP);

      // End caps
      const p0 = points[0], pN = points[points.length - 1];
      const t0 = Math.atan2(points[1].y - p0.y, points[1].x - p0.x);
      const tN = Math.atan2(pN.y - points[points.length - 2].y, pN.x - points[points.length - 2].x);
      uploadCoverage(buildCapGeometry(p0.x, p0.y, t0, p0.pressure, radius), gl.TRIANGLE_FAN);
      uploadCoverage(buildCapGeometry(pN.x, pN.y, tN, pN.pressure, radius), gl.TRIANGLE_FAN);

      // ── Pass 2: composite coverage onto main canvas ───────────────────
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

      gl.useProgram(compProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, covTex);
      gl.uniform1i(comp_u_coverage, 0);
      gl.uniform3f(comp_u_inkColor, inkR, inkG, inkB);

      // Standard alpha blending for composite
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      gl.bindVertexArray(compVao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);

      gl.disable(gl.BLEND);
    },

    clear() {
      gl.clearColor(1.0, 1.0, 1.0, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    },

    setInkColor(r, g, b) {
      inkR = r / 255;
      inkG = g / 255;
      inkB = b / 255;
    },

    nibHalfWidth,
  };
}
