"""Hidden test for ticket brightline-l2-eta-timezone.

Proves the L2 bug: ETA localization for a NON-UTC driver must *convert* the
absolute arrival instant into the driver's timezone (``astimezone``), so the
returned wall-clock differs from UTC only by the true zone offset while the
underlying instant is preserved.

The bugged branch (`ticket/l2-eta-timezone`) relabels the tzinfo without
converting (``arrival_utc.replace(tzinfo=ZoneInfo(driver_tz))``): that keeps
the UTC wall-clock numbers but stamps a non-UTC offset, so the presented local
time is wrong by whole hours. These tests FAIL on the bug and PASS on main /
the reference solution.

Runs against whichever ``app`` package is importable via PYTHONPATH (the bugged
branch tree vs. the reference solution tree).
"""

from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.eta import localize_arrival


# A fixed, timezone-aware departure instant so the assertions are deterministic.
DEPARTURE = datetime(2024, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
ETA_HOURS = 3.0
# The true absolute arrival instant (same for every driver, any zone).
ARRIVAL_UTC = DEPARTURE + timedelta(hours=ETA_HOURS)


@pytest.mark.parametrize(
    "driver_tz",
    ["America/New_York", "Asia/Kolkata", "Asia/Tokyo", "America/Los_Angeles"],
)
def test_localize_arrival_converts_to_driver_zone(driver_tz: str) -> None:
    """Driver-local arrival must equal the correctly *converted* instant.

    The reference behavior is ``arrival_utc.astimezone(ZoneInfo(driver_tz))``.
    The bug relabels tzinfo instead, so this equality fails for any non-UTC zone.
    """
    expected = ARRIVAL_UTC.astimezone(ZoneInfo(driver_tz))
    got = localize_arrival(ETA_HOURS, driver_tz, departure=DEPARTURE)

    # Same absolute instant (both forms describe the same moment).
    assert got == expected
    # And the same presented wall-clock fields as the true conversion.
    assert (got.year, got.month, got.day, got.hour, got.minute) == (
        expected.year,
        expected.month,
        expected.day,
        expected.hour,
        expected.minute,
    )


def test_localize_arrival_preserves_absolute_instant() -> None:
    """Localization must preserve the underlying instant, not shift it.

    Converting back to UTC must recover ``ARRIVAL_UTC``. The bug's ``replace``
    changes the represented instant (keeps UTC wall-clock under a non-UTC
    offset), so the round-trip no longer equals the true arrival instant.
    """
    got = localize_arrival(ETA_HOURS, "America/New_York", departure=DEPARTURE)
    assert got.astimezone(timezone.utc) == ARRIVAL_UTC


def test_localize_arrival_differs_from_utc_only_by_true_offset() -> None:
    """A non-UTC driver's local wall-clock differs from UTC by the real offset.

    For America/New_York in January (EST, UTC-5) the local hour must be the UTC
    hour minus 5. The bug keeps the UTC hour (offset applied as a label only),
    so the local hour would wrongly read 15:00 instead of 10:00.
    """
    got = localize_arrival(ETA_HOURS, "America/New_York", departure=DEPARTURE)
    expected_local = ARRIVAL_UTC.astimezone(ZoneInfo("America/New_York"))
    assert got.hour == expected_local.hour  # 10, not 15
    # Sanity: the true offset is non-zero, so bug and fix are distinguishable.
    assert got.utcoffset() != timedelta(0)
    assert got.hour != ARRIVAL_UTC.hour
