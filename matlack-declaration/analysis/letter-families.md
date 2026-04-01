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

### Implementation order (proposed)
1. **a** — we're doing this now. Establishes bowl + downstroke pattern.
2. **o** — simplest bowl, validates the arc primitive in isolation.
3. **c** — open bowl, tests partial arc without closure.
4. **d** — reuses 'a' bowl with taller downstroke, tests RULED ascender line.
5. **e** — adds cross-stroke to bowl family.
6. **g, q** — descenders, tests RULED descender line.

### What transfers from 'a' to the family
- Bowl arc shape, speed, and pressure profile should be nearly identical across all members.
- The thick-downstroke-on-the-right pattern applies to a, d, g, q.
- Nib angle is constant across the family.

---

## Vertical family: l, t, h, k, b, f

These share a dominant full-height vertical stroke. Cross-strokes and loops
differentiate them.

*(To be populated when we start these letters.)*

---

## Diagonal family: v, w, x, z

*(To be populated.)*
