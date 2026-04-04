# Bowl Ellipse Model — Cross-Letter Findings

The two-ellipse model (outer - inner = ink) is validated across 'a', 'b', 'f',
and 'o'. Hand-traced bowls fit ellipses with residuals < 0.08. Automated
crescent fitting (scipy Nelder-Mead on thresholded reference images) has also
been validated for 'o', confirming the model works for both manual and
automated extraction pipelines.

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

### Lowercase 'f' — bar-bowl (ref fir/01, 4x scale)
- The bar-bowl (elongated stem) uses the same two-ellipse model.
- Inner: cx=171.4, cy=74.6, a=52.9, b=7.1, tilt=-48.8°, aspect=0.13
- Outer: cx=176.0, cy=71.8, a=84.9, b=14.4, tilt=-50.0°, aspect=0.17
- Tilt difference: **1.2°** — very uniform width (like 'b')
- Extremely elongated (aspect 0.13-0.17) — this is a stem, not a round bowl.
- Additional components: fat bar (descender), hairline crossbar.

### Lowercase 'o' (ref 03, 1x from high-res facsimile — automated fit)
- Inner: cx=40.3, cy=33.5, a=20.8, b=10.8, tilt=-45.5°
- Outer: cx=38.2, cy=33.1, a=38.8, b=15.3, tilt=-45.5°
- Center offset: (-2.1, -0.4) — nearly concentric
- Tilt difference: **0.0°** — most uniform width of all letters (predicted!)
- Outer/inner ratio: a=1.87×, b=1.42×
- Fitted via automated crescent model, not hand-traced.

## Confirmed predictions

- **'o' tilt: -45.5°** — confirmed, matching the ~-44° hand constant.
- **'o' tilt diff: 0°** — even less than 'b' (1.3°), as predicted.
- **'f' tilt: -48.8°/-50.0°** — slightly steeper but within the hand's range.

## Remaining predictions

- **'d':** Similar to 'a' (bowl + tall stroke), probably similar tilt diff.
- **'c':** Partial bowl (~260° arc). Automated fitting attempted but
  contamination from neighboring letters makes isolation harder.
  Tilted-crop capture strategy may improve results.
- **'g', 'q':** Bowl + descender. Bowl should match 'a'/'b' in shape.

## Automated fitting notes

For simple, isolated bowls (like 'o'), automated crescent fitting works well:
1. Threshold image to binary (ink < 140 for high-res facsimile)
2. Find largest connected component
3. Optimize two-ellipse crescent (outer - inner) to minimize pixel mismatch
4. Constrain inner/outer tilt difference to < 5° (known from hand data)

For compound letters or letters with cursive connections, hand-traced paths
remain more reliable. The tilted-crop technique (rotating the source image
by ~45° before rectangle-selecting) may help isolate letters whose strokes
overlap with neighbors due to the consistent writing slant.
