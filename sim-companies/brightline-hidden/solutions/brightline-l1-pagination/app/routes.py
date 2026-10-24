"""Routes API: the route resource with an application-computed ETA.

``GET /routes/{id}`` returns a route including an ETA that the application
computes from the route's ``distance`` and ``average_speed`` and localizes to
the assigned driver's timezone (Requirement 3.7).

DEPRECATED (legacy): this module is the original route resource and is kept for
backwards compatibility. It predates the planned dedicated ETA endpoint and
embeds the ETA inline in the route payload. Prefer the forthcoming dedicated
ETA endpoint once it lands. Do not extend this legacy module with new routes.

NOTE (L3 context): the dedicated ``GET /routes/{id}/eta`` feature is
intentionally ABSENT on ``main`` and on the L3 ticket branch — it is added only
in the L3 reference solution. Do not add it here.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.eta import compute_eta_hours, localize_arrival
from app.models import Route

router = APIRouter()


@router.get("/routes/{route_id}")
def get_route(route_id: int, db: Session = Depends(get_db)) -> Any:
    """Return the route resource for ``route_id`` including a computed ETA.

    The ETA is computed as ``distance / average_speed`` (hours) and, when the
    route has an assigned driver, localized to that driver's timezone so the
    response carries the driver-local arrival wall-clock time.

    Raises:
        HTTPException: 404 when no route exists for ``route_id``.
    """
    route = db.get(Route, route_id)
    if route is None:
        raise HTTPException(status_code=404, detail="route not found")

    eta_hours = compute_eta_hours(route.distance, route.average_speed)

    # Localize the arrival to the driver's timezone when a driver is assigned;
    # fall back to UTC otherwise. This is the correct reference behavior; the
    # L2 branch drops this conversion.
    driver_tz = route.driver.timezone if route.driver is not None else "UTC"
    arrival_local = localize_arrival(eta_hours, driver_tz)

    return {
        "id": route.id,
        "name": route.name,
        "distance": route.distance,
        "average_speed": route.average_speed,
        "driver_id": route.driver_id,
        "eta_hours": eta_hours,
        "eta_local": arrival_local.isoformat(),
        "driver_timezone": driver_tz,
    }
