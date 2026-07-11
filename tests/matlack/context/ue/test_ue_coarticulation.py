"""u→e coarticulation — u's new band-true exit against e's low entrance
(band-true slice from the "from" bring-up, sinback-approved geometry,
frozen). Same scan anchor -> the curs overlay must reconstruct the
trace. Also exercises u's exit bridge (authored from inside the second
valley's ink — the h island lesson) against a partner whose entrance
slice starts 12.1 su into the trace.
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


def test_u_exit_and_e_entrance_reconstruct_the_band():
    placed, _ = compose("ue")
    u_exit = placed_component(placed[0], "exit")
    e_entrance = placed_component(placed[1], "entrance")
    assert not u_exit.is_empty and not e_entrance.is_empty

    ratio = coarticulation_ratio(u_exit, e_entrance)
    assert ratio > COARTICULATION_MIN, (
        f"u.exit / e.entrance coarticulation {ratio:.2f} — both should be "
        f"band-true slices of to/01 path3 pinned at (41.25, 71.64)"
    )


def test_ue_seam_is_connected_and_drift_free():
    placed, seams = compose("ue")
    assert len(seams) == 1
    s = seams[0]
    assert s["components"] == 1, "u and e ink must touch at the seam"
    assert abs(s["drift"]) < 1.5
