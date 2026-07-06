"""Seam checks for the composed word 'oreo' — the first all-letters-joined
milestone (o→r high join, r→e and e→o low joins, all four letter forms).

Guards the join conventions in matlackGlyphs.js: low anchors at 15% x-height,
high anchors at 71.6%, every anchor ON its own stroke with overlap to spare.
If a seam fails here, check GLYPH_JOIN_ANCHORS heights (drift), flick reach
(overlap/components), and VARIANT_SUPPORT degradation before touching the
letterforms themselves.

Two independent kink signals, deliberately kept side by side:
  stroke_kink  — PCA over rendered ink near the anchor. A sanity check on
                 the actual generated output (this is what caught o→r's
                 85° overshoot pre-908363a and confirmed the fix down to
                 2°). Undirected, though — it folds at 180°, so it can't
                 tell a clean join from a full reversal. Only asserted for
                 low joins: at a high join the sampling disc can pick up
                 the next letter's body ink where the connector tail hands
                 off, which could bias the estimate even when the
                 underlying connector curves are fine — a standing risk,
                 not a currently-observed failure (both metrics agree here
                 today).
  tangent_kink — direction of travel from the authored connector curve
                 itself (render['joinTangents'], see joinTangentsForVariant
                 in matlackGlyphs.js), not from rendered ink at all. So it
                 doesn't share stroke_kink's 180°-fold blind spot, and it
                 isn't exposed to the body-ink contamination risk above —
                 asserted across every join, low or high.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[4] / "matlack" / "tools"))

from compose_word import compose, stroke_kink, tangent_kink  # noqa: E402


def test_tangent_kink_is_directed():
    """The property that motivates tangent_kink existing alongside
    stroke_kink: a full reversal must read 180°, not fold back to look
    like a perfect join the way the undirected PCA stroke_kink does."""
    assert tangent_kink(10.0, 190.0) == 180.0
    assert stroke_kink(10.0, 190.0) == 0.0  # PCA folds — can't see the cusp
    assert tangent_kink(10.0, 12.0) == 2.0


def test_oreo_seams_join_cleanly():
    _, seams = compose("oreo")
    assert len(seams) == 3
    for s in seams:
        assert s["overlap"] > 0, (
            f"seam {s['pair']}: strokes don't share ink — a flick stopped "
            f"short of the join band"
        )
        assert s["components"] == 1, (
            f"seam {s['pair']}: letters don't merge near the anchor "
            f"(visible gap)"
        )
        assert s["drift"] is not None and abs(s["drift"]) < 1.5, (
            f"seam {s['pair']}: baseline drift {s['drift']} su — an anchor "
            f"height is off its join-class convention"
        )
        if s["join_class"] == "low":
            # Low joins are collinear handoffs; r→e (sinback: "actually
            # perfect") measures 0°. High joins are exempt from this one —
            # see module docstring.
            assert s["stroke_kink"] is not None and s["stroke_kink"] < 15.0, (
                f"seam {s['pair']}: stroke_kink {s['stroke_kink']}° — "
                f"connector strokes should ride the same climb through the "
                f"join band"
            )

        # tangent_kink isn't exposed to the high-join contamination risk
        # stroke_kink has — assert it everywhere. Band-true joins (all
        # three in 'oreo') measure a couple degrees at most; anything past
        # 15° means a connector's authored curve doesn't actually continue
        # into its partner's.
        assert s["tangent_kink"] is not None and s["tangent_kink"] < 15.0, (
            f"seam {s['pair']}: tangent_kink {s['tangent_kink']}° — the "
            f"connector curves' directions of travel don't continue into "
            f"each other at the join"
        )
