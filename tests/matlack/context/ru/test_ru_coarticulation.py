"""r→u coarticulation — r's mid-word exit (band-true slice of to/01
path3, from the "from" bring-up; frozen reference geometry) against u's
new low entrance: a band-true slice of the same trace whose end lands ON
the traced entrance line (split at t=0.56, G1 within 0.5 degrees). Same
scan anchor -> the curs overlay must reconstruct the trace.
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


def test_r_exit_and_u_entrance_reconstruct_the_band():
    placed, _ = compose("ru")
    r_exit = placed_component(placed[0], "exit")
    u_entrance = placed_component(placed[1], "entrance")
    assert not r_exit.is_empty and not u_entrance.is_empty

    ratio = coarticulation_ratio(r_exit, u_entrance)
    assert ratio > COARTICULATION_MIN, (
        f"r.exit / u.entrance coarticulation {ratio:.2f} — both should be "
        f"band-true slices of to/01 path3 pinned at (41.25, 71.64)"
    )


def test_ru_seam_is_connected_and_drift_free():
    placed, seams = compose("ru")
    assert len(seams) == 1
    s = seams[0]
    assert s["components"] == 1, "r and u ink must touch at the seam"
    assert abs(s["drift"]) < 1.5
