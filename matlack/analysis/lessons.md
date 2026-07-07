# Lessons — read this first (one page, hard-won)

The distilled laws of the Matlack join work, 2026-07. Details live in
join-architecture.md; plans in lorem-ipsum-plan.md. If you internalize
only this page, you'll still mostly do the right things.

1. **Joins reconstruct a shared stroke; they don't just touch.**
   Adjacent letters coarticulate: each glyph carries a slice of ONE
   traced transition, and the curs overlay must rebuild it. Slices are
   rule-consistent-scale copies of a canonical trace (high band = or/01,
   low band = to/01), pinned at the same human-picked scan anchor on
   both sides. Which band? The PREVIOUS letter's exit class decides:
   after b/f/o/v/w it's high, otherwise low. Adapt to a letter's body
   with an authored bridge — never by warping the slice.

2. **Curs accumulates; only anchor-height equality keeps baselines level.**
   Cursive attachment inherits every pair's vertical mismatch down the
   whole line. Letters stair-stepping toward a corner = anchor heights
   disagree somewhere (or the wrong variant got substituted, which is
   the same thing through a different door). Anchor y is FORCED by the
   join-class convention (low 15.6% / high 71.6% of x-height) — derive
   it, never pick it.

3. **Glyph frames lie; rules are truth.** Every letter lives at its own
   trace's scale. Anything cross-letter — hairline width, band slices,
   seam metrics, font export — must normalize via rule lines
   (xh = yBottom − yCenter). The pen is physical: hairline = 0.65 × xh/60
   (60 su = the common normalization target x-height).

4. **Isolated-letter traces are word-EDGE forms.** A letter traced alone
   shows its initial/final flourish, not its mid-word connector. Keep
   the traced form for init/fina variants; mid-word connectors are
   continuous hairlines (buildConnectorRibbon), never pen-lift tapers.

5. **Ugly-next-to-each-other letters are usually UNREGISTERED, not
   broken.** A letter without GLYPH_JOIN_ANCHORS gets no curs and no
   connectors — it sits in isolated word-edge form even if its shape is
   correct ("l" in lorem, all of "ipsum"). The fix is the bring-up
   recipe (join-architecture.md, worked example), not letterform
   surgery. Base letterforms are locked.

6. **Measure structure; defer taste.** Your aesthetic sense is
   miscalibrated for this hand (it once flagged the correct t and k as
   worst). Structural wrongness is always measurable — drift, kink,
   coarticulation, overlap — and if you can see something you can't
   measure, build the metric first (that's how all four were born).
   Aesthetic verdicts belong to sinback; bring renders, not opinions.
   And know what each metric MEANS: low coarticulation on a smooth-
   looking seam says "these strokes weren't sliced from one trace" — a
   design status, and a defect only where band-true is the spec
   (independently-authored seams legitimately score ~0.25).

7. **Cheap discipline compounds.** Pair test written FIRST (it must
   fail); one word per sinback check-in; atomic commits; verify a
   subagent's specific claims before acting on them; when the font
   misbehaves, reproduce with uharfbuzz (Firefox's shaper) before
   touching anything — and remember the FEA gotchas: explicit lookup
   blocks, variant glyphs in context classes.
