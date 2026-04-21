# `to` — notes on the t→o transition

Studied in `MatlackCanvas` review view: Matlack's traced pen path
`01_paths` overlaid on `01.png`, annotated against rule lines, used to
pick a candidate curs anchor for the `t.exit` / `o.entry` join.

## Rule lines (svg coords, this scan)

- `rule.y-top`    ≈ 20  — ascender line; above t's top with room for f
- `rule.y-center` ≈ 48  — x-height top; t crossbar level; short-letter tops
- `rule.y-bottom` ≈ 76  — baseline; letter ink overshoots to ≈ 78

## path3 — `t Exit → o Entry`, one pen gesture

Two cubic Bezier segments, continuous at `(33.66, 75.39)`:

- **Segment A**: `(25.86, 75.95) → (33.66, 75.39)`
  Short, near-horizontal along the baseline. Control points dip slightly
  below baseline. Reads as the tail of the t leaving its downstroke.
- **Segment B**: `(33.66, 75.39) → (60.03, 55.13)`
  Long rise from baseline up toward the top-left of o's bowl. P1 at
  `(36.06, 76.97)` dips further below baseline before the rise.

Matlack chose to author path3 in two segments; the A/B junction itself
reads like a "character change" of the gesture.

## Chosen anchor — svg `(41.25, 71.64)`

Picked by eye (sinback). Sits on or just below segment B, about 0.5 svg
units below the curve at that x (the bezier at x=41.25 passes through
y ≈ 71.1).

### Relationship to path3

- ≈ 28% along path3's arclength, measuring from path3 start
- ≈ 23% along segment B (segment-B parameter t ≈ 0.33)
- Well past the A/B junction Matlack authored at `(33.66, 75.39)`
- `x=41.25` is close to the x-midpoint of path3's endpoints
  (`(25.86 + 60.03) / 2 = 42.95`), though y sits above the chord midpoint

### Relationship to letter bodies & rule lines

- `x`: **≈15.4 su right of t's downstroke bottom** (25.86) · **≈18.8 su left of o's bowl start** (60.03)
- `y`: **≈4.4 su above rule.y-bottom** (76) · well below rule.y-center (48)

## Why this exact spot? Unknown yet.

Picked by feel. Candidate rules worth testing against more examples:

- **Fixed arclength fraction of the transition** (~28% here)
- **Fixed horizontal distance past the preceding letter's body**
- **Fixed vertical height above baseline** (~4–5 su here)
- **Some composite** involving letter size, kerning, and shape

Revisit after notating 1–2 more transitions (e.g. `or`, `for`) to see
which of these, if any, generalises. Otherwise, settle on whichever
region "feels viable" and use as a heuristic.
