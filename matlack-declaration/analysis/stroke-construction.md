# Stroke Construction

Per-letter observations on how Matlack constructs each letterform.
Each section documents stroke count, order, key geometry, and what varies vs. what's invariant.

---

## Lowercase 'a'

**References:** lowercase/a/01–10.png

### Stroke count and order
**Observed:** Single stroke — no pen lift. The bowl and downstroke are one continuous movement.

### Construction sequence
**Observed/Inferred:**
1. Pen enters from upper-right, moving left — a thin hairline entry, sometimes nearly invisible.
2. Bowl sweeps leftward, down around the bottom, and back up the right side. The bowl is an **open crescent**, not a closed oval — there's often a visible gap or hairline at the top where it reconnects.
3. Without lifting, the pen transitions into the downstroke on the right side. This is the **dominant stroke** — it runs the full height of the letter, from above x-height to baseline.
4. Slight leftward curve at the bottom of the downstroke, sometimes with a small exit flick rightward.

### Key geometry
- **Observed:** The downstroke is the heaviest part of the letter (high pressure, slow movement). The bowl is lightweight — thin, fast, low pressure.
- **Observed:** The bowl sits left of the downstroke. The downstroke defines the right edge of the letter.
- **Observed:** Bowl width is roughly 70-80% of total letter width. The downstroke occupies the rightmost 20-30%.
- **Inferred:** The thick-to-thin transition from downstroke to bowl suggests the pen accelerates as it enters the bowl arc and decelerates on the downstroke.

### What varies
- Bowl roundness (some slightly more compressed vertically).
- Exact entry angle of the initial hairline.
- How far past baseline the exit flick extends.
- How open/closed the top of the bowl is.

### What's invariant
- Downstroke is always the dominant, heaviest stroke.
- Bowl is always lighter/thinner than the downstroke.
- Single continuous stroke, no lift.
- Downstroke is always on the right side, nearly vertical.

### Delta from our current model
Our glyph system has the bowl as the dominant feature (full closed ellipse, 18 waypoints) with the downstroke as a short appendage (4-waypoint line from junction to flick). Matlack has it reversed:
- His downstroke runs the full letter height; ours is a short flick.
- His bowl is an open lightweight crescent; ours is a closed heavy ellipse.
- His pressure/velocity profile emphasizes the downstroke; our uniform sampling gives the bowl more visual weight.
