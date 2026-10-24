"""SQLAlchemy ORM models for the Brightline domain: drivers, routes, shipments."""

from __future__ import annotations

from sqlalchemy import Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Driver(Base):
    """A Brightline driver.

    `timezone` is an IANA timezone name (e.g. "America/New_York"). It exists so
    route ETA calculations can be localized per driver — the basis of the L2
    timezone ticket.
    """

    __tablename__ = "drivers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    timezone: Mapped[str] = mapped_column(String, nullable=False, default="UTC")

    routes: Mapped[list["Route"]] = relationship(back_populates="driver")


class Route(Base):
    """A delivery route.

    `distance` (kilometres) and `average_speed` (km/h) support the computed ETA
    used by the route resource and the L3 `GET /routes/{id}/eta` feature:
    `eta_hours = distance / average_speed`.
    """

    __tablename__ = "routes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    distance: Mapped[float] = mapped_column(Float, nullable=False)
    average_speed: Mapped[float] = mapped_column(Float, nullable=False)
    driver_id: Mapped[int | None] = mapped_column(ForeignKey("drivers.id"), nullable=True)

    driver: Mapped["Driver | None"] = relationship(back_populates="routes")
    shipments: Mapped[list["Shipment"]] = relationship(back_populates="route")


class Shipment(Base):
    """A shipment moving along a route."""

    __tablename__ = "shipments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tracking_code: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    origin: Mapped[str] = mapped_column(String, nullable=False)
    destination: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    route_id: Mapped[int | None] = mapped_column(ForeignKey("routes.id"), nullable=True)

    route: Mapped["Route | None"] = relationship(back_populates="shipments")
