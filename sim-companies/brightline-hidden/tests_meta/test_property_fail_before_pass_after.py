# Feature: sandbox-brightline, Property 5: For any Ticket_Entry, running its
# Hidden_Test_Suite against its Ticket_Branch without the fix yields at least
# one failing test (fail-before), and running the same suite against its
# Reference_Solution yields tests-passed equal to tests-total with zero failing
# (pass-after), with both runs evaluated within the 60-second sandbox timeout.
"""Property-based test for Property 5 of the sandbox-brightline design.

Validates: Requirements 8.2, 8.3, 9.2, 9.3, 10.2, 10.3
(and Requirements 9.5 / 10.4: a 60s timeout and a zero-tests-collected run are
each treated as a FAILING outcome — never a pass-after).

Running 100+ real Docker/pytest ticket runs is infeasible for a property test,
so this targets the verifier's PURE result-interpretation logic that decides
fail-before / pass-after from a single ``RunResult``:

    * ``RunResult.has_failing``      -> the fail-before decision
    * ``RunResult.is_pass_after_ok`` -> the pass-after decision

The invariants under test (restated from the design):

    has_failing (fail-before) is True  iff  (timed_out OR total == 0 OR failed >= 1)
    is_pass_after_ok (pass-after) True iff  (not timed_out AND total > 0
                                             AND failed == 0 AND passed == total)

    - a timeout is NEVER a pass-after;
    - a zero-collected run is NEVER a pass-after and IS a fail-before.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

from hypothesis import given, settings
from hypothesis import strategies as st

# --------------------------------------------------------------------------- #
# Import RunResult from scripts/verify_tickets.py by file path (no sys.path    #
# pollution, and robust regardless of the caller's CWD).                       #
# --------------------------------------------------------------------------- #

_VERIFIER_PATH = (
    Path(__file__).resolve().parent.parent / "scripts" / "verify_tickets.py"
)
_spec = importlib.util.spec_from_file_location("verify_tickets", _VERIFIER_PATH)
assert _spec is not None and _spec.loader is not None
_verify_tickets = importlib.util.module_from_spec(_spec)
# Register before exec so @dataclass can resolve this module's annotations via
# sys.modules (dataclasses looks up cls.__module__ in sys.modules).
sys.modules["verify_tickets"] = _verify_tickets
_spec.loader.exec_module(_verify_tickets)
RunResult = _verify_tickets.RunResult


# --------------------------------------------------------------------------- #
# Strategies                                                                   #
# --------------------------------------------------------------------------- #

def _expected_has_failing(r: RunResult) -> bool:
    return r.timed_out or (r.total == 0) or (r.failed >= 1)


def _expected_pass_after(r: RunResult) -> bool:
    return (
        not r.timed_out
        and r.total > 0
        and r.failed == 0
        and r.passed == r.total
    )


@st.composite
def run_results(draw) -> RunResult:
    """Generate RunResult instances across varied, invariant-respecting shapes.

    A RunResult's ``total`` is independent of ``passed``/``failed`` in the
    dataclass, but the verifier only ever constructs it with
    ``total == passed + failed`` for real (non-timeout) runs. We generate a mix
    of:
      * well-formed non-timeout runs with ``total == passed + failed`` (incl.
        all-passed, some-failing, and zero-collected shapes),
      * timeout runs (``timed_out=True``),
    so the decision logic is exercised over the whole realistic input space.
    """
    kind = draw(
        st.sampled_from(
            ["timeout", "zero_collected", "all_passed", "some_failing", "mixed"]
        )
    )

    if kind == "timeout":
        # Timeout: the verifier builds RunResult(timed_out=True) with zeroed
        # counts; counts are irrelevant to the timeout decision.
        return RunResult(
            passed=0, total=0, failed=0, timed_out=True,
            error="exceeded 60s sandbox timeout",
        )

    if kind == "zero_collected":
        # Nothing collected: total == 0, failed == 0, passed == 0.
        return RunResult(passed=0, total=0, failed=0, timed_out=False,
                         returncode=draw(st.sampled_from([0, 1, 5])))

    if kind == "all_passed":
        passed = draw(st.integers(min_value=1, max_value=50))
        return RunResult(passed=passed, total=passed, failed=0,
                         timed_out=False, returncode=0)

    if kind == "some_failing":
        passed = draw(st.integers(min_value=0, max_value=50))
        failed = draw(st.integers(min_value=1, max_value=50))
        return RunResult(passed=passed, total=passed + failed, failed=failed,
                         timed_out=False, returncode=1)

    # "mixed": freely generated passed/failed with the real total invariant.
    passed = draw(st.integers(min_value=0, max_value=50))
    failed = draw(st.integers(min_value=0, max_value=50))
    return RunResult(passed=passed, total=passed + failed, failed=failed,
                     timed_out=False,
                     returncode=draw(st.sampled_from([0, 1])))


# --------------------------------------------------------------------------- #
# Property 5                                                                   #
# --------------------------------------------------------------------------- #

@settings(max_examples=300)
@given(r=run_results())
def test_property5_fail_before_pass_after(r: RunResult) -> None:
    """has_failing and is_pass_after_ok match the Property 5 specification."""
    # fail-before: True iff timeout OR zero-collected OR >=1 failing.
    assert r.has_failing == _expected_has_failing(r)

    # pass-after: True iff not-timeout AND total>0 AND failed==0 AND passed==total.
    assert r.is_pass_after_ok == _expected_pass_after(r)

    # Cross-cutting invariants from the property text:
    # a timeout is never a pass-after.
    if r.timed_out:
        assert r.has_failing is True
        assert r.is_pass_after_ok is False

    # a zero-collected run is never a pass-after and IS a fail-before.
    if not r.timed_out and r.total == 0:
        assert r.has_failing is True
        assert r.is_pass_after_ok is False

    # fail-before and pass-after are mutually exclusive: a run cannot both have
    # >=1 failing outcome and be a clean all-passed run.
    assert not (r.has_failing and r.is_pass_after_ok)


# --------------------------------------------------------------------------- #
# Explicit edge-case examples (complement the generated cases)                 #
# --------------------------------------------------------------------------- #

def test_timeout_is_fail_before_never_pass_after() -> None:
    r = RunResult(timed_out=True, error="exceeded 60s sandbox timeout")
    assert r.has_failing is True
    assert r.is_pass_after_ok is False


def test_zero_collected_is_fail_before_never_pass_after() -> None:
    r = RunResult(passed=0, total=0, failed=0, timed_out=False)
    assert r.collected_zero is True
    assert r.has_failing is True
    assert r.is_pass_after_ok is False


def test_all_passed_is_pass_after_not_fail_before() -> None:
    r = RunResult(passed=5, total=5, failed=0, timed_out=False, returncode=0)
    assert r.is_pass_after_ok is True
    assert r.has_failing is False


def test_some_failing_is_fail_before_not_pass_after() -> None:
    r = RunResult(passed=3, total=4, failed=1, timed_out=False, returncode=1)
    assert r.has_failing is True
    assert r.is_pass_after_ok is False
