"""Matlack glyph tests — server bailout + shared fixtures.

Current scope: strict tests against synthesized glyph output from the
live /api/outlines endpoint. Dev server must be running.

If/when source-material tests arrive (against traced path files under
matlack/reference/...), they need different semantics — source is
ground truth, so violations should surface as warnings/reports rather
than hard failures. Give them their own sibling directory or marker
at that point; don't relax the strict tests here to accommodate them.
"""
import json
from urllib.error import URLError
from urllib.request import urlopen

import pytest

DEV_SERVER = "http://localhost:3000"


def pytest_collection_modifyitems(config, items):
    try:
        urlopen(f"{DEV_SERVER}/api/outlines?letter=o", timeout=0.5).close()
    except URLError:
        pytest.exit(
            "Dev server down. Run `npm run dev`. Bye 👋",
            returncode=2,
        )


@pytest.fixture
def outlines():
    """Factory: outlines(letter) -> the component outlines dict from /api/outlines."""
    def _fetch(letter: str) -> dict:
        with urlopen(f"{DEV_SERVER}/api/outlines?letter={letter}") as r:
            return json.load(r)["outlines"]
    return _fetch
