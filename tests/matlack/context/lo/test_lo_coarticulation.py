"""l→o coarticulation — l's mid-word exit is a band-true slice of the
canonical LOW band (to/01 path3) whose start sits dead center of the
baseline turn's valley ink (zero bridge, the t recipe); the traced
l→next tail (rising at ~35° while the band crawls the baseline) is
truncated in exit:'low' forms and kept for fina/isol. o's low entrance
is the other side of the same trace — the curs overlay must
reconstruct it. This is the "lorem" seam.
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


def test_l_exit_and_o_entrance_reconstruct_the_band():
    placed, _ = compose("lo")
    l_exit = placed_component(placed[0], "exit")
    o_entrance = placed_component(placed[1], "entrance")
    assert not l_exit.is_empty and not o_entrance.is_empty

    ratio = coarticulation_ratio(l_exit, o_entrance)
    assert ratio > COARTICULATION_MIN, (
        f"l.exit / o.entrance coarticulation {ratio:.2f} — both should be "
        f"band-true slices of to/01 path3 pinned at (41.25, 71.64)"
    )


def test_lo_seam_is_connected_and_drift_free():
    placed, seams = compose("lo")
    assert len(seams) == 1
    s = seams[0]
    assert s["components"] == 1, "l and o ink must touch at the seam"
    assert abs(s["drift"]) < 1.5
