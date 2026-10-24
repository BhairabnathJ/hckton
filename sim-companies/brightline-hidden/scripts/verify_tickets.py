#!/usr/bin/env python3.12
"""Verify_Tickets_Script — single source of truth for ticket soundness.

SERVER-ONLY. Lives in ``sim-companies/brightline-hidden`` and is NEVER shipped
to students. Run it from the ``brightline-hidden`` repo root::

    python3.12 scripts/verify_tickets.py

It conforms to ``.kiro/specs/sandbox-brightline/design.md`` (Component 5, the
Error Handling table, and Properties 1–8). Every failure mode prints a
human-readable message naming the offending artifact and exits non-zero; a
fully-sound verification exits zero. The verifier is READ-ONLY with respect to
the repositories under test: it modifies no tracked file (it only creates and
then removes throwaway worktrees / a temp venv).

Stages (design Component 5):

    load_manifest(tickets.json)  -> parse / absent / unreadable => non-zero  (7.1)
    validate_schema(manifest)    -> every offending (id, field) reported     (7.1)
    resolve_layout(manifest)     -> tests/<id>/ file + solutions/<id>/        (7.2)
    scan_isolation(brightline)   -> leak scan across main + every branch      (7.3)
    per-ticket fail-before / pass-after run + aggregation (exit 0 iff sound)  (7.4)

Path resolution
---------------
All brightline-hidden paths resolve relative to the repo root (the parent of
``scripts/``), regardless of the caller's CWD. The sibling public repo is
located at ``../brightline`` by default, overridable with the environment
variable ``BRIGHTLINE_REPO_PATH``.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import venv
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

# --------------------------------------------------------------------------- #
# Constants                                                                    #
# --------------------------------------------------------------------------- #

# brightline-hidden repo root == parent of scripts/.
HIDDEN_ROOT = Path(__file__).resolve().parent.parent
MANIFEST_PATH = HIDDEN_ROOT / "tickets.json"
TESTS_DIR = HIDDEN_ROOT / "tests"
SOLUTIONS_DIR = HIDDEN_ROOT / "solutions"

# Default sibling public repo; override with BRIGHTLINE_REPO_PATH.
_DEFAULT_BRIGHTLINE = HIDDEN_ROOT.parent / "brightline"
BRIGHTLINE_REPO_PATH = Path(
    os.environ.get("BRIGHTLINE_REPO_PATH", str(_DEFAULT_BRIGHTLINE))
).resolve()

# The public repo's canonical "known-good" branch.
MAIN_BRANCH = "main"

# Per-run sandbox timeout (steering + design: 60s). A run that exceeds this is
# treated as a FAILED check, never passing (Req 10.4, 13.4).
RUN_TIMEOUT_SECONDS = 60

# Required ticket count / level set (Req 7.6, 7.7).
EXPECTED_TICKET_COUNT = 3
EXPECTED_LEVELS = {1, 2, 3}

# Test runtime dependencies for the hidden suites (match brightline pyproject).
VENV_DEPS = [
    "fastapi==0.115.5",
    "SQLAlchemy==2.0.36",
    "httpx==0.28.1",
    "pytest==8.3.4",
]


# --------------------------------------------------------------------------- #
# Output helpers                                                               #
# --------------------------------------------------------------------------- #

def _stage(title: str) -> None:
    print(f"\n=== {title} ===", flush=True)


def _ok(msg: str) -> None:
    print(f"  [ok]   {msg}", flush=True)


def _fail(msg: str) -> None:
    print(f"  [FAIL] {msg}", flush=True)


def _info(msg: str) -> None:
    print(f"  {msg}", flush=True)


# --------------------------------------------------------------------------- #
# Stage 7.1 — load_manifest + validate_schema                                  #
# --------------------------------------------------------------------------- #

class ManifestError(Exception):
    """Manifest absent / unreadable / not valid JSON (Req 1.14, 2.9, 10.7)."""


def load_manifest(path: Path) -> list[Any]:
    """Load and JSON-parse ``tickets.json``.

    Raises ``ManifestError`` (naming the manifest file) if the file is absent,
    unreadable, or not valid JSON. The top-level value must be a JSON array
    (Req 1.3); anything else is a manifest error.
    """
    try:
        raw = path.read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        raise ManifestError(
            f"Ticket_Manifest not found: {path} ({exc.strerror})"
        ) from exc
    except OSError as exc:
        raise ManifestError(
            f"Ticket_Manifest unreadable: {path} ({exc.strerror})"
        ) from exc

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ManifestError(
            f"Ticket_Manifest is not valid JSON: {path} "
            f"(line {exc.lineno}, column {exc.colno}: {exc.msg})"
        ) from exc

    if not isinstance(data, list):
        raise ManifestError(
            f"Ticket_Manifest {path} top-level value must be a JSON array "
            f"of Ticket_Entry objects, got {type(data).__name__}"
        )
    return data


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and value.strip() != ""


# JSON booleans are instances of int in Python; exclude them where an int is
# required so `true`/`false` are not silently accepted as integers.
def _is_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def validate_schema(manifest: list[Any]) -> list[str]:
    """Validate every Ticket_Entry against the frozen schema.

    Returns a list of human-readable violation strings; empty means valid.
    ALL violations are collected — validation never stops at the first.

    Schema (design "Data Models"):
      id              non-empty str, unique across the array
      repo            non-empty str
      title           non-empty str
      description     str (may be empty)
      difficulty      non-empty str
      xpReward        int >= 0
      level           int in {1,2,3}; the three levels each exactly once
      acceptanceCriteria  non-empty list[str]
      branch          non-empty str
      hiddenTestPath  non-empty str

    Also enforced: exactly 3 entries; unique ids; the level multiset == {1,2,3}.
    (Req 1.15, 1.16, 7.7, 12.5)
    """
    violations: list[str] = []

    # Ticket count (Req 7.7).
    if len(manifest) != EXPECTED_TICKET_COUNT:
        violations.append(
            f"manifest must contain exactly {EXPECTED_TICKET_COUNT} Ticket_Entry "
            f"objects, found {len(manifest)}"
        )

    string_fields = ("id", "repo", "title", "difficulty", "branch", "hiddenTestPath")

    seen_ids: dict[str, int] = {}
    levels: list[int] = []

    for index, entry in enumerate(manifest):
        # A usable label for messages even when id is missing/invalid.
        raw_id = entry.get("id") if isinstance(entry, dict) else None
        label = raw_id if _is_nonempty_str(raw_id) else f"<entry #{index}>"

        if not isinstance(entry, dict):
            violations.append(
                f"({label}) entry #{index} must be a JSON object, got "
                f"{type(entry).__name__}"
            )
            continue

        # Non-empty string fields.
        for fld in string_fields:
            if fld not in entry:
                violations.append(f"({label}, {fld}) missing required field")
            elif not _is_nonempty_str(entry[fld]):
                violations.append(
                    f"({label}, {fld}) must be a non-empty string, got "
                    f"{entry[fld]!r}"
                )

        # description: a string, may be empty.
        if "description" not in entry:
            violations.append(f"({label}, description) missing required field")
        elif not isinstance(entry["description"], str):
            violations.append(
                f"({label}, description) must be a string, got "
                f"{type(entry['description']).__name__}"
            )

        # xpReward: int >= 0.
        if "xpReward" not in entry:
            violations.append(f"({label}, xpReward) missing required field")
        elif not _is_int(entry["xpReward"]):
            violations.append(
                f"({label}, xpReward) must be an integer, got {entry['xpReward']!r}"
            )
        elif entry["xpReward"] < 0:
            violations.append(
                f"({label}, xpReward) must be >= 0, got {entry['xpReward']}"
            )

        # level: int in {1,2,3}.
        if "level" not in entry:
            violations.append(f"({label}, level) missing required field")
        elif not _is_int(entry["level"]):
            violations.append(
                f"({label}, level) must be an integer in {{1,2,3}}, got "
                f"{entry['level']!r}"
            )
        elif entry["level"] not in EXPECTED_LEVELS:
            violations.append(
                f"({label}, level) must be one of {{1,2,3}}, got {entry['level']}"
            )
        else:
            levels.append(entry["level"])

        # acceptanceCriteria: non-empty list[str].
        if "acceptanceCriteria" not in entry:
            violations.append(
                f"({label}, acceptanceCriteria) missing required field"
            )
        else:
            ac = entry["acceptanceCriteria"]
            if not isinstance(ac, list) or len(ac) == 0:
                violations.append(
                    f"({label}, acceptanceCriteria) must be a non-empty array, "
                    f"got {ac!r}"
                )
            elif not all(isinstance(item, str) for item in ac):
                bad = [item for item in ac if not isinstance(item, str)]
                violations.append(
                    f"({label}, acceptanceCriteria) every element must be a "
                    f"string; offending elements: {bad!r}"
                )

        # Track id uniqueness.
        if _is_nonempty_str(raw_id):
            seen_ids[raw_id] = seen_ids.get(raw_id, 0) + 1

    # Duplicate ids (Req 1.15, 7.5).
    for dup_id, count in seen_ids.items():
        if count > 1:
            violations.append(
                f"({dup_id}, id) duplicate id appears {count} times; ids must "
                f"be unique"
            )

    # Level distribution: each of {1,2,3} exactly once (Req 7.6, 7.7).
    if len(manifest) == EXPECTED_TICKET_COUNT:
        if sorted(levels) != sorted(EXPECTED_LEVELS):
            violations.append(
                f"levels must be exactly one each of {{1,2,3}} across the three "
                f"entries, got {sorted(levels)}"
            )

    return violations


# --------------------------------------------------------------------------- #
# Stage 7.2 — resolve_layout                                                   #
# --------------------------------------------------------------------------- #

def resolve_layout(manifest: list[dict]) -> list[str]:
    """Resolve each ticket's on-disk assets. Modifies NO files (Req 2.8).

    For every Ticket_Entry:
      * ``hiddenTestPath`` must resolve to an existing FILE under
        ``brightline-hidden/tests/`` (Req 2.4, 2.6).
      * a Reference_Solution directory must exist at
        ``brightline-hidden/solutions/<id>/`` and be non-empty (Req 2.7).

    Returns a list of violation strings naming the offending id and path;
    empty means every asset resolved.
    """
    violations: list[str] = []

    for entry in manifest:
        ticket_id = entry.get("id", "<unknown>")
        hidden_rel = entry.get("hiddenTestPath", "")

        # hiddenTestPath -> existing file under tests/.
        hidden_abs = (HIDDEN_ROOT / hidden_rel).resolve()
        try:
            under_tests = hidden_abs.is_relative_to(TESTS_DIR.resolve())
        except AttributeError:  # pragma: no cover (py<3.9 safety; we're 3.12)
            under_tests = str(hidden_abs).startswith(str(TESTS_DIR.resolve()))

        if not under_tests:
            violations.append(
                f"({ticket_id}) hiddenTestPath {hidden_rel!r} does not resolve "
                f"under tests/ ({hidden_abs})"
            )
        elif not hidden_abs.is_file():
            violations.append(
                f"({ticket_id}) hiddenTestPath {hidden_rel!r} does not resolve "
                f"to an existing file ({hidden_abs})"
            )

        # solutions/<id>/ directory must exist and be non-empty.
        sol_dir = SOLUTIONS_DIR / ticket_id
        if not sol_dir.is_dir():
            violations.append(
                f"({ticket_id}) Reference_Solution directory missing: {sol_dir}"
            )
        elif not any(sol_dir.iterdir()):
            violations.append(
                f"({ticket_id}) Reference_Solution directory is empty: {sol_dir}"
            )

    return violations


# --------------------------------------------------------------------------- #
# Stage 7.3 — scan_isolation                                                   #
# --------------------------------------------------------------------------- #

def _git_branches(repo: Path) -> list[str]:
    """Return every local branch name in the brightline repo."""
    out = subprocess.run(
        ["git", "-C", str(repo), "for-each-ref", "--format=%(refname:short)",
         "refs/heads"],
        capture_output=True, text=True, check=True,
    )
    return [line.strip() for line in out.stdout.splitlines() if line.strip()]


def _looks_like_leak(path: str) -> str | None:
    """Classify a tracked path as a hidden-material leak, or None if clean.

    A leak is any of:
      * a ``tickets.json`` Ticket_Manifest anywhere in the tree,
      * anything under a ``solutions/`` directory (Reference_Solution), or
      * a hidden-test suite: a path under a ``tests/<ticket-id>/`` directory
        whose segment matches a ``brightline-*`` ticket id convention.
    Returns a short reason string if it's a leak, else None.
    """
    parts = path.split("/")
    base = parts[-1]

    if base == "tickets.json":
        return "Ticket_Manifest (tickets.json)"

    if "solutions" in parts:
        return "Reference_Solution (under solutions/)"

    # Hidden-test suite: tests/<brightline-*>/...  The public repo's own
    # visible suite lives at tests/*.py (files directly under tests/), never in
    # a per-ticket subdirectory, so a tests/<ticket-id>/ dir is the tell.
    if "tests" in parts:
        t_index = parts.index("tests")
        # Require a subdirectory segment after tests/ that names a ticket.
        if t_index + 1 < len(parts) - 0:
            # segment right after tests/ when there's a nested path
            if t_index + 1 <= len(parts) - 2:  # at least tests/<seg>/<file>
                seg = parts[t_index + 1]
                if seg.startswith("brightline-"):
                    return f"Hidden_Test_Suite (tests/{seg}/)"
    return None


def scan_isolation(repo: Path) -> list[str]:
    """Scan the public brightline repo across ALL branches for leaked material.

    For every local branch (main + every ticket branch) this lists the tracked
    tree and checks that none of the paths is a Ticket_Manifest, a
    Reference_Solution, or a Hidden_Test_Suite (Req 11.1, 11.2, 11.4).

    If git or the repo is unavailable, that is reported and treated as a
    FAILURE of this check (never a crash) — Req 11.5.

    Returns a list of violation strings (leaked path + branch, or infra error);
    empty means isolation holds on every branch.
    """
    violations: list[str] = []

    if shutil.which("git") is None:
        return ["isolation scan cannot run: 'git' executable not found on PATH"]
    if not (repo / ".git").exists() and not repo.exists():
        return [f"isolation scan cannot run: brightline repo not found at {repo}"]

    try:
        branches = _git_branches(repo)
    except subprocess.CalledProcessError as exc:
        return [
            f"isolation scan cannot run: 'git for-each-ref' failed for {repo} "
            f"({exc.stderr.strip() or exc})"
        ]

    if not branches:
        return [f"isolation scan found no branches in {repo}"]

    for branch in branches:
        try:
            out = subprocess.run(
                ["git", "-C", str(repo), "ls-tree", "-r", "--name-only", branch],
                capture_output=True, text=True, check=True,
            )
        except subprocess.CalledProcessError as exc:
            violations.append(
                f"isolation scan failed to read branch {branch!r} of {repo} "
                f"({exc.stderr.strip() or exc})"
            )
            continue

        for tracked in out.stdout.splitlines():
            tracked = tracked.strip()
            if not tracked:
                continue
            reason = _looks_like_leak(tracked)
            if reason is not None:
                violations.append(
                    f"LEAK on branch {branch!r}: {tracked} is {reason} and must "
                    f"not appear in the public repo"
                )

    return violations


# --------------------------------------------------------------------------- #
# Stage 7.4 — per-ticket fail-before / pass-after runner                       #
# --------------------------------------------------------------------------- #

@dataclass
class RunResult:
    """Outcome of a single pytest invocation of one hidden suite."""
    passed: int = 0
    total: int = 0
    failed: int = 0
    timed_out: bool = False
    returncode: int | None = None
    error: str = ""
    raw_tail: str = ""

    @property
    def collected_zero(self) -> bool:
        return self.total == 0

    @property
    def is_pass_after_ok(self) -> bool:
        """pass-after: every collected test passed, at least one collected,
        no timeout (Req 9.3, 10.3). Zero-collected is NOT a pass (Req 9.5)."""
        return (
            not self.timed_out
            and not self.collected_zero
            and self.failed == 0
            and self.passed == self.total
            and self.total > 0
        )

    @property
    def has_failing(self) -> bool:
        """fail-before: >= 1 failing test, counting a timeout or a
        zero-collected run as a (legitimate) failing outcome (Req 9.2, 9.5,
        10.2, 10.4)."""
        if self.timed_out:
            return True
        if self.collected_zero:
            return True
        return self.failed >= 1


@dataclass
class TicketOutcome:
    ticket_id: str
    level: int
    fail_before_ok: bool = False
    pass_after_ok: bool = False
    notes: list[str] = field(default_factory=list)

    @property
    def sound(self) -> bool:
        return self.fail_before_ok and self.pass_after_ok


def _parse_pytest_counts(stdout: str, stderr: str) -> tuple[int, int, int]:
    """Parse (passed, failed, total) from pytest's summary line.

    Reads the terminal summary line (e.g. "2 passed", "1 failed, 1 passed",
    "3 errors"). Errors and failures both count toward 'failed'. Returns
    (passed, failed, total) where total = passed + failed.
    """
    import re

    text = stdout + "\n" + stderr
    passed = failed = 0

    # Count explicit outcome tokens from the summary line(s).
    # Matches: "<n> passed", "<n> failed", "<n> error(s)".
    for n, kind in re.findall(r"(\d+)\s+(passed|failed|error|errors)", text):
        count = int(n)
        if kind == "passed":
            passed += count
        else:  # failed / error(s)
            failed += count

    total = passed + failed
    return passed, failed, total


def _run_pytest(python_exe: Path, test_file: Path, app_root: Path,
                workdir: Path) -> RunResult:
    """Run one hidden test file with ``app`` resolved from ``app_root``.

    ``PYTHONPATH`` is set to ``app_root`` so ``import app`` binds to the
    branch worktree (fail-before) or the reference solution (pass-after). A run
    exceeding RUN_TIMEOUT_SECONDS is a FAILED check (Req 10.4).
    """
    env = dict(os.environ)
    env["PYTHONPATH"] = str(app_root)
    # Keep each run's SQLite DB isolated inside the per-run workdir so parallel
    # imports never collide; the hidden suites set BRIGHTLINE_DB_PATH
    # themselves, but we provide a clean HOME/TMP-ish workdir regardless.
    env.pop("BRIGHTLINE_DB_PATH", None)

    cmd = [
        str(python_exe), "-m", "pytest",
        str(test_file),
        "-p", "no:cacheprovider",
        "-q", "--no-header",
    ]
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(workdir),
            env=env,
            capture_output=True,
            text=True,
            timeout=RUN_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired:
        return RunResult(timed_out=True, error="exceeded 60s sandbox timeout")

    passed, failed, total = _parse_pytest_counts(proc.stdout, proc.stderr)
    tail = (proc.stdout + proc.stderr).strip().splitlines()
    raw_tail = "\n".join(tail[-6:]) if tail else ""
    return RunResult(
        passed=passed, total=total, failed=failed,
        returncode=proc.returncode, raw_tail=raw_tail,
    )


def _build_shared_venv(base_tmp: Path) -> tuple[Path | None, str]:
    """Create one temp venv on 3.12, install the test deps, reuse for all runs.

    Returns (python_executable, "") on success, or (None, error_message) if the
    venv or dependency install could not complete in this environment.
    """
    venv_dir = base_tmp / "venv"
    _info(f"creating shared test venv at {venv_dir} (python {sys.version_info.major}."
          f"{sys.version_info.minor})")
    try:
        venv.EnvBuilder(with_pip=True, clear=True).create(venv_dir)
    except Exception as exc:  # noqa: BLE001 - report any venv failure
        return None, f"could not create venv: {exc}"

    py = venv_dir / "bin" / "python"
    if not py.exists():
        py = venv_dir / "Scripts" / "python.exe"  # windows fallback
    if not py.exists():
        return None, f"venv python not found under {venv_dir}"

    # Upgrade pip quietly, then install pinned deps.
    install_cmd = [str(py), "-m", "pip", "install", "--disable-pip-version-check",
                   "--quiet", *VENV_DEPS]
    _info(f"installing test deps: {', '.join(VENV_DEPS)}")
    try:
        proc = subprocess.run(install_cmd, capture_output=True, text=True,
                              timeout=600)
    except subprocess.TimeoutExpired:
        return None, "dependency install exceeded 600s"
    if proc.returncode != 0:
        tail = (proc.stdout + proc.stderr).strip().splitlines()
        return None, ("dependency install failed:\n    "
                      + "\n    ".join(tail[-8:]))
    return py, ""


def run_tickets(manifest: list[dict], python_exe: Path, base_tmp: Path,
                repo: Path) -> tuple[list[TicketOutcome], list[str]]:
    """Run fail-before / pass-after for every ticket in manifest order.

    For each ticket (none skipped — Req 10.1, 13.1):
      * FAIL-BEFORE: add a git worktree for the ticket's branch and run the
        hidden suite against it; expect >= 1 failing (Req 10.2).
      * PASS-AFTER: run the same hidden suite against solutions/<id>/; expect
        passed == total with zero failing (Req 10.3).
    A per-ticket failure never aborts the loop (Req 13.1). Worktrees are always
    removed. Returns (outcomes, infra_errors).
    """
    outcomes: list[TicketOutcome] = []
    infra_errors: list[str] = []
    worktrees: list[Path] = []

    try:
        for entry in manifest:
            ticket_id = entry["id"]
            level = entry["level"]
            branch = entry["branch"]
            hidden_test = (HIDDEN_ROOT / entry["hiddenTestPath"]).resolve()
            solution_dir = (SOLUTIONS_DIR / ticket_id).resolve()

            outcome = TicketOutcome(ticket_id=ticket_id, level=level)
            _info(f"\n--- ticket L{level}: {ticket_id} (branch {branch!r}) ---")

            # -- FAIL-BEFORE: run against the branch worktree -----------------
            wt = base_tmp / f"wt-{ticket_id}"
            try:
                subprocess.run(
                    ["git", "-C", str(repo), "worktree", "add", "--detach",
                     str(wt), branch],
                    capture_output=True, text=True, check=True, timeout=120,
                )
                worktrees.append(wt)
            except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
                detail = getattr(exc, "stderr", "") or str(exc)
                outcome.notes.append(
                    f"could not create worktree for branch {branch!r}: "
                    f"{str(detail).strip()}"
                )
                outcome.fail_before_ok = False
                outcome.pass_after_ok = False
                outcomes.append(outcome)
                _fail(f"fail-before: worktree setup failed for {ticket_id}")
                continue

            before = _run_pytest(python_exe, hidden_test, app_root=wt, workdir=wt)
            outcome.fail_before_ok = before.has_failing
            if before.timed_out:
                outcome.notes.append("fail-before: run exceeded 60s timeout "
                                     "(counted as failing outcome)")
            elif before.collected_zero:
                outcome.notes.append("fail-before: zero tests collected on "
                                     "branch (counted as failing outcome)")
            else:
                outcome.notes.append(
                    f"fail-before: branch run -> {before.passed} passed, "
                    f"{before.failed} failing of {before.total}"
                )
            if outcome.fail_before_ok:
                _ok(f"fail-before satisfied (>=1 failing on branch): {before.raw_tail.splitlines()[-1] if before.raw_tail else 'n/a'}")
            else:
                _fail(f"fail-before NOT satisfied (branch passed the hidden "
                      f"suite): {ticket_id}")

            # -- PASS-AFTER: run against the reference solution ---------------
            after = _run_pytest(python_exe, hidden_test, app_root=solution_dir,
                                workdir=solution_dir)
            outcome.pass_after_ok = after.is_pass_after_ok
            if after.timed_out:
                outcome.notes.append("pass-after: run exceeded 60s timeout "
                                     "(FAILED)")
            elif after.collected_zero:
                outcome.notes.append("pass-after: zero tests collected on "
                                     "solution (FAILED)")
            else:
                outcome.notes.append(
                    f"pass-after: solution run -> {after.passed} passed, "
                    f"{after.failed} failing of {after.total}"
                )
            if outcome.pass_after_ok:
                _ok(f"pass-after satisfied (all passed on solution): "
                    f"{after.passed}/{after.total}")
            else:
                _fail(f"pass-after NOT satisfied (solution failed the hidden "
                      f"suite): {ticket_id} -> {after.raw_tail}")

            outcomes.append(outcome)
    finally:
        # Always clean up every worktree, then prune, and restore main.
        for wt in worktrees:
            subprocess.run(
                ["git", "-C", str(repo), "worktree", "remove", "--force", str(wt)],
                capture_output=True, text=True,
            )
        subprocess.run(
            ["git", "-C", str(repo), "worktree", "prune"],
            capture_output=True, text=True,
        )

    return outcomes, infra_errors


# --------------------------------------------------------------------------- #
# Orchestration                                                                #
# --------------------------------------------------------------------------- #

def _print_header() -> None:
    print("verify_tickets.py — Brightline sandbox ticket verifier (SERVER-ONLY)")
    print(f"  brightline-hidden root : {HIDDEN_ROOT}")
    print(f"  brightline public repo : {BRIGHTLINE_REPO_PATH}")
    print(f"  manifest               : {MANIFEST_PATH}")


def verify() -> int:
    """Run all stages. Returns a process exit code (0 iff fully sound)."""
    _print_header()

    # --- Stage 7.1a: load manifest --------------------------------------- #
    _stage("Stage 1/5 — load manifest (tickets.json)")
    try:
        manifest = load_manifest(MANIFEST_PATH)
    except ManifestError as exc:
        _fail(str(exc))
        return 1
    _ok(f"loaded {len(manifest)} entries from {MANIFEST_PATH.name}")

    # --- Stage 7.1b: schema validation ----------------------------------- #
    _stage("Stage 2/5 — validate schema")
    schema_violations = validate_schema(manifest)
    if schema_violations:
        for v in schema_violations:
            _fail(v)
        _fail(f"{len(schema_violations)} schema violation(s); aborting, no "
              f"files modified")
        return 1
    _ok("every Ticket_Entry conforms to the frozen schema")

    # --- Stage 7.2: layout resolution ------------------------------------ #
    _stage("Stage 3/5 — resolve layout (tests/<id>, solutions/<id>)")
    layout_violations = resolve_layout(manifest)
    if layout_violations:
        for v in layout_violations:
            _fail(v)
        _fail(f"{len(layout_violations)} layout violation(s); aborting, no "
              f"files modified")
        return 1
    _ok("every hiddenTestPath and Reference_Solution resolves on disk")

    # --- Stage 7.3: isolation leak scan ---------------------------------- #
    _stage("Stage 4/5 — isolation scan (public brightline, all branches)")
    leak_violations = scan_isolation(BRIGHTLINE_REPO_PATH)
    if leak_violations:
        for v in leak_violations:
            _fail(v)
        _fail(f"{len(leak_violations)} isolation violation(s); aborting")
        return 1
    _ok("no Hidden_Test_Suite, Reference_Solution, or tickets.json in public "
        "repo on any branch")

    # --- Stage 7.4: per-ticket fail-before / pass-after ------------------ #
    _stage("Stage 5/5 — fail-before / pass-after per ticket")
    base_tmp = Path(tempfile.mkdtemp(prefix="verify-tickets-"))
    try:
        python_exe, venv_err = _build_shared_venv(base_tmp)
        if python_exe is None:
            _fail(f"could not provision the shared test venv: {venv_err}")
            _fail("fail-before / pass-after could not be executed in this "
                  "environment")
            return 1

        outcomes, infra_errors = run_tickets(
            manifest, python_exe, base_tmp, BRIGHTLINE_REPO_PATH
        )
    finally:
        shutil.rmtree(base_tmp, ignore_errors=True)

    # --- Aggregation ----------------------------------------------------- #
    _stage("Result — aggregation")
    for o in outcomes:
        for note in o.notes:
            _info(f"L{o.level} {o.ticket_id}: {note}")

    sound = [o for o in outcomes if o.sound]
    unsound = [o for o in outcomes if not o.sound]

    print()
    _info(f"tickets processed : {len(outcomes)}")
    _info(f"tickets sound     : {len(sound)}")
    _info(f"tickets unsound   : {len(unsound)}")

    if infra_errors:
        for e in infra_errors:
            _fail(e)

    if unsound or infra_errors or len(outcomes) != EXPECTED_TICKET_COUNT:
        for o in unsound:
            which = []
            if not o.fail_before_ok:
                which.append("fail-before")
            if not o.pass_after_ok:
                which.append("pass-after")
            _fail(f"L{o.level} {o.ticket_id}: failed {', '.join(which)}")
        _fail("VERIFICATION FAILED — not all tickets are sound")
        return 1

    for o in outcomes:
        _ok(f"L{o.level} {o.ticket_id}: fail-before + pass-after OK")
    print()
    _ok("VERIFICATION PASSED — all three tickets fail-before and pass-after")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="verify_tickets.py",
        description=(
            "SERVER-ONLY verifier for the Brightline sandbox tickets. Validates "
            "tickets.json against the frozen schema, resolves the hidden-test / "
            "reference-solution layout, scans the public brightline repo for "
            "leaked hidden material across all branches, and proves fail-before "
            "/ pass-after for every ticket. Exits 0 iff every ticket is sound."
        ),
        epilog=(
            "Run from the brightline-hidden repo root:\n"
            "    python3.12 scripts/verify_tickets.py\n\n"
            "Environment:\n"
            "    BRIGHTLINE_REPO_PATH  path to the public brightline repo "
            "(default: ../brightline)"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.parse_args(argv)
    return verify()


if __name__ == "__main__":
    raise SystemExit(main())
