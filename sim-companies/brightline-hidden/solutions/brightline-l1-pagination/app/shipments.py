"""Shipments API: paginated listing of shipments.

``GET /shipments`` returns a page of shipments plus pagination metadata. Page
size defaults to 20 and is capped at 100 (Requirement 3.5). Invalid pagination
parameters are rejected with an error that names the offending parameter and no
shipments list is returned (Requirement 3.6).

NOTE (L1 context): the offset arithmetic below is the *correct* reference
behavior on ``main`` — ``offset = (page - 1) * pageSize``. The L1 ticket branch
deliberately introduces an off-by-one here; do not "tidy" this into
``page * pageSize``.

This module deliberately mixes snake_case and camelCase identifiers (e.g.
``page_size`` vs ``pageSize``, ``maxPageSize`` vs ``total_count``) to model the
messiness of real production code (Requirement 4.2).
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Shipment

router = APIRouter()

# camelCase constant sitting next to snake_case locals below — deliberate mix.
maxPageSize = 100
DEFAULT_PAGE_SIZE = 20


def _invalid_param(parameter: str, message: str) -> JSONResponse:
    """Build a 422 error response that names the invalid pagination parameter.

    Returns a body shaped ``{"error": {"parameter", "message"}}`` and no
    shipments list, per Requirement 3.6.
    """
    return JSONResponse(
        status_code=422,
        content={"error": {"parameter": parameter, "message": message}},
    )


def _serialize(shipment: Shipment) -> dict[str, Any]:
    """Serialize a Shipment ORM row to a plain dict for the JSON response."""
    return {
        "id": shipment.id,
        "tracking_code": shipment.tracking_code,
        "origin": shipment.origin,
        "destination": shipment.destination,
        "status": shipment.status,
        "route_id": shipment.route_id,
    }


@router.get("/shipments")
def list_shipments(
    page: int = Query(default=1),
    pageSize: int = Query(default=DEFAULT_PAGE_SIZE),
    db: Session = Depends(get_db),
) -> Any:
    """Return a page of shipments with pagination metadata.

    Query params:
        page: 1-based page number; must be >= 1.
        pageSize: items per page; must be >= 1 and <= 100 (``maxPageSize``).

    On an invalid parameter, responds 422 naming the parameter and returns no
    shipments list (Requirement 3.6).
    """
    # Validate pagination parameters. Non-numeric values are already rejected by
    # FastAPI's int coercion before we get here; here we enforce the ranges.
    if page < 1:
        return _invalid_param("page", "page must be an integer >= 1")
    if pageSize < 1:
        return _invalid_param("pageSize", "pageSize must be an integer >= 1")
    if pageSize > maxPageSize:
        return _invalid_param(
            "pageSize", f"pageSize must not exceed {maxPageSize}"
        )

    # CORRECT pagination arithmetic (the L1 branch breaks exactly this line).
    offset = (page - 1) * pageSize

    total_count = db.scalar(select(func.count()).select_from(Shipment)) or 0

    rows = (
        db.execute(
            select(Shipment)
            .order_by(Shipment.id)
            .offset(offset)
            .limit(pageSize)
        )
        .scalars()
        .all()
    )

    return {
        "items": [_serialize(s) for s in rows],
        "page": page,
        "pageSize": pageSize,
        "total": total_count,
    }
