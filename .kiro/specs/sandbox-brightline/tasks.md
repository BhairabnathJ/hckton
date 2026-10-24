# Implementation Plan: sandbox-brightline

## Total Estimate: 118 minutes (≤ 120)

## Overview

Lean 8-hour-hackathon plan. Build order follows the design: commit the frozen contract first (grader's dependency), then the public Brightline app, then the three ticket branches, then hidden tests + reference solutions, then `verify_tickets.py`, then the two REQUIRED property tests, then the [CUTTABLE] remaining property tests, and finally the smoke test. Language: Python 3.12 + FastAPI + pytest + hypothesis (per steering). Paths are taken verbatim from the design's on-disk layout.

- `[CUTTABLE]` tasks can be dropped to stay under budget; the running sum assumes all tasks run.
- Test sub-tasks are marked optional with `*` per workflow convention; the user additionally designates PBTs for Properties 1,2,3,4,6,7,9 as `[CUTTABLE]`, while the Property 8 and Property 5 tests are REQUIRED (still `*`-optional in form, but not cuttable).

## Tasks

- [x] 1. Freeze and COMMIT the contract: `tickets.json` schema + hidden-test folder layout (12 min)
  - Create `sim-companies/brightline-hidden/tickets.json` with the frozen top-level array of three Ticket_Entry objects (ids `brightline-l1-pagination`, `brightline-l2-eta-timezone`, `brightline-l3-route-eta`), each with `id`, `repo`, `title`, `description`, `difficulty`, `xpReward`, `level` (1/2/3), `acceptanceCriteria`, `branch`, `hiddenTestPath` exactly per the design's frozen example
  - Create the server-only layout: `tests/brightline-l1-pagination/`, `tests/brightline-l2-eta-timezone/`, `tests/brightline-l3-route-eta/`, matching `solutions/<id>/` directories, and `scripts/verify_tickets.py` as a placeholder stub, with each ticket `id` as a path segment
  - `git add` ONLY these contract artifacts (`tickets.json`, the `tests/`, `solutions/`, `scripts/` structure) and commit them on their own so the grader team can build against the fixed contract immediately
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12, 1.13, 2.1, 2.2, 2.3, 2.5, 7.1, 7.5, 7.6, 12.1_

- [x] 2. Scaffold the Brightline FastAPI app on `main` with seed data (18 min)
  - [x] 2.1 Create project skeleton and dependencies (6 min)
    - Create `sim-companies/brightline/pyproject.toml` (FastAPI, uvicorn, pytest, SQLAlchemy), `app/__init__.py`, `app/main.py` (FastAPI app + routers), `app/db.py` (SQLite engine/session), `app/models.py` (shipments, drivers, routes)
    - _Requirements: 3.1, 3.2, 3.3_
  - [x] 2.2 Implement seed data (4 min)
    - Create `app/seed.py` loading ≥20 shipments, ≥3 drivers, ≥3 routes into SQLite
    - _Requirements: 3.4_
  - [x] 2.3 Implement `GET /shipments` pagination and route resource with ETA (8 min)
    - Create `app/shipments.py` (`GET /shipments` with `page`≥1 default 1, `pageSize` default 20 max 100; invalid params → error naming the parameter, no list), `app/routes.py` (`GET /routes/{id}` returning an app-computed ETA), `app/eta.py` (ETA helper `eta = distance / average_speed`)
    - _Requirements: 3.5, 3.6, 3.7_

- [x] 3. Add deliberate imperfections, visible tests, and CONTRIBUTING.md on `main` (16 min)
  - [x] 3.1 Inject the four deliberate imperfections (6 min)
    - `README.md` with one identifiably-stale documented behavior; make `app/shipments.py` the single module mixing snake_case/camelCase; add an explicit deprecation comment marking `app/routes.py` legacy; give an `app/eta.py` function ≥2 params whose docstring documents one and omits another
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [x] 3.2 Write the visible test suite incl. the strictly-slowest annotated test (6 min)
    - Create `tests/test_shipments.py`, `tests/test_routes.py`, and `tests/test_slow.py` with exactly one deliberately-slow annotated test that is strictly the slowest; ≥1 executable test; all pass on `main`; keep total repo file count 12–18
    - _Requirements: 3.8, 4.5, 5.1, 5.2, 5.4_
  - [x] 3.3 Write CONTRIBUTING.md (4 min)
    - Create `CONTRIBUTING.md` documenting branch creation (git command + naming convention), opening a PR (push + PR against default branch), that a PR submits for hidden-test grading not present in the repo, and the fail→push-more-commits→re-grade loop
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 4. Create the three ticket branches derived from `main` (14 min)
  - [x] 4.1 Branch `ticket/l1-pagination` — inject off-by-one pagination bug (5 min)
    - Branch from `main`; change the pagination offset to `page * pageSize` (boundary off-by-one) in `app/shipments.py` so a row is skipped/duplicated at page boundaries; only diff vs `main` is this defect; visible tests still pass
    - _Requirements: 8.1, 8.2, 8.4, 8.5, 7.2_
  - [x] 4.2 Branch `ticket/l2-eta-timezone` — inject timezone ETA bug (5 min)
    - Branch from `main`; drop the driver timezone conversion in the ETA path so non-UTC driver ETAs are wrong by whole hours; only diff vs `main` is the dropped conversion; visible tests still pass
    - _Requirements: 8.1, 8.2, 8.4, 8.5, 7.3_
  - [x] 4.3 Branch `ticket/l3-route-eta` — feature absent (4 min)
    - Branch from `main` with `GET /routes/{id}/eta` still absent (request returns not-found/unregistered); only diff vs `main` is the absent feature; visible tests still pass
    - _Requirements: 8.1, 8.3, 8.4, 8.5, 7.4_

- [~] 5. Checkpoint — visible suite green on main and all three branches (3 min)
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Write hidden tests and reference solutions per ticket in `brightline-hidden` (20 min)
  - [x] 6.1 L1 hidden test + reference solution (6 min)
    - `tests/brightline-l1-pagination/test_pagination.py`: assert concatenated consecutive pages equal the full set exactly once (no skip/duplicate at boundaries); `solutions/brightline-l1-pagination/` corrected `(page-1)*pageSize` pagination; fails on branch, passes on solution
    - _Requirements: 9.1, 9.2, 9.3, 9.4_
  - [x] 6.2 L2 hidden test + reference solution (6 min)
    - `tests/brightline-l2-eta-timezone/test_eta_timezone.py`: set a non-UTC driver and assert route ETA equals the timezone-adjusted value; `solutions/brightline-l2-eta-timezone/` restores the conversion; fails on branch, passes on solution
    - _Requirements: 9.1, 9.2, 9.3, 9.4_
  - [x] 6.3 L3 hidden test + reference solution (8 min)
    - `tests/brightline-l3-route-eta/test_route_eta.py`: assert `GET /routes/{id}/eta` returns the computed ETA for a known route and not-found for an unknown id; `solutions/brightline-l3-route-eta/` adds the endpoint (`eta = distance / average_speed`); fails on branch (endpoint absent; zero-tests-executed treated as failing), passes on solution
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [x] 7. Implement `scripts/verify_tickets.py` (22 min)
  - [x] 7.1 Manifest loading + schema validation (6 min)
    - `load_manifest` (parse error / absent / unreadable → report naming `tickets.json`, exit non-zero); `validate_schema` reporting every offending `(id, field)`, duplicate ids, wrong ticket count, and bad/duplicate `level`
    - _Requirements: 1.14, 1.15, 1.16, 7.7, 2.9, 10.7, 12.5_
  - [x] 7.2 Layout resolution (4 min)
    - `resolve_layout`: every `hiddenTestPath` resolves under `tests/` and each ticket has a `solutions/<id>/` solution; report missing path/solution with `id`, modify no file, exit non-zero on violation
    - _Requirements: 2.4, 2.6, 2.7, 2.8_
  - [x] 7.3 Isolation leak scan (4 min)
    - `scan_isolation`: scan `brightline` across `main` and every ticket branch; exit zero iff no Hidden_Test_Suite, Reference_Solution, or `tickets.json` present; else report leaked path and exit non-zero
    - _Requirements: 11.1, 11.2, 11.4, 11.5_
  - [x] 7.4 Fail-before / pass-after per-ticket runner + aggregation (8 min)
    - Per ticket in manifest order: run hidden suite against branch (expect ≥1 failing), against solution (expect passed==total); treat 60s timeout and zero-tests-executed as failed; aggregate and exit zero iff every ticket sound, else report counts + which of L1/L2/L3 failed and exit non-zero
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 12.2, 12.6, 13.1, 13.2, 13.3, 13.4_

- [x] 8. REQUIRED property tests (14 min)
  - [x]* 8.1 Property 8 — hidden-test isolation / leak scan (REQUIRED, not cuttable) (7 min)
    - **Property 8: Hidden-test material never leaks into the public repo**
    - hypothesis test over generated `brightline` branch states; ≥100 cases; tag `# Feature: sandbox-brightline, Property 8`
    - **Validates: Requirements 11.1, 11.2, 11.4, 11.5**
  - [x]* 8.2 Property 5 — fail-before / pass-after (REQUIRED, not cuttable) (7 min)
    - **Property 5: Fail-before / pass-after holds for every ticket**
    - hypothesis test with a stubbed test-runner; ≥100 cases; tag `# Feature: sandbox-brightline, Property 5`
    - **Validates: Requirements 8.2, 8.3, 9.2, 9.3, 10.2, 10.3**

- [ ] 9. [CUTTABLE] Remaining property-based tests (Properties 1,2,3,4,6,7,9) (optional, excluded from the 118-min budget)
  - [ ]* 9.1 [CUTTABLE] Property 1 — schema validity accepted, every violation reported
    - **Property 1** · tag `# Feature: sandbox-brightline, Property 1` · ≥100 cases
    - **Validates: Requirements 1.3–1.11, 1.13, 1.15, 1.16, 7.5, 12.1, 12.5**
  - [ ]* 9.2 [CUTTABLE] Property 2 — unparseable/unreadable manifest is a reported error
    - **Property 2** · tag `# Feature: sandbox-brightline, Property 2` · ≥100 cases
    - **Validates: Requirements 1.14, 2.9, 10.7**
  - [ ]* 9.3 [CUTTABLE] Property 3 — layout resolution reports missing assets, modifies nothing
    - **Property 3** · tag `# Feature: sandbox-brightline, Property 3` · ≥100 cases
    - **Validates: Requirements 2.4, 2.6, 2.7, 2.8, 9.1, 9.4**
  - [ ]* 9.4 [CUTTABLE] Property 4 — id maps injectively to asset paths with id as a segment
    - **Property 4** · tag `# Feature: sandbox-brightline, Property 4` · ≥100 cases
    - **Validates: Requirements 2.5**
  - [ ]* 9.5 [CUTTABLE] Property 6 — verifier attempts every ticket; exit code reflects soundness
    - **Property 6** · tag `# Feature: sandbox-brightline, Property 6` · ≥100 cases
    - **Validates: Requirements 10.1, 10.5, 10.6, 13.1, 13.2, 13.3**
  - [ ]* 9.6 [CUTTABLE] Property 7 — grade result maps to outcome per grader contract
    - **Property 7** · tag `# Feature: sandbox-brightline, Property 7` · ≥100 cases
    - **Validates: Requirements 9.5, 10.4, 12.2, 12.6, 13.4**
  - [ ]* 9.7 [CUTTABLE] Property 9 — shipments pagination partitions dataset; invalid params rejected
    - **Property 9** · tag `# Feature: sandbox-brightline, Property 9` · ≥100 cases
    - **Validates: Requirements 3.5, 3.6**

- [x] 10. Final smoke test — run the verifier and show all three tickets pass (9 min)
  - Run `python scripts/verify_tickets.py` from `sim-companies/brightline-hidden/` and confirm it exits zero and reports per-ticket success for L1, L2, and L3 (hidden tests FAIL before the fix on each branch, PASS after on each reference solution)
  - Expected output: all three tickets (L1 pagination, L2 timezone ETA, L3 route ETA) report fail-before + pass-after; exit status 0
  - If any ticket fails, the verifier reports the count passed/failed and which of L1/L2/L3 failed — fix and re-run until all three pass
  - _Requirements: 13.1, 13.2, 13.3, 13.4_

## Notes

- Total estimate 118 minutes across required tasks (Task 9 is [CUTTABLE] and excluded from the budget).
- `[CUTTABLE]` marks tasks safe to drop for the 2-hour target. Property 8 and Property 5 tests are REQUIRED and are NOT cuttable.
- Tasks marked `*` are test sub-tasks (optional in workflow form); core implementation tasks are never optional.
- Task 1 commits the frozen contract (schema + layout) on its own, first, because the grader team (spec #3) depends on it.
- Each task references its requirement IDs; property-test tasks reference their design property number.
- The final smoke test is the single real end-to-end proof that the sandbox is demo-ready.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3"] },
    { "id": 3, "tasks": ["3.1"] },
    { "id": 4, "tasks": ["3.2", "3.3"] },
    { "id": 5, "tasks": ["4.1", "4.2", "4.3"] },
    { "id": 6, "tasks": ["6.1", "6.2", "6.3"] },
    { "id": 7, "tasks": ["7.1", "7.2", "7.3", "7.4"] },
    { "id": 8, "tasks": ["8.1", "8.2", "9.1", "9.2", "9.3", "9.4", "9.5", "9.6", "9.7"] }
  ]
}
```
