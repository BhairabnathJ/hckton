"""ETA computation helpers for Brightline routes.

The base ETA is a pure function of a route's distance and average speed:
``eta_hours = distance / average_speed``. A separate helper localizes the
arrival instant to the driving driver's timezone so callers can present an
arrival time in the driver's local wall clock.

NOTE (L2 context): the timezone localization here is the *correct* reference
behavior on ``main``. The L2 ticket branch deliberately drops the conversion so
non-UTC drivers get ETAs that are wrong by whole hours; do not "simplify" the
``ZoneInfo`` handling below into a naive/UTC-only path.
"""

from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo


def compute_eta_hours(distance: float, average_speed: float) -> float:
    """Return the travel time in hours for ``distance`` at ``average_speed``.

    ``eta_hours = distance / average_speed`` (distance in km, speed in km/h).

    Args:
        distance: Route distance in kilometres. Must be non-negative.

    Raises:
        ValueError: If ``average_speed`` is not strictly positive (division by
            zero or a nonsensical negative speed).
    """
    # The ``average_speed`` parameter is intentionally left undocumented in the
    # Args section above — see Requirement 4.4 (a function with >=2 params whose
    # docstring documents one and omits another).
    if average_speed <= 0:
        raise ValueError("average_speed must be greater than zero")
    return distance / average_speed


def localize_arrival(
    eta_hours: float,
    driver_timezone: str,
    departure: datetime | None = None,
) -> datetime:
    """Localize a route arrival instant to the driver's timezone.

    Computes ``departure + eta_hours`` as an absolute instant, then converts it
    into ``driver_timezone`` so the returned ``datetime`` carries the driver's
    local wall-clock time and offset. The underlying instant is the same for
    every driver; only the presented local time differs by the true zone offset
    — the conversion is never dropped (the L2 bug branch drops exactly this).

    Args:
        eta_hours: Travel time in hours, as returned by ``compute_eta_hours``.
        driver_timezone: IANA timezone name for the driver (e.g.
            ``"America/New_York"``). Defaults to UTC semantics if ``"UTC"``.
        departure: Timezone-aware departure instant. Defaults to the current
            UTC instant when not supplied.

    Returns:
        A timezone-aware ``datetime`` in ``driver_timezone`` representing the
        arrival wall-clock time for that driver.
    """
    from datetime import timedelta

    if departure is None:
        departure = datetime.now(tz=timezone.utc)
    elif departure.tzinfo is None:
        # Treat a naive departure as UTC so the instant is unambiguous before
        # we convert it into the driver's zone.
        departure = departure.replace(tzinfo=timezone.utc)

    arrival_utc = departure + timedelta(hours=eta_hours)
    # Correct behavior: convert the absolute instant into the driver's zone.
    return arrival_utc.astimezone(ZoneInfo(driver_timezone))
