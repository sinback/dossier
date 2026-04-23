"""Topology checks for Matlack-hand 'o'.

Matlack-specific — other hands (brush, Spencerian, display lettering)
may legitimately produce twisted bowls. This file certifies Matlack
conformance, not "valid glyph." If a rule fires for a context that's
actually correct, scope the rule narrower; don't relax the check.
"""
from shapely.geometry import Polygon


def test_matlack_o_bowl_ribbon_does_not_twist(outlines):
    """Matlack's 'o' bowl draws a clean ribbon: inner boundary stays
    entirely inside outer boundary (no self-intersection, no twist).

    Proxy check: outer_polygon.contains(inner_polygon). Numerical test
    for a topological property — if it fires, the ribbon has either
    twisted, self-intersected, or necked thin enough for inner to poke
    through outer.
    """
    bowl = outlines("o")["bowl"]
    outer = Polygon(bowl["outer"])
    inner = Polygon(bowl["inner"])
    assert outer.contains(inner), (
        "Matlack 'o' rule: outer bowl must strictly contain inner bowl "
        "(no ribbon twist, no self-intersection). If this fires for a "
        "new variant, confirm whether geometry is actually broken or "
        "whether the rule should scope more narrowly."
    )
