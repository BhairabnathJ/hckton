"""Hidden test for L1 — off-by-one pagination on ``GET /shipments``.

This suite proves page-boundary CONTINUITY: paging through the full seeded
shipment set in fixed-size pages must yield every shipment exactly once, in
order, with none skipped and none duplicated at the page boundaries.

The L1 ticket branch computes ``offset = page * pageSize`` instead of the
correct ``offset = (page - 1) * pageSize``, which shifts every page by one page
width (dropping the first page's rows entirely and skipping a row at every
boundary). That defect fails the continuity assertions below. The reference
solution (correct arithmetic) passes them.

Importability: the test does ``import app...`` so it binds to whichever ``app``
package the verifier has placed on ``PYTHONPATH`` — the checked-out ticket
branch working tree (bugged) for fail-before, or the reference solution
directory (correct) for pass-after.

The app reads ``BRIGHTLINE_DB_PATH`` at import time (``app.db`` builds its
engine at module load), so this module sets that env var to a throwaway temp
SQLite file BEFORE importing any ``app`` module.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pytest

# Point the app at a throwaway temp DB BEFORE importing any app module, so
# app.db constructs its engine against this file.
_TMP_DIR = tempfile.mkdtemp(prefix="brightline-l1-hidden-")
_DB_PATH = Path(_TMP_DIR) / "l1_pagination.db"
os.environ["BRIGHTLINE_DB_PATH"] = str(_DB_PATH)

from fastapi.testclient import TestClient  # noqa: E402  (after env var is set)

from app.main import app  # noqa: E402
from app.seed import run_seed  # noqa: E402

# Seed the temp DB once, eagerly, before any test runs.
run_seed()


@pytest.fixture()
def client():
    """A FastAPI ``TestClient`` against the app backed by the seeded temp DB."""
    with TestClient(app) as test_client:
        yield test_client


def _fetch_page(client, page: int, page_size: int) -> dict:
    response = client.get("/shipments", params={"page": page, "pageSize": page_size})
    assert response.status_code == 200, (
        f"page={page} pageSize={page_size} -> HTTP {response.status_code}: {response.text}"
    )
    return response.json()


def _total_count(client, page_size: int) -> int:
    """Read the server-reported total shipment count from any page response."""
    body = _fetch_page(client, page=1, page_size=page_size)
    assert isinstance(body["total"], int)
    return body["total"]


def _page_through(client, page_size: int) -> list[dict]:
    """Walk consecutive pages from page 1 until a short/empty page ends paging.

    Returns the concatenation of every page's items, in page order.
    """
    collected: list[dict] = []
    page = 1
    # Hard cap on iterations so a pathological off-by-one that keeps returning
    # full pages can never loop forever; the cap is generous relative to the
    # seeded set divided by page size.
    max_pages = 1000
    while page <= max_pages:
        body = _fetch_page(client, page=page, page_size=page_size)
        items = body["items"]
        collected.extend(items)
        if len(items) < page_size:
            # A page shorter than the requested size (including empty) is the
            # last page under correct pagination.
            break
        page += 1
    return collected


def test_pagination_covers_every_shipment_exactly_once() -> None:
    """Concatenating consecutive pages yields the full set exactly once.

    No shipment is skipped and none is duplicated across page boundaries. This
    FAILS on the bugged branch (offset = page * pageSize drops the first page
    and shifts every boundary) and PASSES on the correct reference solution.
    """
    page_size = 5
    with TestClient(app) as client:
        total = _total_count(client, page_size)
        assert total >= 20, f"expected seed of >= 20 shipments, got total={total}"

        collected = _page_through(client, page_size)
        collected_ids = [item["id"] for item in collected]

    # 1) No duplicates across boundaries.
    assert len(collected_ids) == len(set(collected_ids)), (
        "a shipment was duplicated across page boundaries: "
        f"collected {len(collected_ids)} items but only "
        f"{len(set(collected_ids))} are unique"
    )

    # 2) The number of collected items equals the server-reported total — none
    #    skipped, none duplicated.
    assert len(collected_ids) == total, (
        "page-boundary continuity broken: paging returned "
        f"{len(collected_ids)} shipments but total is {total} "
        "(rows skipped or duplicated at a page boundary)"
    )

    # 3) The collected ids are exactly a contiguous, ascending partition of the
    #    full ordered set — equal to the sorted unique id set with nothing lost.
    assert collected_ids == sorted(collected_ids), (
        "shipments were not returned in ascending id order across pages"
    )
    assert set(collected_ids) == set(sorted(collected_ids)), (
        "collected shipment id set differs from the ordered full set"
    )


def test_first_page_is_not_skipped() -> None:
    """Page 1 must return the earliest shipments, not a later window.

    Directly targets the off-by-one: with offset = page * pageSize, page 1
    returns the SECOND window of rows (the true first page is skipped). The
    first id on page 1 must be the global minimum id.
    """
    page_size = 5
    with TestClient(app) as client:
        # The true smallest id: fetch a large single page and take the first id.
        full_first_page = _fetch_page(client, page=1, page_size=100)
        assert full_first_page["items"], "no shipments returned at all"
        true_min_id = full_first_page["items"][0]["id"]

        page_one = _fetch_page(client, page=1, page_size=page_size)
        assert page_one["items"], "page 1 returned no items (first page skipped)"
        assert page_one["items"][0]["id"] == true_min_id, (
            "page 1 did not start at the smallest shipment id "
            f"(got {page_one['items'][0]['id']}, expected {true_min_id}): "
            "the first page was skipped by an off-by-one offset"
        )
