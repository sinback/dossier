"""h→e coarticulation — h's mid-word exit is a band-true slice of the
canonical LOW band (to/01 path3) replacing the traced h→next tail (which
rises at ~36° while the band crawls the baseline; the tail survives in
exit:'none' forms as the kept word-final stroke). e's low entrance is
the band-true slice from the "from" bring-up. Same scan anchor → the
curs overlay must reconstruct the trace.
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


def test_h_exit_and_e_entrance_reconstruct_the_band():
    placed, _ = compose("he")
    h_exit = placed_component(placed[0], "exit")
    e_entrance = placed_component(placed[1], "entrance")
    assert not h_exit.is_empty and not e_entrance.is_empty

    ratio = coarticulation_ratio(h_exit, e_entrance)
    assert ratio > COARTICULATION_MIN, (
        f"h.exit / e.entrance coarticulation {ratio:.2f} — both should be "
        f"band-true slices of to/01 path3 pinned at (41.25, 71.64)"
    )


def test_he_seam_is_connected_and_drift_free():
    placed, seams = compose("he")
    assert len(seams) == 1
    s = seams[0]
    assert s["components"] == 1, "h and e ink must touch at the seam"
    assert abs(s["drift"]) < 1.5
