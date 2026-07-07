# "lorem ipsum" bring-up plan (advisory, 2026-07-07)

Target set by sinback after "oreo" (perfect) and "from" (approved; do not
revisit its residual gaps). No new hand-traced bezier curves will be
provided — everything below derives from data already in the repo.
This is a GUIDE: follow `join-architecture.md`'s worked example per
letter; don't improvise new machinery unless a letter genuinely breaks
the recipe, and check in with sinback when one does.

## Why this target is tractable

Letters needed: l o r e m + i p s u m. Already join-ready: o, r, e, m.
New bring-ups: **l, i, p, s, u** — and every new join involved is a
LOW-band join (to/01), because none of these letters is a high-exit
(@high_exit = b f o v w). The only high join in either word is o→r
inside "lorem", which is done and sinback-approved.

- **"lorem" = l bring-up only.** l→o (low), o→r (done), r→e (done,
  approved), e→m (done). Ship "lorem" first for an early win.
- **"ipsum" = i, p, s, u.** i→p, p→s, s→u, u→m: all low↔low. m's low
  entrance and word-final exit already exist.

## Per-letter checklists (order: l → u → i → p → s)

Each letter follows the same recipe (join-architecture.md, worked
example): derive rules → `derive_band.py low` slices for entry/exit →
bridges to the body → connector ribbons with labels → register
(GLYPH_RULES / REF_CENTERS / JOIN_ANCHORS / VARIANT_SUPPORT /
joinSegsForVariant / VARIANT_EXPORTS + calt if variants) → pair test
FIRST, then compose until green. Hairline = 0.65 × xh/60. Rules-table
row (lowercase_rules_table.txt) decides entry/exit classes and word-edge
behavior.

- **l** (unlocks "lorem"; easy — 'l' is a single looped ribbon):
  - No GLYPH_RULES yet; derive from l/01_paths (ascender: yTop matters;
    tops reach ~90% of yTop per the four-line convention).
  - Table: entry `.rule.y-bottom` (kept at word start), exit
    `rule.y-bottom.` (kept at word end). Word-initial l in "lorem" can
    keep its traced entry; mid-word entry.low can wait.
  - Exit: low-band slice + bridge from the loop's baseline turn. The
    traced l/01 exit is likely the word-final form (the r lesson:
    isolated-letter traces give word-EDGE forms) — keep it for fina.
- **u** (easy per sinback's difficulty tiers):
  - Table: entry `~rule.y-bottom` (nerfed at word start), exit
    `rule.y-bottom?` (no word-final data — keep whatever the trace has).
  - Entry.low + exit connectors both low-band. Body is an n-inverse;
    bridges should be short.
- **i** (easy; one trap):
  - Table: entry kept at word start, exit `rule.y-bottom?`.
  - TRAP: the dot is detached ink. Seam metrics that union whole-letter
    geometry are fine (the connectedness metric already checks
    letters-touch, not island counts), but keep the dot out of any
    labeled entrance/exit component.
- **p** (easy tier, but a descender):
  - Table: entry `!rule.y-bottom` (OMITTED at word start — but "ipsum"
    has p mid-word, so entry.low is what matters), exit `rule.y-bottom?`.
  - Needs yBelow in its rules (descender to rule.y-below). Where the
    exit leaves the body needs a look: current buildP is fat bar +
    piecewise second downstroke — find the baseline-region point the
    connector should bridge from. sinback's notes mention a bowl-based
    modern p variant; do NOT pursue that now (base glyphs locked).
- **s** (hard tier; do LAST):
  - Table: entry kept, exit `rule.y-bottom!` — exit OMITTED word-finally;
    mid-word s→u needs exit.low though.
  - Table note: Copperplate has a secondary word-initial/double-s glyph
    we never captured. "ipsum" has s mid-word only, so this can be
    ignored — but if s looks wrong joined, ASK SINBACK before inventing
    geometry; s was flagged as one of the hardest letters.

## Verification plan

- Pair tests: `tests/matlack/context/<pair>/` for lo, ip, ps, su (um is
  m's existing low entrance — a word test covers it). Component
  coarticulation > 0.6 (both sides are band-true slices of to/01, so
  this holds by construction if the recipe was followed).
- Word tests + battery: `compose_word.py lorem`, `ipsum`,
  `"lorem ipsum"`; drift < 1.5 su everywhere; no regression in the
  existing 10 tests (especially oreo/re — sinback-approved, frozen).
- Font: regenerate (export_glyphs.mjs → build_font.py), reshape with
  uharfbuzz ("lorem ipsum" — correct variants, dy ≤ ~1), then eyeball at
  localhost:3000/matlack-preview.html. Remember the FEA gotchas
  (explicit lookup blocks; variant glyphs in context classes) when
  adding calt rules for new letters.
- Promote the final "lorem ipsum" geometry + font-shaped renders to
  `matlack/renders/milestones/` and send them to sinback.

## Guardrails

- Base letterforms are LOCKED. Bring-ups touch entry/exit connectors,
  rules, anchors, and registration only.
- Do not revisit "from"'s residual gaps (o→e, r→r, m.exit) — sinback
  explicitly deprioritized them.
- No new traces are coming: rules and bridge points come from the
  existing single-letter traces (all five letters have NN_paths files).
  Where a trace is a word-edge form, say so in comments and keep it for
  the future fina/init variants rather than deleting.
- Aesthetic doubts → the CLAUDE.md "when a render looks weird" path.
  Structural doubts → measure; if you can't measure it, build the metric.
