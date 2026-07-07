# Letter Families

How letters share construction patterns. Learning one letter informs others
in the same family. Groupings here are based on shared sub-strokes and
motor patterns, not just visual similarity.

NOTE: "Done" below means the BASE letterform exists (locked as good-enough
neutrals per sinback). Variant/join support is tracked separately —
`VARIANT_SUPPORT` and `GLYPH_JOIN_ANCHORS` in matlackGlyphs.js are ground
truth; the join model lives in analysis/join-architecture.md.

---

## Bowl family: a, b, c, d, e, g, o, q

These all share some form of the counter-clockwise bowl sweep. Key differences
are what happens before and after the bowl.

- **o**: Bowl only, fully closed. The simplest member — baseline for bowl shape.
- **a**: Bowl + dominant right-side downstroke. Bowl is open/lightweight.
- **b**: Round bowl + bar-bowl stem. Uses two-ellipse model for both components.
- **d**: Bowl + tall ascender on right side (extends above x-height to cap line). Same bowl-then-downstroke pattern as 'a' but the downstroke is taller.
- **g**: Bowl + descender on right side (extends below baseline). Downstroke rendered via buildRibbon, attached as overlayFills.
- **q**: Similar to 'g' but with a different descender tail. Tapered ribbon descender.
- **c**: Open bowl — no downstroke, no closure at right side. Just the crescent.
- **e**: Single-stroke variable-width ribbon — no bowl decomposition. Loop rendered
  via buildRibbon with a custom width function, then a tapered flick via
  buildTaperedRibbon added as overlayFills.

### Implementation status
1. **a** — ✅ Done. Bowl + downstroke. Hand-traced, grid-searched offsets.
2. **o** — ✅ Done. Bowl only. First letter via automated crescent fit.
3. **b** — ✅ Done. Two overlapping bowls (main + bar-bowl stem). Hand-traced.
4. **c** — ✅ Done. ~260° partial arc with custom width function using ARC_* zones.
5. **d** — ✅ Done. Reuses bowl model with ascender stroke.
6. **e** — ✅ Done. Variable-width ribbon (no bowl). Loop via buildRibbon, flick via buildTaperedRibbon.
7. **g** — ✅ Done. Bowl + ribbon descender via overlayFills.
8. **q** — ✅ Done. Bowl + tapered ribbon descender + entry flick.

### What transfers from 'a' to the family
- Bowl arc shape, speed, and pressure profile should be nearly identical across
  bowl-using members (a, b, c, d, g, o, q).
- The thick-downstroke-on-the-right pattern applies to a, d, g, q.
- Nib angle is constant across the family.
- 'e' broke from the bowl model entirely — its loop shape is better expressed as
  a single variable-width ribbon with a custom width function. This was a key
  finding: not every visually "round" letter benefits from ellipse decomposition.

---

## Vertical family: b, f, h, k, l, t

These share a dominant full-height vertical stroke. Cross-strokes and loops
differentiate them.

### Implementation status
- **b** — ✅ Done. Two overlapping bowls (main + bar-bowl stem). Hand-traced.
- **f** — ✅ Done. Bar-bowl + fat bar (descender) + hairline crossbar.
  Hand-traced. Straight fat bar chosen over curved for legibility at font sizes.
- **h** — ✅ Done. Bar-bowl stem + ribbon hump stroke via buildRibbon + entry
  flick via buildTaperedRibbon. Hump rendered as overlayFills.
- **k** — ✅ Done. Bar-bowl stem + entry flick + exit stroke. Exit stroke uses
  buildRibbon with custom width function. Multiple overlayFills layers.
- **l** — ✅ Done. Single-stroke variable-width ribbon (no bowl decomposition).
  Loop via buildRibbon with custom width function, rendered via drawFills.
- **t** — ✅ Done (type 1). Bar-bowl + entry/exit tapered ribbons + crossbar.

### Shared primitive: bar-bowl
The elongated elliptical stem used by b, f, h, k, and t is the same two-ellipse
model as a round bowl, just with a very low aspect ratio (~0.13-0.17). Tilt is
consistent with round bowls (~-48° to -50°).

### Ribbon departures
'l' uses no bowl at all — it's a single variable-width ribbon rendered via
drawFills. This parallels 'e' in the bowl family: letters with simple geometry
are better served by ribbon primitives than ellipse decomposition.

---

## Hump family: h, m, n

These share a rounded hump stroke rendered as a variable-width ribbon.

- **h**: Bar-bowl stem + single hump. The hump is a ribbon overlaid on the bowl.
- **n**: Single hump, no bar-bowl — just the ribbon, rendered via drawFills.
- **m**: Double hump, no bar-bowl — two ribbon humps + entry flick, rendered via drawFills.

'n' and 'm' are bowl-less letters. They use drawFills directly instead of the
bowl+overlayFills pipeline.

---

## Flick family: i, j, r, p

Letters dominated by simple downstrokes with entry/exit flicks.

### Implementation status
- **i** — ✅ Done. Downstroke ribbon + entry flick (tapered ribbon). Bowl-less (drawFills).
- **j** — ✅ Done. Downstroke ribbon + entry flick + exit curve. Uses overlayFills.
- **r** — ✅ Done. Entry flick + swoop + downstroke ribbons. Bowl-less (drawFills).
- **p** — ✅ Done. Fat bar + piecewise second downstroke. Bowl-less (drawFills).

---

## Diagonal family: w, x, y

### Implementation status
- **w** — ✅ Done. Multi-segment zigzag: entry flick + three descents + exit.
  Rendered via drawFills (bowl-less).
- **x** — ✅ Done. Two crossing crescent ribbons with symmetric lens width at
  the intersection. Bowl-less (drawFills).
- **y** — ✅ Done. Entry flick + two strokes converging at junction + descender.
  Uses overlayFills.

---

## S-curve: s

### Implementation status
- **s** — ✅ Done. Nearly uniform width through the S-curve — very different
  pressure profile from other letters. Rendered via drawFills (bowl-less).

---

## u, v, z

All implemented — `buildGlyph` covers the full lowercase alphabet.

- **u** — ✅ Done. Inverse of 'n' hump, as expected.
- **v** — ✅ Done. Single diagonal descent + ascent.
- **z** — ✅ Done. Ribbon-based with looped descender.
