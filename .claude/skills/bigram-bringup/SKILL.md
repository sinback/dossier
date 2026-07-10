---
name: bigram-bringup
description: Bring up ONE lowercase letter's low-band joins (rules, band-true connectors, anchors, variants, pair tests, font) so more bigrams go green on /matlack-bigrams.html. Use when asked to bring up a letter or make a low-exit→low-entrance bigram ready. One letter per invocation.
---

# Bigram bring-up (low band)

You are bringing up **one letter** so its low-band joins work end to end:
geometry composer → pair tests → built OTF. The recipe below is the
distilled t/h bring-up (2026-07-10, commits c6bb57b..43cfc2f) plus the
older m/r/e precedents. Follow it; don't improvise new machinery. If the
letter genuinely breaks the recipe, STOP and report — don't invent
geometry (that rule comes from sinback).

## Scope guard

- ONE letter per skill invocation. Its bigram partners must already be
  registered (check `GLYPH_JOIN_ANCHORS` in `src/styles/matlackGlyphs.js`).
- LOW joins only: the letter's rules-table row (`lowercase_rules_table.txt`)
  must say entry-y and exit-y are `rule.y-bottom` flavors. Letters with
  y-center entries (n, x) or high exits (b, f, o, v, w) are out of scope —
  report back instead of stretching the recipe.
- Base letterforms are LOCKED. You touch entry/exit connectors, rules,
  anchors, registration, variants — never the body shape. (Variant-
  dependent truncation of a traced mid-word tail is allowed — h precedent —
  because the exit:'none' forms keep the original look.)
- Do NOT revisit deprioritized seams: o→e, r→r, f.entry, m.exit, and the
  known font-level 2-component words below.
- No new hand-traced data is coming. If the letter has no
  `matlack/reference/lowercase/<letter>/01_paths` (SVG trace), STOP and
  ask sinback to trace it. Never read soft ink edges off scans — rule
  lines and traced paths only (expect 10–20 su error on raster guesses).

## Required reading (in order, before editing)

1. `matlack/analysis/join-architecture.md` — the band-true model, worked
   example, coordinate notation. This is the constitution.
2. The letter's row + NOTES in `lowercase_rules_table.txt`.
3. In `src/styles/matlackGlyphs.js`: the t constants block
   (`T_RULE`/`T_EXIT_BAND_SEGS`/`T_JOIN_ANCHORS` + `buildT`) and the h
   block (`H_RULE`/`H_ENTRANCE_LOW_SEGS`/`H_EXIT_BAND_SEGS` + `buildH`)
   — they are the two most recent worked precedents, with the traps
   documented in comments.
4. `matlack/analysis/lorem-ipsum-plan.md` if your letter is l, u, i, p, or
   s — it has per-letter traps (i's detached dot, p's descender, s's
   hardness).

## File-collision protocol (parallel agents)

Shared files — only ONE agent may be in a bring-up at a time for these:
- `src/styles/matlackGlyphs.js`, `src/styles/matlackSVGExport.js`
- `matlack-glyphs.json`, `matlack-draft.otf`, `public/fonts/` (never run
  `export_glyphs.mjs`/`build_font.py` concurrently with another agent)

Per-letter files — safe to create in parallel:
- `tests/matlack/context/<pair>/test_<pair>_coarticulation.py`
- scratch renders under `matlack/renders/_scratch/`

If you were launched alongside other bring-up agents: do all your
read-only analysis and `derive_band.py` derivations first, write your
tests, and only then take the shared-file critical section (check
`git status` — if another agent has uncommitted changes to the shared
files, wait or report back rather than editing). Commit atomically per
letter so the next agent starts clean. The orchestrator serializes font
rebuilds at the end if several letters land together.

## The recipe

Definitions: the letter's local frame is its trace's SVG units ("su");
`xh = yBottom − yCenter`; y grows downward. Dev server must be running
(it hot-reloads — NEVER restart it). Python via `uv run`, never bare.

1. **Derive GLYPH_RULES** from anatomy anchors in the trace (never from
   eyeballing the scan): feet/valleys sit ON the baseline (downstroke
   feet may hook 0–5% xh below); short-letter tops / hump-start knobs /
   bowl tops sit at yCenter; t-like crossbars cross the bar at ~x-height.
   Ascenders in this hand reach ~2.8 xh (f/t/h all agree) and tops reach
   ~90% of yTop. Cross-validate against context traces
   (`matlack/reference/context/*/`) when the letter appears in one.
2. **Check for live offsets.** If the build function applies a nonzero
   `*_OFFSET` via `resolveOffset` to a component you're anchoring, BAKE
   it into the seg coordinates first and zero the offset. `resolveOffset`
   scales by dpr but NOT by size/100, so live offsets mean different su
   at render size 100 vs font-export size 200 — h's font stroke landed
   2 su off its anchors this way.
3. **Exit connector** (mid-word, `exit:'low'`):
   `uv run python matlack/tools/derive_band.py low --xh <xh> --ybottom
   <yBottom> --anchor-x <A> --fade-len 6`.
   Pick `A` so the slice START lands **inside the body's baseline exit
   ink** (t: dead center of the fat-bar foot → zero bridge) — this also
   preserves the scan's natural spacing. If the start would sit past a
   ribbon END CAP rather than inside ink, author a short bridge FROM the
   body centerline a few su back (h precedent: 0.5 su past the cap was
   connected at compose scale by sampling luck but shipped as a floating
   ink island in the OTF).
   `fadeStart`: hold full hairline ~1 su PAST the anchor, fade only over
   the last few su. (Fading at the anchor → coart 0.58; a long thin tail
   → 0.48; the short-hold profile → 0.63+.)
4. **Entry connector** (mid-word, `entry:'low'`): band-true slice,
   `derive_band.py low ... --anchor-x <entry anchor x> --skip-head 12.1
   --fade-len 6`, bridged onto the traced entrance line, which then
   carries to the body junction. Do NOT just extend the traced entrance
   as a straight line — against a band-true partner it crosses at a
   shallow angle instead of riding (t→h scored 0.07 that way; band-true
   conversion → 0.70). Keep the traced entrance as the word-initial form:
   isolated-letter traces give word-EDGE forms (they hang at 40–56%
   x-height; r lesson).
5. **Traced mid-word exit tails**: if the trace already contains a
   letter→next tail, compare it to the canonical band. If it diverges
   (h's rose at ~36° vs the band's baseline crawl, 13 su apart mid-band),
   truncate it in `exit:'low'` variants (remap the width function's arc
   fraction — see buildH) and keep it for `exit:'none'` fina/isol.
6. **Render + register.** Connector ribbons use `buildConnectorRibbon`
   with rule-consistent hairline `0.65 × xh/60` (per-letter constant).
   Label fills: `'body'` / `'entrance'` / `'exit'` — the pair tests
   isolate components by label. Register ALL of: `GLYPH_RULES`,
   `GLYPH_JOIN_ANCHORS` (entry variant-keyed `{low: {x,y}}`, exit plain
   point; y is FORCED — 15.6% xh above baseline for low, printed by
   derive_band; only x is yours), `VARIANT_SUPPORT` (supported[0] = the
   mid-word default; afterHigh forms go in notYet), `joinSegsForVariant`,
   `GLYPH_REF_CENTERS`, and the `buildGlyph` case must pass `variant`
   through. Anchors/rules must be in the RENDERED frame (offsets baked —
   step 2).
7. **Pair tests, then compose.** Copy
   `tests/matlack/context/to/test_to_coarticulation.py` for each new
   bigram (both directions if both are registered): component
   coarticulation > 0.6 (band-true pairs must reconstruct the trace),
   components == 1, |drift| < 1.5. Then
   `uv run python matlack/tools/compose_word.py "<pair>"` and a word if
   one is greenlighted. Full `uv run pytest` — the frozen oreo/from
   seam values must not move.
8. **Font.** Add the letter to `VARIANT_EXPORTS` in
   `src/styles/matlackSVGExport.js` (default = mid-word, plus init/isol,
   fina only if the traced word-final form differs from the connector).
   calt init/isol/fina lookups and the afterHigh entry-none guards are
   GENERATED from VARIANT_EXPORTS — you should not hand-write FEA.
   Rebuild: `node scripts/export_glyphs.mjs && uv run python
   scripts/build_font.py matlack-glyphs.json matlack-draft.otf`.
9. **Font verification gate:**
   `uv run python matlack/tools/shape_check.py "<your test words>"
   --glyphs <letter> <letter>.init <letter>.isol` — exit code 0 required
   for YOUR words/glyphs: correct variant picks, |dy| ≤ 2, one
   substantial ink component per word and per glyph.
   KNOWN BASELINE (pre-existing, deprioritized — do not fix, do not
   regress further): "or" and "fr" (and hence "oreo"/"from") report 2
   components — the HIGH-band seams into r.afterHigh split at font
   integer precision.
10. **Commit atomically** (constants+build in one commit, tests with it
    or separate, font rebuild separate — mirror commits c6bb57b/5c1ca25/
    43cfc2f), with seam numbers in the message. Update nothing in
    `matlack/renders/milestones/` unless the orchestrator asks.

## Report back

State per seam: coart, drift, kink, components (compose) + shape_check
results (font), what you did for bridges/truncation, and anything you
had to decide that the recipe didn't cover. Aesthetic doubts: do NOT act
on them — render at small size; if the problem survives shrinking,
measure it; if you can't measure it, name the missing metric. Taste
calls are sinback's.

## Terminology

Never write bare "slant": ⬭ = nib angle, 📐 = pen-to-paper angle,
⟋ = penmanship slant. Isol (`{entry:'none', exit:'none'}`) is the
BASELINE form; flicks are additions, not the default.
