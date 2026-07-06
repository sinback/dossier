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

## Canonical bands (pinned per sinback — do not generalize to bo/etc. yet)

- **high** — or/01 path2 ('o Exit → r Entry'); scan anchor (46.22, 30.11);
  scan xh 25.81, baseline 48.56. Anchor sits at 71.6% of x-height.
- **low** — to/01 path3 ('t Exit Flick → o Entry'); scan anchor
  (41.25, 71.64) (sinback-picked, ~0.5 scan-su below the curve); scan
  rules yCenter 48 / yBottom 76 (xh 28). Anchor sits at ~15.6% x-height.

`matlack/tools/derive_band.py` emits paste-ready glyph-local seg arrays,
the forced anchor, and arc fractions for any glyph frame.

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
- for/01 path1 is titled 'r Downstroke → r Exit (terminal)' → the current
  R_EXIT_SEGS flourish is the word-final form; mid-word r needs a low-band
  connector exit (r→o currently scores 0.01 — offset-parallel, open gap).

## "from" bring-up plan (scoped 2026-07-06)

- f→r: f.exit = or/01 band slice (xh 41, yBottom 137 → anchor y 107.7);
  existing F_EXIT_SEGS (= traced for/01 path4) becomes bridge material from
  the stem. Register f in GLYPH_JOIN_ANCHORS. r.entrance already
  reconstructs the same band → coarticulates by construction.
- r→o: mid-word r.exit = to/01 band slice (anchor ~(74, 85.3)) + bridge
  from the bottom loop; keep current R_EXIT_SEGS for the future fina form.
  o.entry.low is already band-true (e→o work).
- o→m: m bring-up — M_RULE is trace-derived (no rule lines in the m/01
  crop): yCenter ≈ hump tops ~42, yBottom ≈ valleys ~87. Register rules /
  ref center / anchors; m.entrance.high = or/01 band slice + bridge to the
  humps start; exit stays terminal (word-final in "from").
- Tests: pair tests fr/, ro/, om/ + word battery; then the font-context
  generalization check (export → build_font → shaped rendering).
