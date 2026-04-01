# Ink & Paper Rendering System

This directory contains Dossier's "real paper" rendering engine: a WebGL2 ink simulation paired with a kinematics-based stroke planner that together produce animated handwriting with physically-grounded pen behavior.

## Architecture

```
POST /api/draw  ──>  PaperCanvasPanel  ──>  inkText.js (stroke planning)
                         |                       |
                         v                       | stampAt() calls
                  InteractivePaperCanvas  <──────┘
                    (WebGL2 simulation)
```

**inkText.js** plans *how* the pen moves — trajectory, speed, pressure, tremor. It outputs a sequence of stamp commands.

**InteractivePaperCanvas.jsx** simulates *what happens when ink hits paper* — deposit shape, capillary spreading, drying, and rendering. It runs entirely on the GPU via ping-pong framebuffers.

## Stroke planning (inkText.js)

### Trajectory

Each character is defined as a list of strokes in `STROKE_TABLE`, where each stroke is a sequence of normalized `[x, y]` waypoints. These are scaled to pixel space, then fitted with a **natural cubic spline** (C2 continuous, chord-length parameterized) using the Thomas algorithm for the tridiagonal system.

### Velocity model

Stamp velocity along each stroke follows two principles from motor neuroscience:

- **2/3 power law** (Lacquaniti et al. 1983): tangential velocity scales with the radius of curvature — `v = k * kappa^(-1/3)`. The pen speeds up on straight segments and slows into curves. The exponent 1/3 is invariant across people, moods, and impairment.

- **Minimum-jerk ramp** (Flash & Hogan 1985): velocity tapers to zero at stroke endpoints via a 5th-order polynomial `s(t) = 10t^3 - 15t^4 + 6t^5`, producing a bell-shaped velocity profile with zero acceleration at the boundaries.

### Pressure

Pen pressure is velocity-dependent: `pressure = 0.92 - 0.14 * velNorm`. Slower strokes (curves, corners) press harder; fast strokes are lighter. Range: 0.78-0.92.

### Tremor

Quasi-periodic perpendicular displacement at 10 Hz (physiological range: 8-12 Hz) using three incommensurate sinusoids to avoid exact repetition. Amplitude scales with stroke radius (`strokeRadius * 0.35`), not pixels.

### Jitter

Per-render random perturbation of interior waypoints (endpoints pinned). Tangent-biased: full amplitude along the stroke direction, 25% perpendicular. This prevents straight strokes from going wavy while still allowing variation on curves.

### Baseline wander

Slow vertical drift across characters using incommensurate sinusoids. Amplitude = `size * 0.018`. Random phase per text block.

## Nib geometry

The stamp shape models a quill/broad-nib pen:

- **Nib angle**: 40 degrees from horizontal (fixed — property of how the pen is held)
- **Aspect ratio**: pressure-dependent. Low pressure = tines closed = 3:1 ellipse (thin hairlines). High pressure = tines splayed = 1.4:1 (broader marks).

This produces natural thick/thin variation: downstrokes are thick, cross-strokes are thin, curves transition smoothly — all from the same elliptical stamp oriented at a fixed angle.

## Ink smear

Each stamp samples ink at a trailing offset (behind the nib in the stroke direction) and redistributes a fraction forward. This simulates the nib mechanically dragging wet ink. Smear strength scales with velocity — fast strokes drag more. Only wet ink is affected; dry ink is immovable.

## WebGL simulation (InteractivePaperCanvas.jsx)

### Ping-pong buffers

Two RG32F textures alternate roles each frame: R = ink density, G = wetness. The simulation reads from one and writes to the other.

### Paper height field

Generated on the CPU using Perlin noise (fbm for broad undulation, ridged noise for texture detail). Stored in an R32F texture. The height field influences ink flow via slope bias and creates visible paper lighting in the render pass.

### Simulation pass (SIM_FRAG)

A gather kernel — each pixel pulls from its 4 neighbors:

- **Slope-biased ink transfer**: ink flows downhill on the paper surface. Bias = `clamp(0.25 + slope * 1.2, 0, 0.75)`.
- **Isotropic capillary**: small omnidirectional ink spread regardless of slope.
- **Wetness transfer**: wetness spreads to neighbors, carrying ink-spreading potential.
- **Wetness decay**: `wet *= 0.85` per frame. Below `DRY = 0.015`, ink freezes permanently.
- **Ink retention**: loss decreases as the pixel dries, ensuring most ink survives to settle.

### Stamp pass (STAMP_FRAG)

Deposits ink as an oriented elliptical Gaussian (nib geometry) with edge breakup from the paper height field. Also performs smear (trailing-edge ink advection along stroke velocity).

### Render pass (RENDER_FRAG)

Composites paper lighting (height-field derivatives for highlights/shadows, deterministic grain) with ink (feathered alpha from ink density, lit by paper surface normals).

### Paper height field generation

The height field is built from three layers of Perlin noise, blended with configurable weights:

```
height = broad_weight * fbm(low_freq) + ridge_weight * ridged(mid_freq) + fine_weight * ridged(high_freq)
```

- **Broad** (weight: 1.0, freq: 0.008) — very low-frequency fbm noise producing gentle rolling undulation across the paper. Intended to simulate large-scale paper warping (e.g., slight curl or bow). In practice, the visual effect of this coefficient is subtle/hard to see — it may be a candidate for removal.
- **Ridges** (weight: 0.1, freq: 0.018) — mid-frequency ridged noise creating sharp crease-like texture. This is the main "crinkliness" knob. Higher values produce handmade/papyrus-like paper; lower values give smoother stationery. The `paperRoughness` prop scales this layer.
- **Fine** (weight: 0.14, freq: 0.06) — high-frequency ridged noise for grain-scale texture detail. Also scaled by `paperRoughness`.

The height field affects ink flow (slope bias in SIM_FRAG) and paper appearance (lighting in RENDER_FRAG).

### Paper lighting

The render pass computes a directional light from height-field derivatives:

```glsl
float light = -dx * 0.8 - dy * 0.65;
float base = (229.0 + h * 16.0 + light * 100.0 + grain * 5.0) / 255.0;
```

- `h * 16.0` — height directly brightens peaks and darkens valleys
- `light * 100.0` — derivative-based highlight/shadow from surface normals. In practice, with the current subdued height field (low ridge weight), this multiplier has minimal visible effect. May be a candidate for removal or reduction if it continues to not pull its weight visually.

### Supersampling

The `simScale` prop (default 2) multiplies the effective device pixel ratio so the simulation runs at higher internal resolution than the display. At DPR 1, this gives the sim enough texels for nib geometry, tremor, and smear to resolve cleanly at small font sizes. The browser downsamples automatically.

### Paper crumple

Interactive drawing (not text animation) deforms the CPU-side height field under the pen, simulating paper dimpling from nib pressure. The deformed region is re-uploaded via `texSubImage2D`. Skipped for text stamps to avoid CPU-bound noise evaluation overhead.

## Key references

- Flash & Hogan (1985). "The coordination of arm movements: an experimentally confirmed mathematical model." *Journal of Neuroscience*.
- Lacquaniti, Terzuolo & Viviani (1983). "The law relating the kinematic and figural aspects of drawing movements." *Acta Psychologica*.
- Plamondon (1995). "A kinematic theory of rapid human movements." *Biological Cybernetics*. (Sigma-lognormal model — not yet implemented, parked.)

## Constants quick reference

| Constant | Value | Location | What it controls |
|---|---|---|---|
| `NIB_ANGLE` | 40 deg | inkText.js | Nib slit orientation |
| `NIB_ASPECT_MAX` | 3.0 | inkText.js | Closed-tine aspect ratio |
| `NIB_ASPECT_MIN` | 1.4 | inkText.js | Full-splay aspect ratio |
| `TREMOR_HZ` | 10 | inkText.js | Tremor frequency |
| `TREMOR_SCALE` | 0.35 | inkText.js | Tremor amplitude (fraction of strokeRadius) |
| `JITTER_SCALE` | 0.025 | inkText.js | Default waypoint jitter |
| `WANDER_SCALE` | 0.018 | inkText.js | Baseline wander amplitude (fraction of size) |
| `strokeRadius` | `size * 0.065` | inkText.js | Pen tip radius |
| `simScale` | 2 | InteractivePaperCanvas | Internal resolution multiplier |
| `DRY` | 0.015 | SIM_FRAG | Wetness freeze threshold |
| Wetness decay | 0.85/frame | SIM_FRAG | How fast ink dries |
| Ink deposit | `deposit * 0.50` | STAMP_FRAG | Ink per stamp |
| Smear factor | 0.10 | STAMP_FRAG | Trailing-edge ink drag |
| Broad weight | 1.0 | generateHeightField | Large-scale paper warping (subtle/possibly inert) |
| Ridge weight | 0.1 | generateHeightField | Paper crinkliness (the main texture knob) |
| Fine weight | 0.14 | generateHeightField | Grain-scale texture detail |
| Lighting mult | 100.0 | RENDER_FRAG | Height-field highlight/shadow strength (possibly inert) |

## Dev API

Draw commands are sent to the Vite dev server and broadcast to all connected `PaperCanvasPanel` instances via SSE. Defined in `vite.config.js` as Vite server middleware plugins.

### POST /api/draw

Validates the body against `DrawCommand` (Zod discriminated union in `src/api/schema.js`) and broadcasts it to all SSE clients.

**Text command:**
```bash
curl -X POST http://localhost:5173/api/draw \
  -H 'Content-Type: application/json' \
  -d '{
    "type": "text",
    "content": "Hello world",
    "size": 32,
    "font": "Caveat",
    "color": { "r": 30, "g": 38, "b": 58 },
    "region": { "x": 20, "y": 20, "width": 760, "height": 560 },
    "jitter": 0.025
  }'
```

All fields except `type`, `content`, and `region` have defaults (`size`: 32, `font`: "Caveat", `color`: dark navy, `jitter`: 0.025).

The `region` field isn't just a bounding box for layout — it drives the GPU scissor rect. The simulation pass only processes texels inside the active bounds (expanded from stamp regions), so a tighter region means fewer fragments processed per frame. On large canvases this matters: a 200x50 text region on an 800x600 canvas simulates ~3% of the texels instead of 100%.

**Rect command** (fills immediately, no animation):
```bash
curl -X POST http://localhost:5173/api/draw \
  -H 'Content-Type: application/json' \
  -d '{
    "type": "rect",
    "region": { "x": 10, "y": 10, "width": 100, "height": 100 },
    "color": { "r": 30, "g": 38, "b": 58 }
  }'
```

**Path command** (schema defined, not yet implemented):
```json
{ "type": "path", "d": "M 10 10 L 50 50 ...", "region": { ... }, "color": { ... } }
```

### DELETE /api/draw

Clears the canvas (resets all ink and wetness).

```bash
curl -X DELETE http://localhost:5173/api/draw
```

### GET /api/draw/stream

SSE endpoint. `PaperCanvasPanel` holds this open to receive broadcast commands. Not typically called manually.
