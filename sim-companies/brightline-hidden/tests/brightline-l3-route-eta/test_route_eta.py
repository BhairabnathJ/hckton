"""Hidden test for ticket brightline-l3-route-eta (L3 — NEW feature).

Feature under test: ``GET /routes/{route_id}/eta`` returning an ETA computed
from the route's ``distance`` and ``average_speed`` (``eta_hours =
distance / average_speed``), with a not-found error for an unknown route id.

This suite is SERVER-ONLY (lives in brightline-hidden) and is executed by the
grader/verifier against a checkout of the student ``brightline`` repo:

- against the ``ticket/l3-route-eta`` branch the dedicated endpoint is ABSENT,
  so ``GET /routes/{id}/eta`` is not registered → the "known route returns a
  computed ETA" assertion fails (fail-before, >= 1 failing test).
- against the ``solutions/brightline-l3-route-eta`` reference solution the
  endpoint exists → every test passes (pass-after).

The suite is fully self-contained: it points ``BRIGHTLINE_DB_PATH`` at a
throwaway temp SQLite file and seeds it *before* importing any ``app`` module,
then drives the app via FastAPI's ``TestClient``. The ``app`` package is
resolved from ``PYTHONPATH`` (set by the caller to the branch tree or the
reference-solution tree), so the same test file exercises both.
"""

from __future__ import annotations

import math
import os
import tempfile
from collections.abc import Iterator
from pathlib import Path

import pytest

# Point the app at a throwaway DB BEFORE importing any app module: app.db reads
# BRIGHTLINE_DB_PATH when it builds its module-level engine at import time.
_TMP_DIR = tempfile.mkdtemp(prefix="brightline-l3-hidden-")
_DB_PATH = Path(_TMP_DIR) / "test.db"
os.environ["BRIGHTLINE_DB_PATH"] = str(_DB_PATH)


def _seed_once() -> None:
    """Create tables and load the standard seed data into the temp DB."""
    from app.seed import run_seed

    run_seed()


_seed_once()


@pytest.fixture()
def client() -> Iterator[object]:
    """A FastAPI ``TestClient`` against the app backed by the seeded temp DB."""
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def known_route(client) -> dict:
    """Fetch a known route (id=1) and its distance/average_speed.

    Uses the existing ``GET /routes/{id}`` resource — present on every branch
    and the solution — to obtain the ground-truth distance and speed without
    assuming anything about the feature under test.
    """
    response = client.get("/routes/1")
    assert response.status_code == 200, "seeded route id=1 must exist on /routes/{id}"
    body = response.json()
    return {
        "id": body["id"],
        "distance": body["distance"],
        "average_speed": body["average_speed"],
    }


def test_route_eta_known_route_returns_computed_eta(client, known_route) -> None:
    """A known route returns an ETA = distance / average_speed.

    This is the fail-before assertion: on the L3 branch the endpoint is absent
    so the request is not a 200 and this assertion fails; on the reference
    solution the endpoint returns the computed ETA and it passes.
    """
    route_id = known_route["id"]
    expected_eta = known_route["distance"] / known_route["average_speed"]

    response = client.get(f"/routes/{route_id}/eta")

    assert response.status_code == 200, (
        "GET /routes/{id}/eta must be registered and return 200 for a known "
        f"route (got {response.status_code}); the L3 feature is absent on the "
        "ticket branch"
    )
    body = response.json()
    assert "eta_hours" in body, "response must carry the computed eta_hours"
    assert math.isclose(body["eta_hours"], expected_eta, rel_tol=1e-9, abs_tol=1e-9), (
        f"eta_hours {body['eta_hours']!r} must equal distance/average_speed "
        f"({expected_eta!r})"
    )


def test_route_eta_unknown_route_returns_404(client) -> None:
    """An unknown route id yields a 404 not-found response.

    Guarded so it cannot spuriously pass on the branch: if the endpoint is not
    registered at all, FastAPI returns 404 for the unknown id too, which would
    make this test green without the feature. We therefore first require the
    endpoint to exist (a KNOWN route must return 200), and only then assert the
    unknown-id 404. On the branch the known-route probe fails, so this test
    also fails — avoiding a false pass and a zero-tests-executed situation.
    """
    # The endpoint must exist: a known route must return 200. If it does not
    # (feature absent on the branch), fail here rather than letting the
    # unknown-id 404 pass trivially.
    known = client.get("/routes/1/eta")
    assert known.status_code == 200, (
        "GET /routes/{id}/eta must be registered (known route returns 200) "
        f"before the unknown-id 404 is meaningful; got {known.status_code}"
    )

    response = client.get("/routes/999999/eta")
    assert response.status_code == 404, (
        f"unknown route id must yield 404 not-found (got {response.status_code})"
    )
