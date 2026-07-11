"""u→m coarticulation — u's mid-word exit is a band-true slice of the
canonical LOW band (to/01 path3), reached through an authored bridge
from inside the second valley's ink (the traced exit flick, which rises
at ~-43 degrees to a 70%-xh tip, is truncated along with the valley lip
it attached to; both stay in exit:'none' forms). m's low entrance is the
band-true slice from the "from" bring-up. Same scan anchor -> the curs
overlay must reconstruct the trace. This is the "ipsum" u->m seam.
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


def test_u_exit_and_m_entrance_reconstruct_the_band():
    placed, _ = compose("um")
    u_exit = placed_component(placed[0], "exit")
    m_entrance = placed_component(placed[1], "entrance")
    assert not u_exit.is_empty and not m_entrance.is_empty

    ratio = coarticulation_ratio(u_exit, m_entrance)
    assert ratio > COARTICULATION_MIN, (
        f"u.exit / m.entrance coarticulation {ratio:.2f} — both should be "
        f"band-true slices of to/01 path3 pinned at (41.25, 71.64)"
    )


def test_um_seam_is_connected_and_drift_free():
    placed, seams = compose("um")
    assert len(seams) == 1
    s = seams[0]
    assert s["components"] == 1, "u and m ink must touch at the seam"
    assert abs(s["drift"]) < 1.5
