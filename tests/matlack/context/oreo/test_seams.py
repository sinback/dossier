"""Seam checks for the composed word 'oreo' — the first all-letters-joined
milestone (o→r high join, r→e and e→o low joins, all four letter forms).

Guards the join conventions in matlackGlyphs.js: low anchors at 15% x-height,
high anchors at 71.6%, every anchor ON its own stroke with overlap to spare.
If a seam fails here, check GLYPH_JOIN_ANCHORS heights (drift), flick reach
(overlap/components), and VARIANT_SUPPORT degradation before touching the
letterforms themselves.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[4] / "matlack" / "tools"))

from compose_word import compose  # noqa: E402


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
            # perfect") measures 0°. High joins are crossings — exempt.
            assert s["kink"] is not None and s["kink"] < 15.0, (
                f"seam {s['pair']}: kink {s['kink']}° — connector strokes "
                f"should ride the same climb through the join band"
            )
