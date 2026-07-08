# Dossier

This project started as a browser-based tool for tracking characters, factions, and locations — useful for worldbuilding, game development ideation, and tabletop RPG play.

It became a WIP text-rendering and font-generation tool inspired by Thomas Matlack's penmanship on the Decllaration of Independence.

## Features (main project — not the current focus)

- Three entry types: People, Factions, Locations
- Tag system (role, faction, mood, trait, location, relationship) for organizing entries
- Per-entry notes and a quick-thought journal
- Imaginative mode: generates context-aware prompts from an entry's tags to spark ideas
- Export to JSON for backups
- All data persists in localStorage

## Features (experimental — not the current focus)
- Paper physics and handwriting kinematics simulation

## Features (the current focus)
- Tools for analyzing penmanship and synthesizing letters evocative of them
- Tools for easing human-in-the-loop tweaks ("reviews") for synthesized letters
- Early-stage font generation scripts, using the synthesized letters as starting points

## Human-authored reference materials
- handwriting_manuals/ are detailed instructions written for humans on how to write (either in general, modern-day script, or in Copperplate, which is Matlack's hand and hte main area of focus currently). Don't read these unless you're told — they take a lot more effort than the user has credits for for you to just peruse them willy-nilly. They can tell you specific pages to focus on if it's ever relevant.
- papers/ are papers written about the kinematics of handwriting. You are allowed to read them.

## Rules for research
- You can do web searches about handwriting (shapes, aesthetics, kinematics, etc). Don't try to use HTML summaries — those are known to not be very useful for research. You can wget pdf versions yourself, or ask the user to help download them if that fails.

## Running locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000` to play with the paper physics sim tools (not our focus), or `http://localhost:3000/matlack` if you're developing letter synthesis (our focus).

### Review grid (human-in-the-loop tool, not our focus)

`http://localhost:3000/review?letter=f`

A 3×3 candidate scoring tool for evaluating letter variations during development. The `?letter=` query parameter is required (supported: `a`, `b`, `f`).

Each candidate card shows a rendered letter with a specific set of component offset overrides (displayed on the card), and provides:
- Red / yellow / green judgment
- "Talk about it later" checkbox for flagging interesting candidates
- Free-text comment (140 chars)

Clicking **Save JSON** writes a timestamped file to `reviews/`:

```
reviews/matlack-review-f-2026-04-03T22-46-07-356Z.json
```

The JSON format:
```json
{
  "savedAt": "2026-04-03T22:46:07.352Z",
  "letter": "f",
  "candidates": [
    {
      "id": "candidate-1",
      "title": "Candidate 1",
      "renderSpec": {
        "kind": "grid-search",
        "overrides": {
          "fatBar": { "dx": 0, "dy": -10 },
          "hairline": { "dx": 8, "dy": -2 }
        }
      },
      "judgment": {
        "label": "red",
        "talkAboutLater": false,
        "comment": "fat bar barely overlaps bar-bowl"
      }
    }
  ]
}
```

The `reviews/` directory is gitignored. Overrides are in CSS pixels before DPR scaling.

**Do not productionize the review endpoint.** The `/api/review` route has no authentication, rate limiting, or input size validation — it writes directly to disk via the Vite dev server. It is a local development tool only.

### Outline export

`GET http://localhost:3000/api/outlines?letter=f`

Returns component outlines as coordinate arrays in ref-pixel space, for geometric analysis with Shapely or similar tools. Accepts an optional `overrides` query param (URL-encoded JSON, same format as `renderGlyph` overrides).

```bash
# Default offsets
curl 'http://localhost:3000/api/outlines?letter=f'

# With overrides
curl 'http://localhost:3000/api/outlines?letter=f&overrides={"fatBar":{"dx":12,"dy":-8}}'
```

Bowl components return `{ inner: [[x,y],...], outer: [[x,y],...] }`. Polygon components (fatBar, hairline, downstroke) return `[[x,y],...]`.

## Python analysis tools (important)

The `matlack/tools/` directory contains analysis scripts for handwriting and glyph development.

### Setup

```bash
# Ensure you have Python 3.9+ via pyenv (or your preferred version manager)
pyenv local 3.13  # or your preferred version

# Install dependencies via uv
uv sync
```

Then run analysis scripts from the repo root:

```bash
uv run python matlack/tools/fit_paths.py <svg_path_file>
uv run python matlack/tools/fit_paths.py <svg_path_file> --egg  # also fit egg curves
```

### Development

Run tests:

```bash
uv run pytest
```

Tests use pytest and Hypothesis for property-based testing.

## Stack

React 19, Vite, WebGL2.

## Documentation

- [Ink & Paper Rendering System](src/styles/README.md) — stroke kinematics, nib geometry, WebGL ink simulation, and all the motor neuroscience math behind the handwriting animation.
