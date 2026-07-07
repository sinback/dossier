# Join architecture — canonical bands & coarticulation

How cross-glyph joins work in this project, distilled from the o→r and e→o
close studies (2026-07). "Coarticulation" is the handwriting-analysis term
(per sinback) for adjacent letters sharing one stroke — our joins must
*reconstruct* the shared stroke, not merely touch.

## The model

- Mid-word entry/exit strokes are **connectors**: continuous hairlines
  (`buildConnectorRibbon`), never pen-lift tapers (`buildTaperedRibbon` is
  for terminal/word-edge flicks only). Width holds constant through the
  join band; `bodyWidth` option blends into the letter body.
- Each glyph owns a **slice** of the inter-letter transition: from its body
  to its join anchor plus a short fade tail (~5-8 su). The neighbor's slice
  covers the band from the other side; the curs overlay reconstructs the
  full transition.
- **Band-true slice rule:** the in-band portion of a connector is a
  rule-consistent-scale copy of the canonical band trace, pinned at the
  human-picked scan anchor. Adaptation to the glyph's own body happens in
  an authored BRIDGE segment — never by warping the band. (Warping is the
  pre-hiatus failure mode: o's exit stretched ~2 scan-units of trace across
  its whole bowl→band span, killing coarticulation with r.)
- **Anchors:** each glyph's curs anchor is the SAME scan point of the
  canonical trace, mapped through that glyph's own placement transform.
  Anchor y is then forced by rule consistency (equal height fraction above
  each frame's baseline) — this is what keeps baselines drift-free, since
  curs aligns anchor points and nothing else. Anchor x is the glyph's
  spacing choice.

## Coordinate notation (used throughout)

Every glyph has a local frame in "su" (its own trace's SVG units). Its
rule lines live in that frame: `yBottom` (baseline) and `yCenter`
(x-height top), so `xh = yBottom - yCenter` (y grows DOWNWARD — image
coords — so "below the curve" means larger y). "xh 41, yBottom 137" means:
this glyph's x-height spans local y 96..137. Frames differ in scale per
letter; anything cross-letter (hairline width, band slices, seam metrics)
must be made rule-consistent by scaling with xh — the composer and
build_font.py both normalize to a common x-height via these rules.

## Canonical bands (pinned per sinback — do not generalize to bo/etc. yet)

- **high** — or/01 path2 ('o Exit → r Entry'); scan anchor (46.22, 30.11);
  scan xh 25.81, baseline 48.56. Anchor sits at 71.6% of x-height.
- **low** — to/01 path3 ('t Exit Flick → o Entry'); scan anchor
  (41.25, 71.64) (sinback-picked; it sits ~0.5 scan-su on the baseline
  side of the traced curve — anchors may float slightly off-curve, and
  band-true PAIRS inherit the offset consistently so it cancels).
  Scan rules yCenter 48 / yBottom 76 (xh 28). Anchor at ~15.6% x-height.

## Worked example — giving a letter a band-true connector

How m got its afterHigh entrance (repeat this recipe for any new letter):

1. Know the glyph frame: m's rules are `M_RULE = {yCenter: 37.6,
   yBottom: 86.7}` (xh 49.1). If the letter has no GLYPH_RULES entry yet,
   derive them from its trace/scan first and register them.
2. Emit the slice:
   `uv run python matlack/tools/derive_band.py high --xh 49.1
   --ybottom 86.7 --anchor-x 62.55 [--skip-head 23] [--fade-len 6]`
   — `anchor-x` is the spacing choice (here picked so the trace END lands
   on the humps start; solve `anchor_x = body_pt.x - s*(trace_end_scan.x
   - anchor_scan.x)`); anchor **y** is printed (forced by rule
   consistency — never choose it).
3. Paste the emitted seg arrays into matlackGlyphs.js as
   `<X>_ENTRANCE_HIGH_SEGS` (or `_EXIT_…`); author a BRIDGE segment from
   the slice's body-side end to the letter body if they don't meet
   (G1-ish tangents; never warp the slice itself).
4. Render with `buildConnectorRibbon(centerline, hairline*scale,
   fadeStart)` — hairline = 0.65 × xh/60 (constant physical pen width);
   fadeStart from the printed arc fractions, holding hairline a few su
   PAST the anchor so the overlap band stays full-width. Label the fills
   (`label: 'entrance'`/`'exit'`) so component tests can isolate them.
5. Register: GLYPH_JOIN_ANCHORS (anchor from step 2), VARIANT_SUPPORT,
   joinSegsForVariant (tangent metric), VARIANT_EXPORTS + calt (font).
6. Test-first: pair test in `tests/matlack/context/<pair>/` asserting
   component coarticulation > 0.6, then
   `uv run python matlack/tools/compose_word.py <pair>` until green.
   Check the alphabet sheet for regressions; commit atomically.

## Measurement (matlack/tools/compose_word.py)

Per-seam: ink overlap, components-in-disc, baseline drift (<1.5 su), kink
(PCA stroke directions; low joins are collinear handoffs, <15°), and
**coarticulation ratio** (shared ink over the smaller near-region). The
strict ≥0.6 coarticulation bar applies to seams whose slices derive from
one shared trace — enforced in pair tests (tests/matlack/context/<pair>/).
Independently-authored connectors score lower while looking right (r→e,
sinback-approved as perfect, scores ~0.25), so the composer's verdict only
uses a 0.05 offset-parallel sanity floor.

## Word-position forms (from the traces)

Isolated-letter traces give word-EDGE forms, not mid-word connectors:
- r/01's entrance hangs at 52% x-height → that's the word-initial form;
  the mid-word low entrance extends to the low band.
- for/01 path1 is titled 'r Downstroke → r Exit (terminal)' → the
  R_EXIT_SEGS flourish is the word-final form (kept for the future fina
  variant); mid-word r exits via the band-true connector
  (R_EXIT_BAND_SEGS; r→o scores 0.67).

## "from" bring-up (completed 2026-07-07)

All landed; seams f→r 0.64, r→o 0.67, o→m 0.67, r→e 0.75 (see
`matlack/renders/milestones/`):

- f.exit = or/01 band slice bridged from the stem (traced for/01 path4
  survives as the bridge's departure tangent); f registered for curs,
  entry still word-initial-only.
- r's mid-word exit = to/01 band slice (trace start pinned to the
  afterHigh loop end; default body reaches it via a baseline bridge);
  traced flourish exits kept for future fina forms. e's low entrance
  followed (the hand-authored dip couldn't coarticulate with a band-true
  partner — mixed pairs don't inherit the scan anchor's off-curve offset).
- m brought up from nothing: trace-derived M_RULE (yCenter = humps-start
  knob 37.6, yBottom = valleys 86.7), three entrance forms (init = the
  traced m/01 flourish), band-true low/high entrances.
- Font: m variants + calt; two FEA gotchas found via uharfbuzz — bare
  ignore/sub groups merge into one poisoned lookup (wrap each group in an
  explicit `lookup` block), and context classes must include substituted
  variant glyphs (@high_exit needs o.init/o.afterHigh). Preview page:
  /matlack-preview.html (FontFace + Date.now() cache-buster).

Open gaps (measured): o→e 0.19 (e.entry.high not band-true), r→r
tip-to-tip, f mid-word entry, m.exit not band-true.
