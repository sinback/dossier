# Parallel bring-up plan (approved direction, 2026-07-11)

sinback wants the bigram-bringup skill to scale past the lorem-ipsum set
to the whole alphabet (~20 more work items including afterHigh entries),
executed by parallel subagents. This doc is the enabling plan. PLAN ONLY
until u lands — do not start the refactor while a bring-up agent owns
the glyph files.

## Why parallel (not serial warm-restarts)

A single warm agent doing letters serially drags all previous letters'
work in context; around letter 3-4 it compacts and later letters get
more expensive and lower-fidelity. Forked clones each start from the
same compact educated prefix (skill + required reading, paid once by a
cold orchestrator whose model is picked at spawn; forks inherit model +
context, and the shared prefix is cache-priced). At 20 letters this
dominates; at 4 it was noise — which is why the earlier decision was
collision-avoidance only. Scale changed, decision changed.

## The refactor: decentralize letter data (mechanical, one session)

Today every bring-up edits matlackGlyphs.js (~4.7k lines, all 26
letters), six shared registries (GLYPH_RULES, GLYPH_JOIN_ANCHORS,
GLYPH_REF_CENTERS, VARIANT_SUPPORT, joinSegsForVariant, buildGlyph
dispatch) and matlackSVGExport.js's VARIANT_EXPORTS. Plan:

- `src/styles/glyphs/<letter>.js` per letter, exporting a standard
  shape: `{ rule, refCenter, joinAnchors, variantSupport,
  variantExports, build, joinSegs }`. Letter constants move with their
  letter.
- Shared helpers stay in matlackGlyphs.js (buildConnectorRibbon,
  buildTaperedRibbon, buildRibbon, sampleSegments, smoothStep,
  resolveOffset, resolveVariant, tangentAtAnchor...). Cross-letter
  borrowings (hBarBowlWidth = fBarBowlWidth) become imports.
- All registries + VARIANT_EXPORTS derived by iterating the letter
  modules. The public API of matlackGlyphs.js / matlackSVGExport.js is
  unchanged (MatlackCanvas, /api/outlines, /api/render,
  export_glyphs.mjs, /api/join-data all keep working untouched).
- After this, a bring-up touches ONE new-ish file + its tests; the only
  serialized steps left are the font rebuild and the frozen-seam
  regression gate (which SHOULD stay serialized).

**Verification gate (non-negotiable):** `node scripts/export_glyphs.mjs`
before and after must produce byte-identical matlack-glyphs.json (no
geometry may change), plus full pytest and shape_check on the known
word set. Commit the refactor as its own atomic commit(s).

## Orchestration shape (after refactor + easement)

1. Cold orchestrator (model chosen at spawn — Opus validated on l) reads
   SKILL.md + required reading ONCE.
2. Forks itself per letter (forks inherit model + warm context). Letter
   assignment one per fork; per-letter files make parallel edits safe.
   Worktree isolation optional belt-and-suspenders.
3. Forks do derivation, geometry, pair tests in parallel.
4. Orchestrator serializes: merge/land letters one at a time, rebuild
   font ONCE per batch, run the full regression gate, batch preview
   updates for sinback's review (review bandwidth is the real
   bottleneck — don't land five letters' previews as five separate
   pings).

## Sequencing

1. u lands (warm agent, in flight — blocked on spend cap as of writing).
2. THE REFACTOR (me/main session, byte-identical gate).
3. Easement mechanism in buildConnectorRibbon (sinback picks from a
   junction-anatomy study first — see TODO.txt) so every later letter
   inherits it instead of needing retrofits.
4. Fork fan-out over remaining LOW↔LOW letters: a c d g i j k p q s y z
   (u done by then; i/p/s traps in lorem-ipsum-plan.md; s last, may
   need sinback).
5. DECISION GATE with sinback before high-band expansion:
   - join-architecture.md pins canonical bands "do not generalize to
     bo/etc. yet" — extending or/01's high band to b/v/w exits is
     sinback's call, possibly needing trace evidence.
   - afterHigh ENTRIES for existing letters use the pinned high band +
     e/m/r precedent and could be skill-extended sooner if sinback
     approves that scope.
   - n/x have y-center entries — a third join class with NO canonical
     band; needs sinback + possibly new traces.

## Refactor execution detail (from the main session, 2026-07-11 — for
## the fresh Opus session that runs this)

Order of operations:
1. Extract shared helpers to their own module FIRST
   (buildConnectorRibbon, buildTaperedRibbon, buildRibbon,
   sampleSegments, smoothStep, resolveOffset, ellipse samplers).
   Letter modules will import helpers; if helpers stayed in
   matlackGlyphs.js you'd get letter→aggregator→letter cycles. Run the
   byte-identical gate right after.
2. Prove the pattern on ONE letter (l or t — freshest, known shape):
   constants + build fn + exportOutlines fn + registry entries +
   VARIANT_EXPORTS entry → src/styles/glyphs/<letter>.js exporting one
   descriptor. Gate.
3. Move the rest in small batches, gate per batch (a failure must
   bisect to a few letters, never one giant diff).
4. Derive registries + dispatches (+ VARIANT_EXPORTS in
   matlackSVGExport.js) by iterating the letter map. Public exports of
   both files unchanged — MatlackCanvas, /api/outlines, /api/render,
   /api/join-data, export_glyphs.mjs need no edits.
5. Update SKILL.md (collision protocol shrinks to font-rebuild-only;
   required-reading pointers → new per-letter files).

Resolved design decision: resolveVariant currently reads the global
VARIANT_SUPPORT from inside build functions — a cycle once the table is
assembled FROM letter modules. Cut: make it resolveVariant(support,
variant) (pure helper, support passed in); each builder passes its own
module-local support. No letter needs another letter's variant table.

Audit list (known unknowns — verify, don't assume):
- Cross-letter borrowings: hBarBowlWidth = fBarBowlWidth is confirmed;
  others are likely (early letters copied proportions). Grep before
  moving; each becomes an explicit import.
- Reference-overlay ellipse tables (scan-overlay data for MatlackCanvas
  review views) live in matlackGlyphs.js; their per-letter extent and
  MatlackCanvas's import surface are UNVERIFIED — least-checked corner.
- The byte-identical gate covers matlack-glyphs.json only (alphabet
  iteration = stable order). /api/join-data serializes registries whose
  key ORDER may change with derived assembly — harmless, but eyeball
  the two dashboards after.
- pytest hits the live dev server, which hot-reloads every save;
  mid-batch transient failures are noise. Only post-batch gate runs
  count.

## Skill changes this implies (do with the refactor)

- File-collision protocol section rewrites to the per-letter-module
  model (shared-file critical section shrinks to font rebuild only).
- Required-reading list gets trimmed using the u-run's "reading I didn't
  need" report.
- Add the orchestration section (fork pattern above) for batch mode.
