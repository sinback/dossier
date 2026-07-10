"""t→h coarticulation — both connectors are band-true slices of the
canonical LOW band (to/01 path3), pinned at the same scan anchor
(41.25, 71.64). There is no traced t→h scan; the join is correct by
construction of the band rule. (h's first low entrance was a straight
extension of its traced hang — it crossed t's band-true exit at a
shallow angle, coart 0.07. Band-true conversion fixed it; keep it that
way.)
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


def test_t_exit_and_h_entrance_reconstruct_the_band():
    placed, _ = compose("th")
    t_exit = placed_component(placed[0], "exit")
    h_entrance = placed_component(placed[1], "entrance")
    assert not t_exit.is_empty and not h_entrance.is_empty

    ratio = coarticulation_ratio(t_exit, h_entrance)
    assert ratio > COARTICULATION_MIN, (
        f"t.exit / h.entrance coarticulation {ratio:.2f} — both should be "
        f"band-true slices of to/01 path3 pinned at (41.25, 71.64)"
    )


def test_th_seam_is_connected_and_drift_free():
    placed, seams = compose("th")
    assert len(seams) == 1
    s = seams[0]
    assert s["components"] == 1, "t and h ink must touch at the seam"
    assert abs(s["drift"]) < 1.5
