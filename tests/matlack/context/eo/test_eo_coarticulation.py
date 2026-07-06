"""e→o coarticulation — the strokes must overlay, not merely cross.

There is no traced e→o scan, so the canonical LOW-band trace is to/01
path3 seg B ('t Exit Flick → o Entry'), pinned at sinback's human-picked
anchor (41.25, 71.64) — exactly as or/01 path2 is the canonical HIGH-band
trace. e's exit connector and o's low entrance connector are both
band-true slices of that curve; the curs overlay must reconstruct it.

Written 2026-07-06 against a broken state (e had no labeled exit
connector; o's low entrance was an authored curve, not a trace slice).
"""
import sys
from pathlib import Path

from shapely import affinity

sys.path.insert(0, str(Path(__file__).resolve().parents[4] / "matlack" / "tools"))

from compose_word import coarticulation_ratio, compose  # noqa: E402
from render_glyph import component_geometry  # noqa: E402

COARTICULATION_MIN = 0.6


def placed_component(placed_letter, label):
    """A labeled component's geometry, in the composed word's frame."""
    geom = component_geometry(placed_letter["render"], label)
    s = placed_letter["scale"]
    geom = affinity.scale(geom, xfact=s, yfact=s, origin=(0, 0))
    return affinity.translate(geom, placed_letter["dx"], placed_letter["dy"])


def test_e_exit_and_o_entrance_reconstruct_the_trace():
    placed, _ = compose("eo")
    e_exit = placed_component(placed[0], "exit")
    o_entrance = placed_component(placed[1], "entrance")
    assert not e_exit.is_empty, "e has no labeled 'exit' connector"
    assert not o_entrance.is_empty, "o has no labeled 'entrance' connector"

    ratio = coarticulation_ratio(e_exit, o_entrance)
    assert ratio > COARTICULATION_MIN, (
        f"e.exit / o.entrance coarticulation {ratio:.2f} — the two slices "
        f"of to/01 seg B don't overlay; check that both anchors map the "
        f"same scan point (41.25, 71.64) through their placement transforms"
    )


def test_eo_seam_coarticulation():
    """Composite-level guard using full letter inks (what compose reports)."""
    _, seams = compose("eo")
    s = seams[0]
    assert s["coarticulation"] > COARTICULATION_MIN, (
        f"e→o coarticulation {s['coarticulation']:.2f} — strokes cross or "
        f"run offset instead of overlaying the shared to/01 trace"
    )
