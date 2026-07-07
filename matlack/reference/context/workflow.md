# Context-analysis workflow (Matlack curs-anchor work)

This doc captures the conventions and lessons from the first pass of
identifying per-letter transition anchors by eye against scans of
Matlack's hand. Short & practical — update as we learn more.

## Rule-line convention (four-line paper)

From primary-school writing practice, applied here:

- **rule.y-bottom** — baseline; all non-descender letters sit here
- **rule.y-center** — x-height top; where short letters (o, e, a, n, r …)
  peak and where a t's crossbar sits. **Geometric midpoint** between
  y-top and y-bottom by definition, i.e. `yCenter = (yTop + yBottom) / 2`.
- **rule.y-top** — ascender line; f peaks here; other ascenders (b, d,
  h, k, l, t) reach ~90% up (~10% short of it)
- **rule.y-below** — descender line; g/j/p/q/y bottoms reach here; and
  f's descender tail

Always check y-center falls at the midpoint once you've picked y-top and
y-bottom — it's a free consistency check.

## Two-anchor model for letter joins

This is the operative framing. (Previous versions of this doc tried to
find a single "gestalt midpoint" per transition; that was overfussy.
We've since realised `curs` gives us the flexibility to do much less
work.)

**Each glyph declares two anchors in its own local coordinate frame:**

- `entry` anchor — where the previous letter should arrive
- `exit` anchor — where the next letter should pick up

For a pair like `t→o`, the shaper aligns `t.exit` with `o.entry` via
OpenType's `curs` feature. Each glyph is designed *independently*,
including its own lead-in and exit flicks, which **extend past the
anchor points** — so the strokes overlap visually in a band around
the anchor and provide the look of a continuous pen gesture.

Consequences (SUPERSEDED in part — see `matlack/analysis/join-architecture.md`,
the band-true slice rule: for connectors sliced from one canonical trace,
both glyphs' anchors ARE the same scan point through their own placement
transforms, and anchor heights follow per-class conventions; "chosen by
feel" survives only in the horizontal spacing choice):

- Each glyph's anchor x is chosen in its own design, by feel.
- The rendered output matches the **style** of Matlack's hand, not
  any specific scan pixel-for-pixel. This is fine for a realistic-
  approximation project and is usually better than pixel-matching —
  lets the hand feel living.
- Word-final and word-initial behavior fall out for free: if there's
  no neighboring glyph, curs doesn't apply, and the full extending
  flick is drawn as a natural flourish (or is swapped out via `calt`
  init/fina variants if we want a trimmed form).

## Per-scan analysis workflow

For each scan we want to learn from:

1. **Identify rule lines first.** They frame everything. Look for:
   - A visible paper rule line near the top (y-top)
   - Where short-letter tops / t crossbars sit (y-center)
   - Where baselines sit (y-bottom)
   Cross-check `(yTop + yBottom) / 2 ≈ yCenter`.
2. **Trace the transition path** (the combined exit+entry gesture of
   two letters as one pen motion, labelled per Matlack's stroke order
   regardless of which glyph "owns" which segment). Two cubic Beziers
   is usually enough.
3. **Mark endpoints** (where the preceding letter's body ends, where
   the next letter's body begins). These are the semantic span of
   the transition, not the traced path's exact endpoints — they can
   sit on adjacent traced paths (e.g. the tail of a t downstroke or
   the early portion of an o bowl-loop).
4. **Pick two anchor candidates** on the traced curve, one per glyph.
   Examples (from to/01):
   - `t.exit` anchor: (41.25, 71.64) — where t hands off
   - `o.entry` anchor: (≈43.25, 69.55) — where o picks up
   The two don't have to coincide; when curs aligns them they'll
   collocate in the output, and each glyph's flick extends past its
   own anchor to cover the overlap.
5. **Notate** in a sibling `NN_notes.md`.

## What Claude can and can't do from scans alone

- **Can**: read rule.y-X positions from a scan at medium+ effort (paper
  rule lines are sharp horizontal bands that span the scan and are
  unambiguous). Also: read back precise coordinates from the tooltip
  once a human hovers.
- **Can't**: pin down soft ink-edge features (where the t's
  downstroke "really" ends, where the o's bowl "really" starts)
  with pixel precision. Visual tokens aren't pixel data — they give
  regions and shapes, not sub-pixel positions. Expect Claude's guesses
  on these points to be ~10-20 svg units off and not self-correcting
  without traced reference data.
- **Helps a lot**: human-traced Bezier paths in an `NN_paths` svg
  sibling file. Anchors endpoints to specific numbers; Claude can do
  the arithmetic (midpoints, arclength, etc.) precisely from there.

## Variant naming (for contextual alternates)

Each letter build function accepts a `variant` argument — an
`{entry, exit}` object, values `'low' | 'high' | 'none'` (+ `'flourish'`
for future sentence-end exits). `VARIANT_SUPPORT` in
`src/styles/matlackGlyphs.js` is the ground truth for what each letter
accepts (supported vs notYet); `resolveVariant` fills partial variants
from the default (= `supported[0]`) and degrades notYet combos while
preserving the entry side. The font-facing names (`.afterHigh`, `.init`,
`.isol` glyph suffixes) map from these in `VARIANT_EXPORTS`
(matlackSVGExport.js).

Coverage as of 2026-07: e, o, r, m have entry variants (o also init/isol);
f is registered for curs but word-initial-only on the entry side (see
F_JOIN_ANCHORS). Remaining letters are variant-blind and render their
default form.

## Code gotchas (things that burned this session)

- **dpr double-scaling.** `canvas.width = w * dpr` inside
  `MatlackRenderer` means the canvas's internal coords are device
  pixels. Any `scale = canvas.width / N * dpr` formula applies dpr
  twice and diverges from HTML overlays at non-default browser zoom.
  Correct form: `scale = canvas.width / N` (no extra `* dpr`).
- **Context switching needs an explicit redraw.** `MatlackRenderer`
  only calls `onDraw` on mount + resize. Swapping `contextKey` changes
  the drawing callback but doesn't trigger redraw. Fix in
  `MatlackCanvas.jsx`:
  ```js
  useEffect(() => {
    const r = matlackRef.current?.renderer;
    const c = matlackRef.current?.canvas;
    if (r && c) handleDraw(r, c);
  }, [handleDraw]);
  ```

## Effort-level calibration (empirical this session)

- **low** — not great for this work; too fast, makes numbers up
- **medium** — sweet spot for eyeballing and rule-line inference
- **high / xhigh** — useful for code + math debugging (dpr fix)
- **max** — best for honest self-evaluation and careful learning
  moments; trade-off is it's slower

Switch per task, not per session.

## Pointers

- `to/01_paths`, `to/02_paths`, `to/05_paths` — traced t→o svgs
- `to/01_notes.md` — first notation; uses older single-anchor
  framing, still useful for raw numbers
- `../../../src/styles/MatlackCanvas.jsx` — review canvas; context
  switcher, tooltip, axis overlay, rule lines
- `../../../src/styles/matlackGlyphs.js` — `buildE/O/R` as examples
  of variant handling
