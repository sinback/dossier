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

### Key geometry — width profile around the bowl
**REVISED (was previously incorrect about bowl being uniformly thin):**

The bowl is NOT uniformly thin. Width varies dramatically around the arc due to the interaction of nib angle (40°) and stroke tangent direction:

- **Top of bowl / entry (1 o'clock → 11 o'clock):** Thin — hairline entry, light pressure, tangent direction near-horizontal which is closer to the nib slit angle. **Observed** in refs 01-10.
- **Left side going down (10 o'clock → 7 o'clock):** **Thick** — near-vertical tangent is ~perpendicular to the 40° nib slit, so the nib projects wide. Combined with maintained pressure, this produces substantial stroke weight approaching the downstroke. **Observed** in refs 01, 03, 05, 09 especially.
- **Bottom-left curve (7 o'clock → 5 o'clock):** **Thick** — the bulge. Visible darkness/weight here. Some of the fattest parts of the bowl. **Observed** across all refs.
- **Right side going up (5 o'clock → 2 o'clock):** Hard to distinguish from the overlapping downstroke. Likely moderate.
- **Downstroke (top to bottom along right edge):** The heaviest single element, but the left side of the bowl is NOT far behind. The contrast is maybe 1.5:1, not 5:1 as previously claimed.

**Why the earlier "bowl = hairline" analysis was wrong:** The 40° nib angle naturally produces thick strokes when the tangent is near-vertical (left side of bowl), not just when pressure is high. The thin parts of the bowl are at the top where the tangent aligns closer to the nib angle AND pressure is light.

### Bowl shape
- **Observed:** Taller than wide (aspect ~0.6-0.7 : 1). Not circular.
- **Observed:** Wider at the top than at the bottom — egg-shaped, fat end up.
- **Observed:** Bottom-left has a visible bulge/fatness.

### What varies
- Bowl roundness (some slightly more compressed vertically).
- Exact entry angle of the initial hairline.
- How far past baseline the exit flick extends.
- How open/closed the top of the bowl is.

### What's invariant
- Downstroke is always the heaviest stroke, but the left bowl is substantial too.
- Single continuous stroke, no lift.
- Downstroke is always on the right side, nearly vertical.
- Top of bowl is always the thinnest part.
- Bottom-left of bowl always has visible weight/fatness.

### Delta from our current WebGL model (as of initial Matlack 'a')
- Bowl pressure is too uniform — needs to be much heavier on the left side going down and at the bottom-left
- Top of bowl pressure is about right (thin)
- Downstroke weight is good
- Bowl shape needs more bottom-left bulge
