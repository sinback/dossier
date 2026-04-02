# Bowl Ellipse Model — Cross-Letter Findings

The two-ellipse model (outer - inner = ink) is validated across 'a' and 'b'.
All hand-traced bowls fit ellipses with residuals < 0.08.

## Consistent properties across letters

- **Tilt is ~-44°** for both inner and outer ellipses in both 'a' and 'b'.
  This is a property of Matlack's hand (nib angle + writing slant), not
  the individual letter. Expect this to hold for all bowl-family letters.

- **Inner aspect ratio ~0.41-0.43** (semi-minor / semi-major). The counter
  shape is very elongated and consistent. Same hand = same counter shape.

- **Nearly concentric** — inner and outer centers are within ~4px (at 4x scale).
  The offset is mostly vertical, not horizontal.

## Per-letter differences

### Lowercase 'a' (ref 09, 4x scale)
- Inner: cx=55.1, cy=51.7, a=32.8, b=14.1, tilt=-44.9°, aspect=0.43
- Outer: cx=51.7, cy=50.2, a=47.9, b=26.5, tilt=-40.3°, aspect=0.55
- Center offset: (-3.4, -1.5)
- Tilt difference: **4.6°** — creates dramatic thin-top / fat-bottom-left
- Outer/inner size ratio: a=1.46×, b=1.88×

### Lowercase 'b' (ref 01, 4x scale)
- Inner: cx=34.7, cy=149.2, a=26.6, b=11.0, tilt=-43.5°, aspect=0.41
- Outer: cx=34.8, cy=145.0, a=50.3, b=21.1, tilt=-42.2°, aspect=0.42
- Center offset: (0.1, -4.2)
- Tilt difference: **1.3°** — more uniform width around the bowl
- Outer/inner size ratio: a=1.89×, b=1.92×
- Bowl is **smaller** than 'a' (inner a=26.6 vs 32.8)
- Outer/inner ratio is **larger** than 'a' (1.9× vs 1.5-1.9×), but the
  overall bowl reads as thinner because the absolute size is smaller.

## What the tilt difference means

The tilt difference between inner and outer ellipses controls how much the
stroke width varies around the bowl:

- **Large tilt diff (4-5°):** Dramatic variation — thin at top, fat at bottom.
  This is the 'a' character where the bowl has a clear light/heavy contrast.
- **Small tilt diff (1-2°):** More uniform width — the bowl reads as an even
  stroke all around. This is 'b' where the bowl is more regular.
- **Zero tilt diff:** Perfectly uniform width (theoretical — not observed).

This is a simple, powerful parameter for controlling per-letter personality.

## Predictions for other bowl letters

Based on the pattern, expect:
- **'o':** Similar tilt (~-44°), maybe even less tilt difference than 'b'
  since it's the simplest bowl with no attached stroke.
- **'d':** Similar to 'a' (bowl + tall stroke), probably similar tilt diff.
- **'c':** Partial bowl, may not close cleanly for ellipse fitting.
  The open side is the thin part (right side).
- **'g', 'q':** Bowl + descender. Bowl should match 'a'/'b' in shape.
