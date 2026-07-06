"""o→r join coincidence — the strokes must overlay, not merely cross.

o's exit connector and r's afterHigh entrance connector are both slices of
the SAME traced transition (or/01 path2, 'o Exit → r Entry'). When curs
aligns the anchors, the two slices must reconstruct that trace: wherever
they run near each other, they ride on top of each other. Crossing at an
angle, or running parallel with an offset, fails.

This requires each glyph's join anchor to be the SAME scan-space point of
the shared trace, mapped through the same transform that placed that
glyph's slice (including any nudges). Written 2026-07-06 against a broken
state (anchors corresponded to different scan points → offset strokes).
"""
import sys
from pathlib import Path

from shapely import affinity

sys.path.insert(0, str(Path(__file__).resolve().parents[4] / "matlack" / "tools"))

from compose_word import coincidence_ratio, compose  # noqa: E402
from render_glyph import component_geometry  # noqa: E402

COINCIDENCE_MIN = 0.6


def placed_component(placed_letter, label):
    """A labeled component's geometry, in the composed word's frame."""
    geom = component_geometry(placed_letter["render"], label)
    s = placed_letter["scale"]
    geom = affinity.scale(geom, xfact=s, yfact=s, origin=(0, 0))
    return affinity.translate(geom, placed_letter["dx"], placed_letter["dy"])


def test_o_exit_and_r_entrance_reconstruct_the_trace():
    placed, _ = compose("or")
    o_exit = placed_component(placed[0], "exit")
    r_entrance = placed_component(placed[1], "entrance")
    assert not o_exit.is_empty and not r_entrance.is_empty

    ratio = coincidence_ratio(o_exit, r_entrance)
    assert ratio > COINCIDENCE_MIN, (
        f"o.exit / r.entrance coincidence {ratio:.2f} — the two slices of "
        f"or/01 path2 don't overlay; the join anchors probably correspond "
        f"to different scan points of the shared trace"
    )


def test_or_seam_coincidence():
    """Composite-level guard using full letter inks (what compose reports)."""
    _, seams = compose("or")
    s = seams[0]
    assert s["coincidence"] > COINCIDENCE_MIN, (
        f"o→r coincidence {s['coincidence']:.2f} — strokes cross or run "
        f"offset instead of overlaying the shared or/01 trace"
    )
