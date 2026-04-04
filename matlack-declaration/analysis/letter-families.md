# Letter Families

How letters share construction patterns. Learning one letter informs others
in the same family. Groupings here are based on shared sub-strokes and
motor patterns, not just visual similarity.

---

## Bowl family: a, o, d, g, q, c, e

These all share some form of the counter-clockwise bowl sweep. Key differences
are what happens before and after the bowl.

- **o**: Bowl only, fully closed. The simplest member — baseline for bowl shape.
- **a**: Bowl + dominant right-side downstroke. Bowl is open/lightweight.
- **d**: Bowl + tall ascender on right side (extends above x-height to cap line). Same bowl-then-downstroke pattern as 'a' but the downstroke is taller.
- **g**: Bowl + descender on right side (extends below baseline). Mirror of 'd' vertically.
- **q**: Similar to 'g' but with a different descender tail.
- **c**: Open bowl — no downstroke, no closure at right side. Just the crescent.
- **e**: Like 'c' but with a horizontal cross-stroke at midline.

### Implementation status
1. **a** — ✅ Done. Bowl + downstroke. Hand-traced, grid-searched offsets.
2. **o** — ✅ Done. Bowl only. First letter via automated crescent fit.
3. **c** — In progress. ~260° partial arc. Automated fit attempted but
   neighboring letter contamination makes isolation hard. Tilted-crop
   capture strategy planned.
4. **d** — Next. Reuses 'a' bowl with taller downstroke, tests RULED ascender line.
5. **e** — Adds cross-stroke to bowl family.
6. **g, q** — Descenders, tests RULED descender line.

### What transfers from 'a' to the family
- Bowl arc shape, speed, and pressure profile should be nearly identical across all members.
- The thick-downstroke-on-the-right pattern applies to a, d, g, q.
- Nib angle is constant across the family.

---

## Vertical family: l, t, h, k, b, f

These share a dominant full-height vertical stroke. Cross-strokes and loops
differentiate them.

### Implementation status
- **b** — ✅ Done. Two overlapping bowls (main + bar-bowl stem). Hand-traced.
- **f** — ✅ Done. Bar-bowl + fat bar (descender) + hairline crossbar.
  Hand-traced. Straight fat bar chosen over curved for legibility at font sizes.
- Others not yet started.

### Shared primitive: bar-bowl
The elongated elliptical stem used by 'b' and 'f' (and likely 'l', 'h', 'k')
is the same two-ellipse model as a round bowl, just with a very low aspect
ratio (~0.13-0.17). Tilt is consistent with round bowls (~-48° to -50°).

---

## Diagonal family: v, w, x, z

*(To be populated.)*
