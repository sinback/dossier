"""f→r coarticulation — both connectors are band-true slices of the
canonical HIGH band (or/01 path2), pinned at the same scan anchor
(46.22, 30.11), so the curs overlay must reconstruct the trace. There is
no traced f→r scan; this join is correct by construction of the band rule.
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


def test_f_exit_and_r_entrance_reconstruct_the_band():
    placed, _ = compose("fr")
    f_exit = placed_component(placed[0], "exit")
    r_entrance = placed_component(placed[1], "entrance")
    assert not f_exit.is_empty and not r_entrance.is_empty

    ratio = coarticulation_ratio(f_exit, r_entrance)
    assert ratio > COARTICULATION_MIN, (
        f"f.exit / r.entrance coarticulation {ratio:.2f} — both should be "
        f"band-true slices of or/01 path2 pinned at (46.22, 30.11)"
    )
