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
  registered (check each partner's `joinAnchors` in its
  `src/styles/glyphs/<partner>.js` module, or the derived
  `GLYPH_JOIN_ANCHORS` served by `/api/join-data`).
- LOW joins only: the letter's rules-table row (`lowercase_rules_table.txt`)
  must say entry-y and exit-y are `rule.y-bottom` flavors. Letters with
  y-center entries (n, x) or high exits (b, f, o, v, w) are out of scope —
  report back instead of stretching the recipe.
- Base letterforms are LOCKED. You touch entry/exit connectors, rules,
  anchors, registration, variants — never the body shape. (Variant-
  dependent truncation of a traced mid-word tail is allowed — h precedent —
  because the exit:'none' forms keep the original look.)

## Per-letter module layout (2026-07-12 refactor)

Every letter's geometry now lives in its **own** module,
`src/styles/glyphs/<letter>.js`, exporting one default descriptor:
`{ letter, build, joinSegs?, exportOutlines, rule?, refCenter?,
joinAnchors?, structuralAnchors?, variantSupport?, variantExports?,
outerEllipse? }`. Shared geometry helpers (ribbon/taper/connector builders,
samplers, `resolveVariantPure`) live in `src/styles/glyphs/helpers.js`.

`src/styles/matlackGlyphs.js` is now just the aggregator: it imports every
letter module into a `GLYPHS` map and **derives** `GLYPH_RULES`,
`GLYPH_JOIN_ANCHORS`, `GLYPH_REF_CENTERS`, `GLYPH_STRUCTURAL_ANCHORS`,
`VARIANT_SUPPORT`, the `buildGlyph`/`exportGlyphOutlines` dispatch,
`glyphOuterEllipse`, and `joinSegsForVariant` from the descriptors —
**registry membership = descriptor field presence**. `matlackSVGExport.js`
derives `VARIANT_EXPORTS` from each descriptor's `variantExports`, in the
pinned `VARIANT_EXPORT_ORDER`.

Consequence for you: bringing up an EXISTING letter's low joins edits only
`src/styles/glyphs/<letter>.js` (+ its pair tests). You do NOT edit the
registries or the dispatch in matlackGlyphs.js — they update themselves.
- Do NOT revisit deprioritized seams: o→e, r→r tip-to-tip (obsolete
  note — r→r now scores 0.74 band-true), f.entry, m.exit, and the known
  font-level 2-component words below. (r's and t's low entrances went
  band-true 2026-07-11, commit b7954e3 — X→r and X→t low seams are fine
  to use in verification words now.)
- No new hand-traced data is coming. If the letter has no
  `matlack/reference/lowercase/<letter>/01_paths` (SVG trace), STOP and
  ask sinback to trace it. Never read soft ink edges off scans — rule
  lines and traced paths only (expect 10–20 su error on raster guesses).

## Required reading (in order, before editing)

1. `matlack/analysis/join-architecture.md` — the band-true model, worked
   example, measurement semantics, coordinate notation. This is the
   constitution. (The "from" bring-up history section is skippable.)
2. Your letter's row + the annotation NOTES in
   `lowercase_rules_table.txt` (not the whole table).
3. `src/styles/glyphs/h.js` — the whole module
   (`H_RULE`/`H_ENTRANCE_LOW_SEGS`/`H_EXIT_BAND_SEGS` + `build` + `joinSegs`
   + the descriptor) is the canonical worked precedent, traps documented in
   comments. (t's only unique trick, the zero-bridge exit, is inline in
   step 3 below; `src/styles/glyphs/t.js` if you want the full example.)
4. Your letter's bullet ONLY in `matlack/analysis/lorem-ipsum-plan.md`
   if it is i, p, or s (traps: i's detached dot, p's descender, s's
   hardness). The plan is ADVISORY: where it and this skill disagree on
   scope, this skill wins — bring up both low connectors.
5. Glance at your letter's build function (~10 lines) to classify its
   structure. IF the body is a fused single-loop ribbon (entrance and
   exit tail are segments of one stroke, not separate components — l
   was, s likely is): read `glyphs/e.js`'s `build` (trimmed loop +
   separate connectors) and `glyphs/l.js`, the structural precedents —
   split the body at seg boundaries and remap the width function's arc
   fraction for the dropped head/tail segs, keeping isol byte-identical.
   IF it is component-structured (separate entrance/body/exit fills —
   t, h, u), skip that reading; `glyphs/h.js` is enough.

## File-collision protocol (parallel agents)

After the per-letter-module refactor (2026-07-12), a bring-up is almost
entirely confined to your own letter's files — parallel agents rarely
collide:

Your own files — safe to edit/create fully in parallel:
- `src/styles/glyphs/<letter>.js` (all your geometry, rules, anchors,
  variants, joinSegs, variantExports live HERE now)
- `tests/matlack/context/<pair>/test_<pair>_coarticulation.py`
- scratch renders under `matlack/renders/_scratch/`

Shared files — only ONE agent at a time, and now touched only lightly:
- `src/styles/matlackSVGExport.js` — ONLY if your letter isn't yet in
  `VARIANT_EXPORT_ORDER`; you append one entry (never reorder). A
  brand-new letter (not yet in the `GLYPHS` map) also needs one import +
  one map entry in `src/styles/matlackGlyphs.js` — but an existing
  letter's low-join bring-up touches NEITHER file (registries derive
  themselves).
- `matlack-glyphs.json`, `matlack-draft.otf`, `public/fonts/` — the font
  rebuild. Never run `export_glyphs.mjs`/`build_font.py` concurrently with
  another agent; the orchestrator serializes rebuilds when several letters
  land together.

If launched alongside other agents: do your read-only analysis and
`derive_band.py` derivations, write your letter module + tests, and only
take the shared critical section (the one-line `VARIANT_EXPORT_ORDER`
append, if needed, then the font rebuild) at the end. Commit atomically
per letter so the next agent starts clean.

## The recipe

Definitions: the letter's local frame is its trace's SVG units ("su");
`xh = yBottom − yCenter`; y grows downward. Dev server must be running
(it hot-reloads — NEVER restart it). Python via `uv run`, never bare.

1. **Derive GLYPH_RULES** from anatomy anchors in the trace (never from
   eyeballing the scan): feet/valleys sit ON the baseline (downstroke
   feet may hook 0–5% xh below); short-letter tops / hump-start knobs /
   bowl tops sit at yCenter; t-like crossbars cross the bar at ~x-height.
   When baseline anchors DISAGREE (u's two valleys differ by 3.5 su):
   the baseline is where the connecting stroke departs the foot — the
   functional writing line — and the other feet may hook below within
   the 0–5% convention.
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
   --fade-len <N>`, bridged onto the traced entrance line, which then
   carries to the body junction. Size `--fade-len` so the band-true span
   covers the DEEPEST partner exit tail, not the default 6: e's exit
   rides the trace ~10 scan-su past the anchor, so entries that will
   face e need ~20 local su at xh≈50 (l precedent — fade-len 6 scored
   e→l at 0.43; 20 fixed it). The overlap is a crossfade along the SAME
   curve (o's entrance comment), so a long band-true span is free. Do NOT just extend the traced entrance
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
   isolate components by label. Set ALL of these as fields on your
   letter's descriptor in `src/styles/glyphs/<letter>.js`: `rule`,
   `joinAnchors` (entry variant-keyed `{low: {x,y}}`, exit plain point;
   y is FORCED — 15.6% xh above baseline for low, printed by derive_band;
   only x is yours), `variantSupport` (supported[0] = the mid-word
   default; afterHigh forms go in notYet), `joinSegs` (a
   `function joinSegs(v)` mirroring your build's entry/exit seg pick),
   `refCenter`, and `build` must accept + pass `variant` through (call
   `resolveVariantPure(VARIANT_SUPPORT, variant, '<letter>')` at the top).
   The `GLYPH_*` registries and the `buildGlyph`/`joinSegsForVariant`
   dispatch derive from these fields automatically — you do NOT edit
   matlackGlyphs.js. Anchors/rules must be in the RENDERED frame (offsets
   baked — step 2).
7. **Pair tests, then compose.** Copy
   `tests/matlack/context/to/test_to_coarticulation.py` for each new
   bigram (both directions if both are registered): component
   coarticulation > 0.6 (band-true pairs must reconstruct the trace),
   components == 1, |drift| < 1.5. Then
   `uv run python matlack/tools/compose_word.py "<pair>"` and a word if
   one is greenlighted. Full `uv run pytest` — the frozen oreo/from
   seam values must not move.
   GAUGE WARNING: the composer PRINTS the whole-letter coarticulation
   ratio (0.05 sanity floor); the 0.6 gate applies ONLY to the pair
   test's labeled-component ratio. A low printed number with a passing
   component ratio is normal (e→l prints 0.47, components score 0.70) —
   don't "fix" it.
8. **Font.** Set `variantExports` on your letter's descriptor (default =
   mid-word, plus init/isol, fina only if the traced word-final form
   differs from the connector). If your letter isn't already listed in
   `VARIANT_EXPORT_ORDER` in `src/styles/matlackSVGExport.js`, append it
   there — that order is the calt-lookup order and is load-bearing, so
   append, never reorder. calt init/isol/fina lookups and the afterHigh
   entry-none guards are GENERATED from the assembled VARIANT_EXPORTS —
   you should not hand-write FEA.
   Rebuild: `node scripts/export_glyphs.mjs && uv run python
   scripts/build_font.py matlack-glyphs.json matlack-draft.otf`.
9. **Font verification gate:**
   `uv run python matlack/tools/shape_check.py "<your test words>"
   --glyphs <letter> <letter>.init <letter>.isol` — exit code 0 required
   for YOUR words/glyphs: correct variant picks, |dy| ≤ 2, one
   substantial ink component per word and per glyph.
   KNOWN BASELINE (pre-existing, deprioritized — do not fix, do not
   regress further): "or" and "fr" (and hence "oreo"/"from"/"lorem")
   report 2 components — the HIGH-band seams into r.afterHigh split at
   font integer precision.
   Also pick verification words WITHOUT afterHigh-guard seams (a
   @high_exit letter followed by your letter, e.g. o→l in "toll"): the
   guard deliberately breaks the curs chain there, so a 2-component
   report on such a word is the designed gap, not your failure.
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
