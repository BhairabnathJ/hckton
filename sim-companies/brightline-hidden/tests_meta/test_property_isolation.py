"""Property-based test for Property 8 — hidden-test isolation / leak scan.

# Feature: sandbox-brightline, Property 8: For any state of brightline across all
# of its branches (including main and every Ticket_Branch), the verifier's
# isolation scan exits zero iff it finds no Hidden_Test_Suite file, no
# Reference_Solution file, and no Ticket_Manifest; otherwise it reports the
# leaked file path and exits non-zero.

**Validates: Requirements 11.1, 11.2, 11.4, 11.5**

This meta-test lives OUTSIDE the per-ticket ``tests/<id>/`` hidden dirs (in
``tests_meta/``) so the verifier's own leak scanner never mistakes it for a
Hidden_Test_Suite. It targets the PURE leak-classification logic
``_looks_like_leak(path)`` in ``scripts/verify_tickets.py`` over generated
paths, so 100+ cases run without invoking real git.

The property, as a biconditional on the classifier:
    _looks_like_leak(path) is non-None  IFF  path is hidden material
where "hidden material" is a Ticket_Manifest (basename tickets.json), a
Reference_Solution (any ``solutions/`` segment), or a Hidden_Test_Suite
(a ``tests/brightline-<slug>/<file>`` path).
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

from hypothesis import given, settings
from hypothesis import strategies as st

# --------------------------------------------------------------------------- #
# Import the verifier module by file path (its dir is not a package).          #
# --------------------------------------------------------------------------- #

_VERIFIER_PATH = (
    Path(__file__).resolve().parent.parent / "scripts" / "verify_tickets.py"
)
_spec = importlib.util.spec_from_file_location("verify_tickets", _VERIFIER_PATH)
assert _spec is not None and _spec.loader is not None
_verify_tickets = importlib.util.module_from_spec(_spec)
# Register before exec so dataclass() can resolve the module via sys.modules.
sys.modules["verify_tickets"] = _verify_tickets
_spec.loader.exec_module(_verify_tickets)

_looks_like_leak = _verify_tickets._looks_like_leak


# --------------------------------------------------------------------------- #
# Generators                                                                   #
# --------------------------------------------------------------------------- #

# A path segment that is NOT a reserved leak trigger. Keeps CLEAN paths clean:
# never "tickets.json", never "solutions", never "tests", and never a
# "brightline-*" ticket dir. Uses simple slug-like segments.
_safe_segment = st.from_regex(r"[a-z][a-z0-9_]{0,10}", fullmatch=True).filter(
    lambda s: s not in {"solutions", "tests"} and not s.startswith("brightline")
)

# A ticket-id-style segment: brightline-<slug>.
_ticket_slug = st.from_regex(r"brightline-[a-z0-9][a-z0-9-]{0,20}", fullmatch=True)

# A file basename (not tickets.json).
_file_basename = st.from_regex(r"[a-z][a-z0-9_]{0,10}\.(py|md|toml|txt)", fullmatch=True)


# ---- LEAK path strategies ------------------------------------------------- #

@st.composite
def leak_manifest_paths(draw) -> str:
    """Any path whose basename is ``tickets.json`` (Ticket_Manifest, Req 11.4)."""
    depth = draw(st.integers(min_value=0, max_value=4))
    prefix = [draw(_safe_segment) for _ in range(depth)]
    return "/".join([*prefix, "tickets.json"])


@st.composite
def leak_solution_paths(draw) -> str:
    """Any path containing a ``solutions/`` segment (Reference_Solution, Req 11.2)."""
    before = draw(st.lists(_safe_segment, min_size=0, max_size=2))
    after = draw(st.lists(_safe_segment, min_size=0, max_size=2))
    basename = draw(_file_basename)
    return "/".join([*before, "solutions", *after, basename])


@st.composite
def leak_hidden_test_paths(draw) -> str:
    """A ``tests/brightline-<slug>/<...>/<file>`` Hidden_Test_Suite (Req 11.1).

    ``_looks_like_leak`` requires the segment immediately after ``tests`` to
    start with ``brightline-`` and there to be at least one more segment
    (i.e. ``tests/<seg>/<file>``). Optional clean prefix before ``tests``.
    """
    prefix = draw(st.lists(_safe_segment, min_size=0, max_size=2))
    slug = draw(_ticket_slug)
    tail = draw(st.lists(_safe_segment, min_size=0, max_size=2))
    basename = draw(_file_basename)
    return "/".join([*prefix, "tests", slug, *tail, basename])


leak_paths = st.one_of(
    leak_manifest_paths(),
    leak_solution_paths(),
    leak_hidden_test_paths(),
)


# ---- CLEAN path strategies ------------------------------------------------ #

# Typical public-repo files that must never be flagged.
_known_clean = st.sampled_from(
    [
        "README.md",
        "CONTRIBUTING.md",
        "pyproject.toml",
        "requirements.txt",
        "app/__init__.py",
        "app/main.py",
        "app/db.py",
        "app/models.py",
        "app/seed.py",
        "app/shipments.py",
        "app/routes.py",
        "app/eta.py",
        # VISIBLE suite: files DIRECTLY under tests/, not a per-ticket subdir.
        "tests/test_shipments.py",
        "tests/test_routes.py",
        "tests/test_slow.py",
        "tests/__init__.py",
    ]
)


@st.composite
def clean_generic_paths(draw) -> str:
    """Generated non-leak paths: no tickets.json basename, no solutions/ segment,
    and no tests/brightline-*/ hidden-suite shape."""
    depth = draw(st.integers(min_value=0, max_value=4))
    segments = [draw(_safe_segment) for _ in range(depth)]
    basename = draw(_file_basename)
    return "/".join([*segments, basename])


@st.composite
def clean_visible_suite_paths(draw) -> str:
    """The VISIBLE suite: a test file DIRECTLY under ``tests/`` (tests/<file>).

    This is ``tests/<file>`` with no per-ticket subdirectory, so the classifier
    must return None (the subdir after ``tests/`` is the leak tell)."""
    name = draw(st.from_regex(r"test_[a-z][a-z0-9_]{0,10}", fullmatch=True))
    return f"tests/{name}.py"


@st.composite
def clean_tests_nonticket_subdir_paths(draw) -> str:
    """A ``tests/<seg>/<file>`` where <seg> does NOT start with ``brightline-``.

    The classifier only flags per-ticket dirs named ``brightline-*``; an
    ordinary subdir under tests/ is clean."""
    seg = draw(_safe_segment)  # already excludes brightline-*
    tail = draw(st.lists(_safe_segment, min_size=0, max_size=2))
    basename = draw(_file_basename)
    return "/".join(["tests", seg, *tail, basename])


clean_paths = st.one_of(
    _known_clean,
    clean_generic_paths(),
    clean_visible_suite_paths(),
    clean_tests_nonticket_subdir_paths(),
)


# --------------------------------------------------------------------------- #
# Properties                                                                   #
# --------------------------------------------------------------------------- #

@settings(max_examples=200)
@given(path=leak_paths)
def test_leak_paths_are_reported(path: str) -> None:
    """Every hidden-material path classifies as a leak with a non-None reason.

    Covers Ticket_Manifest (11.4), Reference_Solution (11.2), and
    Hidden_Test_Suite (11.1) leaks; a reported reason backs the non-zero exit
    and leaked-path reporting of the scan (11.5).
    """
    reason = _looks_like_leak(path)
    assert reason is not None, f"expected {path!r} to be flagged as a leak"
    assert isinstance(reason, str) and reason.strip(), (
        f"leak reason for {path!r} must be a non-empty human-readable string, "
        f"got {reason!r}"
    )


@settings(max_examples=200)
@given(path=clean_paths)
def test_clean_paths_are_not_reported(path: str) -> None:
    """No legitimate public-repo path is flagged as a leak (isolation exits zero
    when no hidden material is present — 11.1, 11.2, 11.4)."""
    reason = _looks_like_leak(path)
    assert reason is None, (
        f"expected clean public path {path!r} to NOT be flagged, got reason "
        f"{reason!r}"
    )


# --------------------------------------------------------------------------- #
# Example anchors (pin the exact design paths from design.md).                 #
# --------------------------------------------------------------------------- #

def test_example_known_leaks() -> None:
    """Concrete leaks from the frozen manifest / layout are all flagged."""
    for p in (
        "tickets.json",
        "tests/brightline-l1-pagination/test_pagination.py",
        "tests/brightline-l2-eta-timezone/test_eta_timezone.py",
        "tests/brightline-l3-route-eta/test_route_eta.py",
        "solutions/brightline-l1-pagination/shipments.py",
        "solutions/brightline-l3-route-eta/routes.py",
    ):
        assert _looks_like_leak(p) is not None, f"{p!r} should be a leak"


def test_example_known_clean() -> None:
    """Concrete public-repo paths from design.md are all clean."""
    for p in (
        "README.md",
        "CONTRIBUTING.md",
        "pyproject.toml",
        "app/main.py",
        "app/shipments.py",
        "tests/test_shipments.py",
        "tests/test_slow.py",
    ):
        assert _looks_like_leak(p) is None, f"{p!r} should be clean"
