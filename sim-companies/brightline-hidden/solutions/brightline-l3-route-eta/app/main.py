"""Brightline Logistics FastAPI application entry point.

Creates the FastAPI app and wires in the domain routers. Routers for shipments
and routes are included conditionally so the app imports cleanly even while
those modules are still being scaffolded (Task 2.3 fills them in).
"""

from __future__ import annotations

from fastapi import FastAPI

from app.db import init_db

app = FastAPI(
    title="Brightline Logistics",
    version="0.1.0",
    description="Shipments, drivers, and routes for the Brightline practice sandbox.",
)


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness probe used by smoke tests."""
    return {"status": "ok"}


@app.on_event("startup")
def _on_startup() -> None:
    init_db()


# Router includes. These modules are scaffolded in Task 2.3; guard the imports
# so the app remains importable before they define their routers.
try:
    from app import shipments

    app.include_router(shipments.router)
except ImportError:
    pass

try:
    from app import routes

    app.include_router(routes.router)
except ImportError:
    pass
