"""e→l coarticulation — e's exit (band-true slice from the "from"
bring-up, sinback-approved geometry, frozen) against l's new low
entrance (band-true slice of the same to/01 path3 trace, bridged
straight into the ascender upstroke). Same scan anchor → the curs
overlay must reconstruct the trace.
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


def test_e_exit_and_l_entrance_reconstruct_the_band():
    placed, _ = compose("el")
    e_exit = placed_component(placed[0], "exit")
    l_entrance = placed_component(placed[1], "entrance")
    assert not e_exit.is_empty and not l_entrance.is_empty

    ratio = coarticulation_ratio(e_exit, l_entrance)
    assert ratio > COARTICULATION_MIN, (
        f"e.exit / l.entrance coarticulation {ratio:.2f} — both should be "
        f"band-true slices of to/01 path3 pinned at (41.25, 71.64)"
    )


def test_el_seam_is_connected_and_drift_free():
    placed, seams = compose("el")
    assert len(seams) == 1
    s = seams[0]
    assert s["components"] == 1, "e and l ink must touch at the seam"
    assert abs(s["drift"]) < 1.5
