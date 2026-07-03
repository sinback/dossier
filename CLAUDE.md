# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Before you do anything else:
- Note that you are Claude Fable 5. You're not like the other Claude agents that have worked on this project in the past. This CLAUDE.md was specifically updated for you, but there might still be parts of it written with more human-in-the-loop ideas in mind. You're supposed to work smarter and consult the user less than previous agents. The user has pretty limited usage limitations with you, though, so you can ask for clarification if you find you're getting really deep in the weeds. We want to avoid you being in the middle of an important thought stream when the usage limits run out, because that would be counterproductive.
- Read the README.md, which has been updated with your needs in mind as well as standard README fare like usage instructions.
- Always remember that right now we're focusing on the Matlack project (we're on git branch feat/matlack), which has cost at least 20x the development effort of the rest of the project (which is just a vibe-coded TTRPG tool). The project includes the non-matlack vibe-coded stuff because it's been convenient to not remove it, not because we're working actively on it right now.

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

### 1. Dossier entry tracker (`src/Dossier.jsx`, `src/prompts/`) (not the current focus)
- Single-page React app. People / Factions / Locations entries with a tag system (role, faction, mood, trait, location, relationship).
- Prompt generation: each tag maps to a template in `TAG_PROMPTS` (keyed by `tag` or `tag:type`), plus `UNIVERSAL_PROMPTS[type]`. See `src/prompts/promptBank.js`.
- State persists in `localStorage`. `SEED_DATA` seeds a fresh localStorage — **clear localStorage to pick up seed changes**.
- Developer vs. player "mode": same prompt pools, different restrictions. Players have a prompt budget per **sitting** (not "session").
- `sync_to_obsidian.py` (repo root) appends `dossier-state.json` entries to the user's Obsidian vault — narrative-side tooling, not Matlack.

### 2. Matlack handwriting R&D (`src/styles/`, `matlack/`) (the current focus)
Two rendering systems that can be composited:
- **Paper canvas** (`InteractivePaperCanvas.jsx` + `inkText.js`): WebGL2 ink simulation. `inkText.js` plans trajectories (natural cubic spline → 2/3 power law velocity → min-jerk endpoint taper → 10 Hz tremor → nib-angle stamps). `InteractivePaperCanvas` runs the ping-pong ink/wetness simulation on the GPU. See `src/styles/README.md` for the full motor-neuroscience/ink-physics writeup.
- **Matlack WebGL glyph renderer** (`MatlackCanvas.jsx`, `MatlackRenderer.jsx`, `matlackGlyphs.js`): per-letter component geometry (fatBar, hairline, downstroke, bowls) with override offsets. Used by `/matlack` and the `/review` grid.
- `matlack/` holds reference scans, analysis notes (`analysis/*.md`), hand-traced path data (`reference/context/<word>/NN_paths/`), and the Python `tools/fit_paths.py`. The tracing + fitting workflow is documented in `matlack/reference/context/workflow.md`.
- See `memory/project_matlack_architecture.md` for the cross-system merge strategy and per-letter status.

### Routing
`src/App.jsx` uses `react-router-dom` v7 — add a `<Route>` there when introducing a new demo page.

### Data flow for `snap.sh` → canvas
`snap.sh` POSTs JSON to `/api/draw`; the Vite `drawPlugin` validates via Zod (`src/api/schema.js` `DrawCommand`), then broadcasts over SSE to every connected `PaperCanvasPanel`. So `snap.sh` will silently no-op if no `/` page is open in the browser.

Known issue (see `TODO.txt`): the DELETE `/api/draw` clear sometimes leaves a faint white "shadow" on the paper; a browser refresh truly clears it. Don't mistake the shadow for freshly drawn ink when reading `for_claude.png`.

## Project Rules

### Memory access
- **Don't proactively read** `reference_narrative_ledger.md` or `project_game_world.md` — they're not the current focus of the project.

### What is Dossier? (& terminology) (not currently relevant)
- Dossier is a noir TTRPG/video game RPG tool for tracking design or interpretation of People, Factions, and Locations. You can review it since its webserver backbone and some React components are tied in to the Matlack research you're actually focusing on, but you shouldn't think about it too hard. Here's a summary:
- Dossier's Imaginative Mode prompts the app's users with suggestions informed by a system of tags.
- Dossier has a "developer" mode (used by the user you work with) for taking notes which tend to be for ideation about People, Factions, and Locations.
- Dossier has a "player" mode (used by the user you work with and future playerbase) for suggesting moods about People, Factions, and Locations.
- To support the subtle differences in use cases for developer and player mode, developers and players draw from the same prompt pools, but with different restrictions.
- Players have a prompt budget per Dossier usage "sitting". (Not "session".)

### Past technical goals (irrelevant, but some vestigial aspects remain in the codebase)
- Prompting: improve the mood, atmosphere, and utility of Imaginative Mode's prompts as the user develops narrative and worldbuilding foundations.
- Stylistic: develop realistic and appealing animation styles for rendering text and basic shapes ("eye-candy")

### Current technical goals
To proceed with this, you need to improve your ability to do this process without a human in the loop. Here are your IMPORTANT and high-level goals:
- Make beautiful and realistically-rendered characters on WebGL canvases to prototype fonts. The user should look at these as little as possible, but should check them when it feels right to you. Mostly, you should work on your own ability to analyze rendered characters to see if they're good relative to the hand-captured and hand-annotated Bezier curve data we already have for the project. You can ask the user to double-check your work when it feels right to you.
- Use those rendered characters to make .ttf files which include context-sensitive rules for letter joining.
- Once you have that down, start to understand how to fit your own Bezier handles or do whatever else you need to generate realistic handwriting letters in various different word-positional contexts. The user predicts they will run out of usage limits before getting here, but in case we do get here, stop and let the user know what your plan is.

### Future technical goals
- Stylistic: even more realistic appearance for player-mode Dossier (paper flutter, coffee stains, and more complicated doodles)
- Simulation/numerical: learning and developing heuristics, rules, shaders, etc. to support Dossier's "real paper" stylistic goals.
* Paper texture
* Ink physics
* Motion-planning for animated writing and doodling

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

### Reference materials & research (mirrors README rules)
- `handwriting_manuals/` — human-oriented instruction books (general penmanship, modern script, Copperplate — Matlack's hand). **Don't read these unless told**; they're expensive to peruse. The user can point you at specific pages when relevant.
- `papers/` — handwriting-kinematics papers. You **are** allowed to read these.
- Web research on handwriting (shapes, aesthetics, kinematics) is fine, but don't rely on HTML summaries — wget the PDF versions yourself, or ask the user to help download them if that fails.

### Visual processing on reference scans
- Matlack reference scans live under `matlack/reference/context/<word>/NN.png`. You can reliably read rule lines (long thin horizontal bands) off these, but you **cannot** read soft ink-edge features to pixel precision — visual tokens are not pixel data, and there's no self-correction signal on a bad guess.
- Expect ~10-20 svg-unit error on ink-edge guesses (where a t's downstroke ends, where an o's bowl starts, etc.) when reading the raster directly.
- When precision matters, use the hand-traced path data at `matlack/reference/context/<word>/NN_paths` instead. See `matlack/reference/context/workflow.md` for the full tracing workflow.
- If no path data exists for the letter you need, **ask the user to trace it** before fine-tuning anchor coordinates. Do not fabricate pixel positions from the scan.

### Angle terminology — use these glyphs to disambiguate

The word "slant" has been overloaded. When discussing angles, write one of:

- **⬭** (RAlt `n` `b`) — **nib angle**. 2D orientation of the broad-nib footprint on the page. Sets thick/thin distribution. Currently ~40° in `src/styles/README.md`.
- **📐** (RAlt `p` `t`) — **pen-to-paper angle**. 3D tilt of the pen shaft out of the page plane. Affects ink flow physics, not 2D glyph shape.
- **⟋** (RAlt `/` `/`) — **penmanship slant**. 2D lean of the letter itself within the page plane. Copperplate target ≈55° from horizontal; Matlack measured slightly different.

All three live in the 40°–55° range numerically, which is why collapsing them is easy and dangerous. Never write "slant" unprefixed in design discussion — pick one of the three above.

### "Simplest variant" ≠ "default variant"

For letters that support `{entry: 'none', exit: 'none'}` (the isol form), **that is the simplest variant** — a bare bowl with no flicks. Earlier thinking treated flicked forms as the "default" and isol as the exception; that framing is wrong and has been a recurring source of agent confusion. Isol is the baseline; entry and exit flicks are additions.

### Testing glyphs: Shapely-based topology

Scriptable "this is wrong" signals live under `tests/matlack/`, mirroring the structure of `matlack/reference/` (i.e. `tests/matlack/lowercase/<letter>/` and `tests/matlack/context/<word>/`). Tests hit the live dev server's `/api/outlines` endpoint; `tests/matlack/conftest.py` bails with a friendly message if the server is down (no per-test skip markers).

Topology checks come first (simple/closed rings, `outer.contains(inner)`, parametrized over supported variants). Shape-sanity checks (aspect ratio in ⟋-rotated bbox, ⟋-angle tolerance) come second. Flick-connectivity checks come after the outlines export grows entry/exit components. **Don't unit-test `buildO` internals** — anchor numbers change constantly, the math is trivial, and the tests don't catch the failures we actually care about.
