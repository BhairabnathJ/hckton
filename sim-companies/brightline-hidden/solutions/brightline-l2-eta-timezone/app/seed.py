"""Seed data for the Brightline domain: drivers, routes, and shipments.

Loads a small but realistic dataset into the SQLite database so the app and the
visible test suite have something to work against: at least 20 shipments,
at least 3 drivers, and at least 3 routes (Requirement 3.4).

Drivers carry varied IANA timezones — at least one UTC and at least one non-UTC
— so route ETA localization (the basis of the L2 timezone ticket) has data to
exercise. Routes have realistic `distance` (km) and `average_speed` (km/h)
values, and every shipment is linked to a route.

Seeding is idempotent: `seed()` is a no-op when the database already holds data,
so it is safe to run repeatedly.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.db import SessionLocal, init_db
from app.models import Driver, Route, Shipment

# (name, IANA timezone). At least one UTC and at least one non-UTC driver so the
# L2 timezone ETA ticket has both cases available.
_DRIVER_SEED: list[tuple[str, str]] = [
    ("Ava Chen", "UTC"),
    ("Marco Rossi", "Europe/London"),
    ("Priya Nair", "America/New_York"),
    ("Kenji Tanaka", "Asia/Tokyo"),
    ("Sofia Alvarez", "America/Los_Angeles"),
]

# (name, distance_km, average_speed_kmh, driver_index). Realistic haul values.
_ROUTE_SEED: list[tuple[str, float, float, int]] = [
    ("Chicago → Detroit", 460.0, 90.0, 0),
    ("London → Manchester", 335.0, 100.0, 1),
    ("New York → Boston", 350.0, 95.0, 2),
    ("Tokyo → Osaka", 515.0, 110.0, 3),
    ("Los Angeles → San Francisco", 615.0, 105.0, 4),
]

# 22 shipments (> 20). Each tuple: (origin, destination, status, route_index).
_SHIPMENT_SEED: list[tuple[str, str, str, int]] = [
    ("Chicago", "Detroit", "in_transit", 0),
    ("Chicago", "Detroit", "pending", 0),
    ("Detroit", "Chicago", "delivered", 0),
    ("Chicago", "Detroit", "pending", 0),
    ("London", "Manchester", "in_transit", 1),
    ("Manchester", "London", "delivered", 1),
    ("London", "Manchester", "pending", 1),
    ("London", "Manchester", "in_transit", 1),
    ("New York", "Boston", "pending", 2),
    ("Boston", "New York", "in_transit", 2),
    ("New York", "Boston", "delivered", 2),
    ("New York", "Boston", "pending", 2),
    ("Tokyo", "Osaka", "in_transit", 3),
    ("Osaka", "Tokyo", "pending", 3),
    ("Tokyo", "Osaka", "delivered", 3),
    ("Tokyo", "Osaka", "in_transit", 3),
    ("Los Angeles", "San Francisco", "pending", 4),
    ("San Francisco", "Los Angeles", "in_transit", 4),
    ("Los Angeles", "San Francisco", "delivered", 4),
    ("Los Angeles", "San Francisco", "pending", 4),
    ("San Francisco", "Los Angeles", "pending", 4),
    ("Chicago", "Detroit", "in_transit", 0),
]


def seed(db: Session) -> None:
    """Insert seed drivers, routes, and shipments into ``db``, idempotently.

    If the database already contains any shipments the function returns without
    modifying anything, so it is safe to call on every startup.
    """
    if db.query(Shipment).first() is not None:
        return

    drivers = [Driver(name=name, timezone=tz) for name, tz in _DRIVER_SEED]
    db.add_all(drivers)
    db.flush()  # assign driver ids before wiring routes

    routes = [
        Route(
            name=name,
            distance=distance,
            average_speed=average_speed,
            driver_id=drivers[driver_idx].id,
        )
        for name, distance, average_speed, driver_idx in _ROUTE_SEED
    ]
    db.add_all(routes)
    db.flush()  # assign route ids before wiring shipments

    shipments = [
        Shipment(
            tracking_code=f"BL{idx + 1:05d}",
            origin=origin,
            destination=destination,
            status=status,
            route_id=routes[route_idx].id,
        )
        for idx, (origin, destination, status, route_idx) in enumerate(_SHIPMENT_SEED)
    ]
    db.add_all(shipments)

    db.commit()


def run_seed() -> None:
    """Create tables (``init_db``) then seed a fresh session. Idempotent."""
    init_db()
    db = SessionLocal()
    try:
        seed(db)
    finally:
        db.close()


if __name__ == "__main__":
    run_seed()
