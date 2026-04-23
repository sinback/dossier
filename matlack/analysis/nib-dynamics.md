# Nib Dynamics

Observations about velocity, pressure, and nib angle inferred from stroke width
and ink density in the reference images. We can't measure velocity directly from
static images, but stroke width with a quill is a strong proxy:
**thinner = faster, thicker = slower/more pressure.**

Telemetry from our stroke planner (velocity, curvature, pressure at each sample)
will be compared against these observations to validate or correct our models.

---

## Lowercase 'a'

**References:** lowercase/a/01–10.png

### Width profile along the stroke
- **Entry hairline** (top-right): Very thin. **Inferred:** fast entry, light touch.
- **Bowl arc** (sweep left, down, around): Consistently thin, relatively even width. **Inferred:** sustained moderate-to-high velocity, light pressure throughout the arc. The pen is moving quickly through the bowl — it's a ballistic sweep, not a careful trace.
- **Transition zone** (top-right, where bowl meets downstroke): Width increases abruptly. **Inferred:** sharp deceleration as the hand reverses direction from the upward bowl return into the downward stroke.
- **Downstroke** (right side, top to bottom): Thickest part of the letter. **Inferred:** slow, deliberate, high pressure. This is where Matlack is "writing" — the bowl is preparation, the downstroke is the main event.
- **Exit** (bottom of downstroke): Slight thinning, sometimes a rightward flick. **Inferred:** acceleration as the pen lifts or moves toward the next letter.

### Pressure model implications
The 'a' has two distinct pressure regimes:
1. **Low pressure / high velocity:** the entire bowl arc
2. **High pressure / low velocity:** the downstroke

This is NOT a gradual transition — it's a fairly abrupt shift at the direction change. A sigma-lognormal model with separate pulses for bowl and downstroke would naturally produce this: the bowl pulse is fast (low σ, high peak velocity), the downstroke pulse is slower (higher σ or simply lower peak velocity with more amplitude/distance).

### Nib angle observations
- **Observed:** Consistent ~40-50° nib angle throughout (typical for English round hand). The thin horizontals and thick verticals are a natural consequence of this held angle, not active rotation.
- **Observed:** No visible nib rotation within the letter — Matlack holds the angle steady.

---

## Named arc zone constants

The bowl width profile around a counter-clockwise arc is parameterized by four
named constants representing key transitions in pressure/velocity. These were
empirically derived from 'a' and validated across c, d, g, and q:

| Constant   | Value | Position        | What happens                         |
|------------|-------|-----------------|--------------------------------------|
| ARC_ENTRY  | 0.00  | Upper-right     | Pen enters — hairline, fast, light   |
| ARC_LIFT   | 0.22  | Top-left        | Pen lightens — thin floor ends       |
| ARC_PRESS  | 0.55  | Bottom-left     | Peak pressure begins — fat zone      |
| ARC_RISE   | 0.78  | Bottom-right    | Pen starts rising — taper-out begins |

The width function between these zones uses smoothStep interpolation. The thin
floor (ARC_ENTRY → ARC_LIFT) varies per letter: 0.20 for 'a', 0.25 for 'd',
0.30 for 'c'. The fat zone (ARC_PRESS → ARC_RISE) is consistently 1.0 (full
width) across all bowl letters.

These constants are shared across the entire bowl family, reinforcing the
observation that the pressure profile is a property of Matlack's hand, not
individual letters.

---

## Power taper coefficient

Flick strokes (entry hairlines, exit tails) follow a **(1-t)^1.7** power-law
width decay. This was discovered by measuring flick widths at multiple points
along the taper in reference images and fitting the exponent.

The 1.7 exponent is consistent across all letters that have flicks — it's a
biomechanical constant of the pen-lift gesture. It produces a taper that is:
- Slightly faster than linear (1.0) at the start
- Slightly slower than quadratic (2.0) overall
- A good match for the way pressure decays as the hand lifts: rapid initial
  unloading, then a slower trailing-off as the last fibers of the nib leave
  the paper surface

This coefficient is used in buildTaperedRibbon and is shared across all letters
via the flick parameter objects (e.g., `taperPower: 1.7`).

---

## Width profile for non-bowl letters

Several letters revealed that Matlack's width variation extends beyond the
bowl arc zones:

- **'s':** Nearly uniform width through the S-curve. Unlike bowl letters where
  width varies dramatically with arc position, the S-curve maintains steady
  pressure — likely because both halves of the S involve near-vertical tangents
  (perpendicular to nib angle), so the nib projects consistently wide.

- **'x':** Two crossing crescent ribbons with symmetric lens-shaped width —
  widest at the crossing point, tapering to both ends. The symmetry suggests
  Matlack treats each stroke of 'x' as a single ballistic movement.

- **'n', 'm':** Hump ribbons with width that peaks at the top of the arch and
  tapers at entry/exit. Similar motor pattern to the bowl's left side (near-
  vertical tangent = wide), but without the enclosed-counter geometry.
