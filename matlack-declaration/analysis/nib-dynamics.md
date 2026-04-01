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
