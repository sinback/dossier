"""l→l coarticulation — both sides of the seam are band-true slices of
the canonical LOW band (to/01 path3): the first l's exit slice and the
second l's low entrance slice (whose bridge continues the band's rise
straight into the ascender upstroke). Same scan anchor → the curs
overlay must reconstruct the trace. "ll" is a top-frequency English
bigram (all, will, shall).
"""
import sys
from pathlib import Path

from shapely import affinity

sys.path.insert(0, str(Path(__file__).resolve().parents[4] / "matlack" / "tools"))

from compose_word import coarticulation_ratio, compose  # noqa: E402
from render_glyph import component_geometry  # noqa: E402

COARTICULATION_MIN = 0.6


def placed_component(placed_letter, label):
    geom = component_geometry(placed_letter["render"], label)
    s = placed_letter["scale"]
    geom = affinity.scale(geom, xfact=s, yfact=s, origin=(0, 0))
    return affinity.translate(geom, placed_letter["dx"], placed_letter["dy"])


def test_l_exit_and_l_entrance_reconstruct_the_band():
    placed, _ = compose("ll")
    first_exit = placed_component(placed[0], "exit")
    second_entrance = placed_component(placed[1], "entrance")
    assert not first_exit.is_empty and not second_entrance.is_empty

    ratio = coarticulation_ratio(first_exit, second_entrance)
    assert ratio > COARTICULATION_MIN, (
        f"l.exit / l.entrance coarticulation {ratio:.2f} — both should be "
        f"band-true slices of to/01 path3 pinned at (41.25, 71.64)"
    )


def test_ll_seam_is_connected_and_drift_free():
    placed, seams = compose("ll")
    assert len(seams) == 1
    s = seams[0]
    assert s["components"] == 1, "the two l's ink must touch at the seam"
    assert abs(s["drift"]) < 1.5
