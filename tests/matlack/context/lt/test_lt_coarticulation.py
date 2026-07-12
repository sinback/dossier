"""l→t coarticulation — regression lock for the 2026-07-11 fix: t's low
entrance was a straight-line extension of the traced hang (pre-dating
the band-true-entry lesson); l→t scored 0.00 with the letters not even
touching. Both sides are now band-true slices of to/01 path3.
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


def test_l_exit_and_t_entrance_reconstruct_the_band():
    placed, _ = compose("lt")
    l_exit = placed_component(placed[0], "exit")
    t_entrance = placed_component(placed[1], "entrance")
    assert not l_exit.is_empty and not t_entrance.is_empty

    ratio = coarticulation_ratio(l_exit, t_entrance)
    assert ratio > COARTICULATION_MIN, (
        f"l.exit / t.entrance coarticulation {ratio:.2f} — both should be "
        f"band-true slices of to/01 path3 pinned at (41.25, 71.64)"
    )


def test_lt_seam_is_connected_and_drift_free():
    placed, seams = compose("lt")
    assert len(seams) == 1
    s = seams[0]
    assert s["components"] == 1
    assert abs(s["drift"]) < 1.5
