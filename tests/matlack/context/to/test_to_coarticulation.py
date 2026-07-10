"""t→o coarticulation — this pair IS the canonical LOW band's source:
to/01 path3 ('t Exit Flick → o Entry'). t.exit is a band-true slice whose
start sits inside the fat bar's foot ink (zero bridge); o's low entrance
is the other side of the same trace. The curs overlay must reconstruct it.
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


def test_t_exit_and_o_entrance_reconstruct_the_band():
    placed, _ = compose("to")
    t_exit = placed_component(placed[0], "exit")
    o_entrance = placed_component(placed[1], "entrance")
    assert not t_exit.is_empty and not o_entrance.is_empty

    ratio = coarticulation_ratio(t_exit, o_entrance)
    assert ratio > COARTICULATION_MIN, (
        f"t.exit / o.entrance coarticulation {ratio:.2f} — both are slices "
        f"of to/01 path3 pinned at (41.25, 71.64); this is the source pair "
        f"and must reconstruct the trace"
    )


def test_to_seam_is_connected_and_drift_free():
    placed, seams = compose("to")
    assert len(seams) == 1
    s = seams[0]
    assert s["components"] == 1, "t and o ink must touch at the seam"
    assert abs(s["drift"]) < 1.5
