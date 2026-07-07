# Milestone renders

Checked-in proof images for the join/coarticulation work (2026-07, around
commits `b2b8356`..`cf82f2a`). Scratch renders live in the gitignored
`../_scratch/`; anything mission-critical gets promoted here with a dated
name. All are geometry rasters (`compose_word.py` / `render_glyph.py`)
except where noted.

- `2026-07_alphabet_geometry.png` — all 26 base glyphs (locked as
  good-enough neutrals per sinback).
- `2026-07_oreo_band_true.png` — "oreo" with every seam band-true.
  Letters alternate navy/red; black = coarticulated ink.
- `2026-07_oreo_BEFORE_r_band_swap.png` — the state sinback blessed
  ("r→e actually perfect") BEFORE r's exit went band-true. Kept for the
  pending route-change judgment: the new connector dips through the
  baseline band per to/01; the old one ran a direct diagonal.
- `2026-07_seam_re_band_true.png` — r→e close-up after the swap
  (coart 0.75, tangent kink 0.0°).
- `2026-07_seam_eo.png`, `2026-07_seam_fr.png` — e→o and f→r close-ups.
- `2026-07_oreo_from_geometry.png` — "oreo from", six seams green,
  via the geometry composer (curs-preview ground truth).
- `2026-07_oreo_from_font_shaped.png` — the same text shaped by the
  BUILT FONT through HarfBuzz (uharfbuzz; same engine as Firefox) —
  the font-context generalization check. Matches the geometry composer.
