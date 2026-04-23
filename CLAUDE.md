# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Web app (Vite + React 19)
- `npm install` — install JS deps
- `npm run dev` — dev server on port 3000 (auto-opens); hot-reloads, **do not restart during iteration**
- `npm run build` — production build via Vite
- `npm run preview` — serve the built `dist/`

Routes (all under the dev server):
- `/` — main Dossier app
- `/matlack` — letter-synthesis canvas (Matlack handwriting R&D)
- `/review?letter=<a|b|f>` — 3×3 candidate review grid; saves JSON to `reviews/`
- `/crinkly`, `/inky` — paper-physics demos

### Python analysis (uv-managed; **use `uv run`, not bare `python`**)
- `uv sync` — install deps from `pyproject.toml` (pillow, scipy, fonttools, ufo2ft, defcon; pytest+hypothesis in dev)
- `uv run pytest` — run the test suite (pytest + Hypothesis property tests; `testpaths = ["tests"]`)
- `uv run pytest tests/path/to/test_x.py::test_name` — single test
- `uv run python matlack/tools/fit_paths.py <svg_path_file> [--egg]` — fit ellipses/eggs to traced paths

### Font pipeline
1. `node scripts/export_glyphs.mjs` (or the "export json" button in `/matlack`) → writes `matlack-glyphs.json`
2. `uv run python scripts/build_font.py matlack-glyphs.json matlack-draft.otf` → builds the draft OTF

### Dev-server API (used by `snap.sh` and tools; see `vite.config.js`)
- `POST /api/draw` / `DELETE /api/draw` / `GET /api/draw/stream` (SSE) — broadcast draw commands to `PaperCanvasPanel`; schema in `src/api/schema.js`
- `GET /api/outlines?letter=<x>&overrides=<json>` — component outlines for geometric analysis (Shapely, etc.)
- `POST /api/review` — saves review-grid JSON (gitignored `reviews/`)
- `POST /api/sync` — overwrites `dossier-state.json`
- `GET/POST /api/anchors`, `GET /api/contexts` — anchor-labeling for reference-scan tracing
- `POST /api/open` — open a project-relative file in GIMP
- `GET/POST/DELETE /api/telemetry` — stroke-telemetry inspection

**The review/anchors/open endpoints are local-dev only — no auth, no rate limiting. Do not productionize.**

## Architecture

Dossier has **two largely independent subsystems** sharing a Vite dev server:

### 1. Dossier entry tracker (`src/Dossier.jsx`, `src/prompts/`)
- Single-page React app. People / Factions / Locations entries with a tag system (role, faction, mood, trait, location, relationship).
- Prompt generation: each tag maps to a template in `TAG_PROMPTS` (keyed by `tag` or `tag:type`), plus `UNIVERSAL_PROMPTS[type]`. See `src/prompts/promptBank.js`.
- State persists in `localStorage`. `SEED_DATA` seeds a fresh localStorage — **clear localStorage to pick up seed changes**.
- Developer vs. player "mode": same prompt pools, different restrictions. Players have a prompt budget per **sitting** (not "session").

### 2. Matlack handwriting R&D (`src/styles/`, `matlack/`)
Two rendering systems that can be composited:
- **Paper canvas** (`InteractivePaperCanvas.jsx` + `inkText.js`): WebGL2 ink simulation. `inkText.js` plans trajectories (natural cubic spline → 2/3 power law velocity → min-jerk endpoint taper → 10 Hz tremor → nib-angle stamps). `InteractivePaperCanvas` runs the ping-pong ink/wetness simulation on the GPU. See `src/styles/README.md` for the full motor-neuroscience/ink-physics writeup.
- **Matlack WebGL glyph renderer** (`MatlackCanvas.jsx`, `MatlackRenderer.jsx`, `matlackGlyphs.js`): per-letter component geometry (fatBar, hairline, downstroke, bowls) with override offsets. Used by `/matlack` and the `/review` grid.
- `matlack/` holds reference scans, analysis notes (`analysis/*.md`), hand-traced path data (`reference/context/<word>/NN_paths/`), and the Python `tools/fit_paths.py`. The tracing + fitting workflow is documented in `matlack/reference/context/workflow.md`.
- See `memory/project_matlack_architecture.md` for the cross-system merge strategy and per-letter status.

### Routing
`src/App.jsx` uses `react-router-dom` v7 — add a `<Route>` there when introducing a new demo page.

### Data flow for `snap.sh` → canvas
`snap.sh` POSTs JSON to `/api/draw`; the Vite `drawPlugin` validates via Zod (`src/api/schema.js` `DrawCommand`), then broadcasts over SSE to every connected `PaperCanvasPanel`. So `snap.sh` will silently no-op if no `/` page is open in the browser.

## Project Rules

### Memory access
- **Don't proactively read** `reference_narrative_ledger.md` or `project_game_world.md` unless the task involves story, world, or character content, or the user directs you to.
- These files exist so you *can* reference them when needed — just don't load them for routine code tasks.

### General
- Dossier is a creative project. Respect authorial intent — when in doubt about narrative decisions, ask.
- Keep `SEED_DATA` in sync with the user's current vision. Clear localStorage to pick up seed changes.

### What is Dossier? (& terminology)
- Dossier is a noir TTRPG/video game RPG tool for tracking design or interpretation of People, Factions, and Locations.
- Dossier's Imaginative Mode prompts the app's users with suggestions informed by a system of tags.
- Dossier has a "developer" mode (used by the user you work with) for taking notes which tend to be for ideation about People, Factions, and Locations.
- Dossier has a "player" mode (used by the user you work with and future playerbase) for suggesting moods about People, Factions, and Locations.
- To support the subtle differences in use cases for developer and player mode, developers and players draw from the same prompt pools, but with different restrictions.
- Players have a prompt budget per Dossier usage "sitting". (Not "session".)

### Current technical goals
- Prompting: improve the mood, atmosphere, and utility of Imaginative Mode's prompts as the user develops narrative and worldbuilding foundations.
- Stylistic: develop realistic and appealing animation styles for rendering text and basic shapes ("eye-candy")

### Future technical goals
- Stylistic: even more realistic appearance for player-mode Dossier (paper flutter, coffee stains, and more complicated doodles)
- Simulation/numerical: learning and developing heuristics, rules, shaders, etc. to support Dossier's "real paper" stylistic goals.
* Paper texture
* Ink physics
* Motion-planning for animated writing and doodling

### Narrative goals
- You won't usually be giving input on these, but when it's time and the user prompts you, `reference_narrative_ledger.md`, `project_game_world.md`, and `dossier-state.json` are good sources of information you should refer to.

### Tools to help you
If you're working on handwriting or styling, you can do ./snap.sh clear → ./snap.sh text "whatever", then read for_claude.png to see the result, all without the user in the loop. Usage:                 
```
  ./snap.sh                          # just screenshot
  ./snap.sh clear                    # clear canvas + screenshot
  ./snap.sh text "Hello world"       # draw text, wait 5s, screenshot
  ./snap.sh text "Big" --size 64     # with options (--size, --font, --wait)
  ./snap.sh file payload.json        # send arbitrary draw command JSON
```

If you don't see Firefox in the snapshot, pause and ask the user to switch the Firefox tab back to Dossier.

### Visual processing on reference scans
- Matlack reference scans live under `matlack/reference/context/<word>/NN.png`. You can reliably read rule lines (long thin horizontal bands) off these, but you **cannot** read soft ink-edge features to pixel precision — visual tokens are not pixel data, and there's no self-correction signal on a bad guess.
- Expect ~10-20 svg-unit error on ink-edge guesses (where a t's downstroke ends, where an o's bowl starts, etc.) when reading the raster directly.
- When precision matters, use the hand-traced path data at `matlack/reference/context/<word>/NN_paths` instead. See `matlack/reference/context/workflow.md` for the full tracing workflow.
- If no path data exists for the letter you need, **ask the user to trace it** before fine-tuning anchor coordinates. Do not fabricate pixel positions from the scan.
