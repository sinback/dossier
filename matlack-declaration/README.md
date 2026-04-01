# Matlack Declaration — Stroke Animation R&D

Reference material and analysis for reproducing Timothy Matlack's hand
from the 1823 Stone facsimile of the Declaration of Independence.

## Directory layout

- `reference/` — Cropped letter samples from the facsimile, organized by case and letter.
  Calligraphic variants (blackletter 'a' from the preamble, etc.) are separate.
- `analysis/` — Observations derived from reference images. Each claim cites
  specific reference files. Treat observations as hypotheses until confirmed by rendering.
- `renders/` — Our WebGL output, per-letter. Filenames include the git short hash
  that produced them (e.g., `a_03_ea95434.png`).

## Source image

The reference images were extracted from a high-resolution (51.6 MB TIF) scan of
the 1823 William J. Stone engraved facsimile — a wet-transfer + hand-engraved
copper plate reproduction made from the original parchment. The facsimile preserves
Matlack's stroke dynamics (thick/thin from quill pressure) with high fidelity.

## Convention

- Analysis files cite references as `ref lowercase/a/03.png`.
- Observations note confidence: **observed** (directly visible), **inferred** (from
  ink physics), **speculative** (plausible but unconfirmed).
- Renders note the commit hash and any relevant parameters.
