"""'from' — the second composed word (f→r, r→o, o→m), all band-true.

f→r and o→m reconstruct the canonical HIGH band (or/01 path2); r→o the
LOW band (to/01 path3). m's high entrance + f's exit + r's mid-word exit
were derived with derive_band.py; see join-architecture.md.
"""
import sys
from pathlib import Path

from shapely import affinity

sys.path.insert(0, str(Path(__file__).resolve().parents[4] / "matlack" / "tools"))

from compose_word import coarticulation_ratio, compose  # noqa: E402
from render_glyph import component_geometry  # noqa: E402


def placed_component(placed_letter, label):
    geom = component_geometry(placed_letter["render"], label)
    s = placed_letter["scale"]
    geom = affinity.scale(geom, xfact=s, yfact=s, origin=(0, 0))
    return affinity.translate(geom, placed_letter["dx"], placed_letter["dy"])


def test_from_seams_all_join():
    placed, seams = compose("from")
    assert len(seams) == 3
    for s in seams:
        assert s["overlap"] > 0, f"seam {s['pair']}: no shared ink"
        assert s["components"] == 1, f"seam {s['pair']}: letters don't touch"
        assert s["drift"] is not None and abs(s["drift"]) < 1.5, (
            f"seam {s['pair']}: baseline drift {s['drift']} su"
        )
        assert s["coarticulation"] > 0.6, (
            f"seam {s['pair']}: coarticulation {s['coarticulation']:.2f} — "
            f"all three 'from' joins are band-true and must reconstruct "
            f"their canonical band"
        )


def test_o_exit_and_m_entrance_reconstruct_the_band():
    placed, _ = compose("om")
    o_exit = placed_component(placed[0], "exit")
    m_entrance = placed_component(placed[1], "entrance")
    assert not o_exit.is_empty and not m_entrance.is_empty
    ratio = coarticulation_ratio(o_exit, m_entrance)
    assert ratio > 0.6, (
        f"o.exit / m.entrance coarticulation {ratio:.2f} — both are or/01 "
        f"path2 slices pinned at (46.22, 30.11)"
    )
