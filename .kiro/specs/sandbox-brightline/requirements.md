# Requirements Document

## Introduction

This feature delivers the **simulated company codebase** that SideQuest students work in, implemented as the two repositories under `/sim-companies` defined by build-plan spec #2 (`sandbox-brightline`) in `/docs/architecture.md`. It produces:

- `sim-companies/brightline` — the **student-facing, public** Python 3.12 FastAPI application for the fictional company "Brightline Logistics" (domain: shipments, drivers, routes), deliberately realistic and messy, with visible tests that pass on `main` and a `CONTRIBUTING.md` describing the branch/PR workflow. It contains **no hidden tests**.
- `sim-companies/brightline-hidden` — the **server-only** repository holding `tickets.json`, the hidden pytest tests, the reference solutions, and the `scripts/verify_tickets.py` verifier. Nothing in this repository is ever shipped to students.

The single most important, highest-priority deliverable is the **`tickets.json` schema and the hidden-test folder layout**, because the grader team (build-plan spec #3, `grader`) consumes this contract directly. These artifacts must be finalized, stable, and committable first, with explicit field names, types, and folder layout.

This spec conforms to `/docs/architecture.md` as the authoritative reference — specifically the `Ticket` data model, the hidden-test server-only isolation rules in the Security Model, the grader I/O contract (Section 4a and build-plan spec #3), and the inputs/outputs of build-plan spec #2. If any requirement here would conflict with `/docs/architecture.md`, the architecture document governs and the conflict must be flagged before approval. This spec is planning only and produces no application code; downstream work implements it.

## Glossary

- **Brightline_Repo**: The student-facing repository at `sim-companies/brightline`. A Python 3.12 FastAPI application for "Brightline Logistics." Public; contains no hidden tests.
- **Brightline_Hidden_Repo**: The server-only repository at `sim-companies/brightline-hidden`. Holds `tickets.json`, hidden tests, reference solutions, and the verifier. Never exposed to students.
- **Brightline_App**: The FastAPI application inside Brightline_Repo whose domain is shipments, drivers, and routes, backed by a SQLite database with seed data.
- **Ticket_Manifest**: The `tickets.json` file in Brightline_Hidden_Repo that defines every ticket and is the authoritative contract consumed by the grader.
- **Ticket_Entry**: A single ticket definition within Ticket_Manifest, with the fields `id`, `level`, `title`, `description`, `acceptanceCriteria`, `branch`, and `hiddenTestPath`.
- **Hidden_Test_Suite**: The pytest test files stored only in Brightline_Hidden_Repo that assess a ticket; referenced by `Ticket_Entry.hiddenTestPath`.
- **Reference_Solution**: The correct implementation for a ticket, stored under `brightline-hidden/solutions/`, used to prove the Hidden_Test_Suite passes after the fix.
- **Ticket_Branch**: A branch in Brightline_Repo, named by `Ticket_Entry.branch`, that contains the injected bug (L1, L2) or the missing feature (L3) for the ticket.
- **Verify_Tickets_Script**: The `scripts/verify_tickets.py` program in Brightline_Hidden_Repo that proves, for every ticket, that the Hidden_Test_Suite fails before the fix and passes after it.
- **Visible_Test_Suite**: The tests committed inside Brightline_Repo that are visible to students and pass on `main`.
- **Grader_IO_Contract**: The grader input/output contract defined in `/docs/architecture.md` (Section 4a and build-plan spec #3): input of repo, ref/branch, ticket id, and hidden-test reference; output of pass/fail counts and a bounded log excerpt.
- **Hidden_Test_Reference**: The server-only reference into Brightline_Hidden_Repo that identifies a ticket's hidden tests, corresponding to `Ticket.hiddenTestRef` in the architecture data model.

## Requirements

### Requirement 1: tickets.json schema is finalized, stable, and committable first

**User Story:** As a grader engineer, I want a finalized and stable `tickets.json` schema with explicit field names and types, so that I can build the grader against a fixed contract without waiting for the rest of the sandbox.

#### Acceptance Criteria

1. THE Ticket_Manifest SHALL be defined before any Brightline_App code, Hidden_Test_Suite, or Reference_Solution is defined.
2. THE Ticket_Manifest SHALL be a single JSON file located at `sim-companies/brightline-hidden/tickets.json`.
3. THE Ticket_Manifest SHALL contain a top-level array of Ticket_Entry objects.
4. THE Ticket_Entry SHALL contain the field `id` with a non-empty string value.
5. THE Ticket_Entry SHALL contain the field `level` with an integer value equal to 1, 2, or 3.
6. THE Ticket_Entry SHALL contain the field `title` with a non-empty string value.
7. THE Ticket_Entry SHALL contain the field `description` with a string value.
8. THE Ticket_Entry SHALL contain the field `acceptanceCriteria` with a value that is an array of one or more strings, where every array element is a string.
9. THE Ticket_Entry SHALL contain the field `branch` with a non-empty string value naming the Ticket_Branch in Brightline_Repo.
10. THE Ticket_Entry SHALL contain the field `hiddenTestPath` with a non-empty string value giving the repository-relative path to the Hidden_Test_Suite within Brightline_Hidden_Repo.
11. THE Ticket_Entry SHALL contain the field `repo` with a non-empty string value, the field `difficulty` with a non-empty string value, and the field `xpReward` with an integer value of 0 or greater, so that each Ticket_Entry carries the public ticket metadata named in the architecture `Ticket` data model.
12. WHERE a Ticket_Entry field name corresponds to a `Ticket` attribute in the `/docs/architecture.md` data model, THE Ticket_Manifest SHALL use a field name and value type consistent with that attribute's type as declared in that data model.
13. THE Ticket_Manifest SHALL contain Ticket_Entry objects whose `id` values are each unique across the top-level array.
14. IF the Ticket_Manifest fails to parse as JSON, THEN THE Verify_Tickets_Script SHALL report a parse error that identifies the Ticket_Manifest file and exit with a non-zero status.
15. IF a Ticket_Entry is missing a required field, holds a field value of the wrong type, or shares its `id` value with another Ticket_Entry, THEN THE Verify_Tickets_Script SHALL report the offending Ticket_Entry `id` and field name for every such violation detected and exit with a non-zero status.
16. WHEN the Verify_Tickets_Script runs against a Ticket_Manifest in which every Ticket_Entry satisfies criteria 3 through 13, THE Verify_Tickets_Script SHALL exit with a zero status.

### Requirement 2: Hidden-test folder layout is finalized and stable

**User Story:** As a grader engineer, I want a fixed folder layout for hidden tests, reference solutions, and branch references, so that the grader can locate a ticket's assets deterministically from `tickets.json`.

#### Acceptance Criteria

1. THE Brightline_Hidden_Repo SHALL store every Hidden_Test_Suite under a `tests/` directory.
2. THE Brightline_Hidden_Repo SHALL store every Reference_Solution under a `solutions/` directory.
3. THE Brightline_Hidden_Repo SHALL store the Verify_Tickets_Script at `scripts/verify_tickets.py`.
4. THE Ticket_Entry `hiddenTestPath` SHALL resolve to an existing file within the Brightline_Hidden_Repo `tests/` directory.
5. THE Brightline_Hidden_Repo SHALL organize the Reference_Solution and Hidden_Test_Suite for each ticket so that the Ticket_Entry `id` appears as a path segment, distinct ids map to distinct non-overlapping paths, and each id maps to exactly one path.
6. IF a Ticket_Entry `hiddenTestPath` points to a file that does not exist, THEN THE Verify_Tickets_Script SHALL report the missing path with the Ticket_Entry `id`, make no modification to any file, and exit with a non-zero status.
7. IF a Ticket_Entry has no corresponding Reference_Solution under `solutions/`, THEN THE Verify_Tickets_Script SHALL report the missing Reference_Solution with the Ticket_Entry `id`, make no modification to any file, and exit with a non-zero status.
8. WHEN every Ticket_Entry resolves to an existing Hidden_Test_Suite file under `tests/` and a Reference_Solution under `solutions/`, THE Verify_Tickets_Script SHALL exit with a zero status.
9. IF the Ticket_Manifest is absent or cannot be read when the Verify_Tickets_Script attempts layout resolution, THEN THE Verify_Tickets_Script SHALL report the condition and exit with a non-zero status.

### Requirement 3: Brightline student-facing FastAPI application

**User Story:** As a student, I want a realistic company codebase to work in, so that I practice the real engineering workflow in a believable environment.

#### Acceptance Criteria

1. THE Brightline_App SHALL be a Python 3.12 FastAPI application located in Brightline_Repo.
2. THE Brightline_App SHALL model the domain of shipments, drivers, and routes.
3. THE Brightline_App SHALL use a SQLite database.
4. THE Brightline_App SHALL provide seed data that, when loaded into the SQLite database, populates at least 20 shipments, at least 3 drivers, and at least 3 routes.
5. WHEN a client requests `GET /shipments`, THE Brightline_App SHALL return a list of shipments paginated with a client-supplied page number and page size, where page size defaults to 20 and is bounded to a maximum of 100 items per page.
6. IF a `GET /shipments` request supplies a page number or page size that is non-numeric, less than 1, or a page size above the maximum of 100, THEN THE Brightline_App SHALL reject the request with an error response indicating the invalid pagination parameter and SHALL NOT return a shipments list.
7. WHEN a client requests a route resource, THE Brightline_App SHALL return an estimated time of arrival for that route as a value computed by the application.
8. THE Brightline_Repo SHALL contain no fewer than 12 and no more than 18 files.

### Requirement 4: Deliberate realistic imperfections in Brightline

**User Story:** As a learning designer, I want the Brightline codebase to contain realistic imperfections, so that students experience the messiness of real production code.

#### Acceptance Criteria

1. THE Brightline_Repo SHALL include a README that documents at least one named application behavior that no longer matches the current Brightline_App behavior and is identifiable as stale.
2. THE Brightline_Repo SHALL contain exactly one module that mixes `snake_case` and `camelCase` identifier naming, containing at least one identifier of each naming style within that single module.
3. THE Brightline_Repo SHALL contain exactly one module that carries an explicit deprecation comment marking it as legacy.
4. THE Brightline_Repo SHALL contain at least one function that has two or more parameters whose docstring documents at least one parameter and omits at least one other parameter.
5. THE Visible_Test_Suite SHALL contain exactly one test whose recorded execution time is strictly greater than every other test's recorded time and that carries an explicit deliberately-slow-test annotation.

### Requirement 5: Visible tests pass on Brightline main

**User Story:** As a student, I want the visible tests to pass on a fresh checkout of `main`, so that I start from a known-good baseline before I begin a ticket.

#### Acceptance Criteria

1. THE Brightline_Repo SHALL include a Visible_Test_Suite committed inside the repository.
2. WHEN the Visible_Test_Suite is run against a clean checkout of the `main` branch of Brightline_Repo with no uncommitted changes, THE Visible_Test_Suite SHALL report zero failing tests and zero errored tests.
3. THE Brightline_Repo SHALL NOT contain any file belonging to a Hidden_Test_Suite, any Reference_Solution, or the Ticket_Manifest.
4. THE Visible_Test_Suite SHALL contain at least one executable test, so that a passing run on `main` establishes a non-empty known-good baseline rather than a vacuous pass.

### Requirement 6: CONTRIBUTING.md describes the branch and PR workflow

**User Story:** As a student, I want contributor documentation, so that I know how to branch, open a pull request, and get my work graded.

#### Acceptance Criteria

1. THE Brightline_Repo SHALL include a `CONTRIBUTING.md` file at the repository root.
2. THE `CONTRIBUTING.md` SHALL document the ordered steps a student performs to create a branch for work on a ticket, including the git command used to create the branch and a branch-naming convention.
3. THE `CONTRIBUTING.md` SHALL document the ordered steps a student performs to open a pull request for a branch, including pushing the branch and opening the pull request against the Brightline_Repo default branch.
4. THE `CONTRIBUTING.md` SHALL state that opening a pull request submits the branch for grading and that the submitted pull request is evaluated by hidden tests that are not present in the Brightline_Repo.
5. THE `CONTRIBUTING.md` SHALL state that when hidden tests fail the pull request is marked as needing changes, and that the student pushes further commits to the same branch to re-trigger grading until the hidden tests pass.

### Requirement 7: Exactly three tickets are defined

**User Story:** As a learning designer, I want exactly three leveled tickets, so that students have a defined L1–L3 progression in the Brightline codebase.

#### Acceptance Criteria

1. THE Ticket_Manifest SHALL define exactly three Ticket_Entry objects.
2. THE Ticket_Manifest SHALL define exactly one Ticket_Entry with `level` equal to 1 that describes an off-by-one pagination defect on `GET /shipments`.
3. THE Ticket_Manifest SHALL define exactly one Ticket_Entry with `level` equal to 2 that describes a timezone defect where route estimated-time-of-arrival values are incorrect by whole hours for drivers in non-UTC time zones.
4. THE Ticket_Manifest SHALL define exactly one Ticket_Entry with `level` equal to 3 that describes a new `GET /routes/{id}/eta` feature that returns an estimated time of arrival computed from distance and average speed.
5. THE Ticket_Manifest SHALL assign each Ticket_Entry an `id` that is unique among all Ticket_Entry objects in the Ticket_Manifest.
6. THE Ticket_Manifest SHALL assign the `level` values 1, 2, and 3 so that each of those three values appears on exactly one Ticket_Entry and no two Ticket_Entry objects share the same `level`.
7. IF the Ticket_Manifest contains a number of Ticket_Entry objects other than three, or a `level` value outside the set {1, 2, 3}, or a duplicated `level` or `id`, THEN THE Verify_Tickets_Script SHALL report the offending condition with the affected Ticket_Entry `id` and exit with a non-zero status.

### Requirement 8: Each ticket has a branch with the bug injected or the feature absent

**User Story:** As a student, I want each ticket to start from a branch that reproduces the problem, so that I have a concrete failing state to fix.

#### Acceptance Criteria

1. THE Brightline_Repo SHALL contain exactly one Ticket_Branch for each Ticket_Entry, named by the Ticket_Entry `branch` field.
2. WHERE a Ticket_Entry has a `level` of 1 or 2, THE corresponding Ticket_Branch SHALL reproduce the defective behavior described by the Ticket_Entry `description` and `acceptanceCriteria`.
3. WHERE a Ticket_Entry has a `level` of 3, THE corresponding Ticket_Branch SHALL omit the feature described by the Ticket_Entry `description` and `acceptanceCriteria` such that the described behavior is absent.
4. WHEN the Visible_Test_Suite is run against a Ticket_Branch, THE Visible_Test_Suite SHALL report that every visible test passes.
5. THE Brightline_Repo SHALL derive each Ticket_Branch from the `main` branch so that the only difference between the Ticket_Branch and `main` is the ticket's injected defect or absent feature.

### Requirement 9: Hidden tests fail on the ticket branch and pass on the reference solution

**User Story:** As a grader engineer, I want hidden tests that distinguish an unsolved branch from a correct solution, so that grading reflects whether the ticket was actually completed.

#### Acceptance Criteria

1. THE Brightline_Hidden_Repo SHALL provide, for each Ticket_Entry, a Hidden_Test_Suite containing at least one test.
2. WHEN a Ticket_Entry's Hidden_Test_Suite is run against that Ticket_Entry's Ticket_Branch without the fix applied, THE Hidden_Test_Suite SHALL report at least one failing test within the 60-second sandbox execution timeout.
3. WHEN a Ticket_Entry's Hidden_Test_Suite is run against that Ticket_Entry's Reference_Solution, THE Hidden_Test_Suite SHALL report that every test in the Hidden_Test_Suite passes within the 60-second sandbox execution timeout.
4. THE Brightline_Hidden_Repo SHALL store a Reference_Solution under `solutions/` for each Ticket_Entry.
5. IF a Ticket_Entry's Hidden_Test_Suite completes with zero tests executed, THEN THE Brightline_Hidden_Repo SHALL treat the run as failing rather than passing.

### Requirement 10: verify_tickets.py proves fail-before / pass-after for every ticket

**User Story:** As a grader engineer, I want a single verifier that validates every ticket end to end, so that I can trust the ticket assets before the grader depends on them.

#### Acceptance Criteria

1. WHEN the Verify_Tickets_Script is run, THE Verify_Tickets_Script SHALL process every Ticket_Entry in the Ticket_Manifest in manifest order with no entry skipped.
2. FOR each Ticket_Entry, THE Verify_Tickets_Script SHALL confirm the fail-before condition by running the Hidden_Test_Suite against the Ticket_Branch without the fix and observing at least one failing test.
3. FOR each Ticket_Entry, THE Verify_Tickets_Script SHALL confirm the pass-after condition by running the Hidden_Test_Suite against the Reference_Solution and observing that the number of tests passed equals the number of tests total with zero failing.
4. THE Verify_Tickets_Script SHALL treat a Hidden_Test_Suite run that exceeds the 60-second sandbox execution timeout as a failed check for that Ticket_Entry.
5. WHEN every processed Ticket_Entry satisfies both the fail-before and pass-after checks, THE Verify_Tickets_Script SHALL report that all tickets pass verification and exit with a zero status.
6. IF any Ticket_Entry fails either the fail-before check or the pass-after check, THEN THE Verify_Tickets_Script SHALL report the offending Ticket_Entry `id` and which check failed and exit with a non-zero status.
7. IF the Ticket_Manifest is empty or unreadable, or a Ticket_Entry is missing its Ticket_Branch, Reference_Solution, or Hidden_Test_Suite assets, THEN THE Verify_Tickets_Script SHALL report the condition with the affected Ticket_Entry `id` and exit with a non-zero status.

### Requirement 11: Hidden-test isolation

**User Story:** As a security owner, I want hidden tests, solutions, and the ticket manifest confined to the server-only repository, so that students cannot read the assessment material.

#### Acceptance Criteria

1. THE Ticket_Manifest, every Hidden_Test_Suite, and every Reference_Solution SHALL reside only in Brightline_Hidden_Repo.
2. THE Brightline_Repo SHALL exclude the Ticket_Manifest, every Hidden_Test_Suite, and every Reference_Solution from all of its branches, including `main` and every Ticket_Branch.
3. THE Hidden_Test_Reference for a ticket SHALL be the server-only reference corresponding to `Ticket.hiddenTestRef` in the `/docs/architecture.md` data model, and THE Hidden_Test_Reference SHALL be omitted from every API response and from the Brightline_Repo so that it is never serialized to any client or to the public template.
4. WHEN the Verify_Tickets_Script scans Brightline_Repo across all of its branches, including `main` and every Ticket_Branch, and finds no Hidden_Test_Suite file, no Reference_Solution file, and no Ticket_Manifest, THE Verify_Tickets_Script SHALL exit with a zero status.
5. IF a Hidden_Test_Suite file, Reference_Solution file, or the Ticket_Manifest is found on any branch of Brightline_Repo, THEN THE Verify_Tickets_Script SHALL report the leaked file path and exit with a non-zero status.

### Requirement 12: Alignment with the grader I/O contract

**User Story:** As a grader engineer, I want the ticket assets to match the grader I/O contract in the architecture, so that the grader can invoke grading using only repo, ref, ticket id, and hidden-test reference.

#### Acceptance Criteria

1. THE Ticket_Manifest SHALL provide, for each Ticket_Entry, the repository name, the Ticket_Branch reference, the ticket `id`, and the Hidden_Test_Reference required by the Grader_IO_Contract.
2. THE Hidden_Test_Suite SHALL produce results expressible as a count of tests passed and a count of tests total that are non-negative integers where the count of tests passed is less than or equal to the count of tests total, consistent with the Grader_IO_Contract.
3. THE Hidden_Test_Suite output consumed for grading SHALL contain no Hidden_Test_Suite source content, so that it can be reduced to a bounded log excerpt consistent with the Grader_IO_Contract.
4. WHERE the Grader_IO_Contract in `/docs/architecture.md` defines a field or value for grade input or output, THE Ticket_Manifest and Hidden_Test_Suite SHALL conform to that definition rather than introducing a divergent one.
5. IF a Ticket_Entry is missing any field required by the Grader_IO_Contract (the repository name, the Ticket_Branch reference, the ticket `id`, or the Hidden_Test_Reference), THEN THE Verify_Tickets_Script SHALL report the missing field with the Ticket_Entry `id` and exit with a non-zero status.
6. THE grading outcome for a Ticket_Entry SHALL be derivable as passed only when the count of tests passed equals the count of tests total, consistent with the Grader_IO_Contract pass/fail determination.

### Requirement 13: Smoke verification of all three tickets

**User Story:** As a build owner, I want a single smoke run to confirm the whole sandbox is sound, so that I know the three tickets are demo-ready.

#### Acceptance Criteria

1. WHEN the Verify_Tickets_Script is run as the smoke test, THE Verify_Tickets_Script SHALL verify the L1, L2, and L3 tickets within one execution, attempting verification of all three tickets regardless of whether any individual ticket fails.
2. WHEN all three tickets satisfy both fail-before verification and pass-after verification, THE Verify_Tickets_Script SHALL report a per-ticket success outcome for each of the L1, L2, and L3 tickets and exit with a zero status.
3. IF fewer than three tickets satisfy both fail-before and pass-after verification during the smoke run, THEN THE Verify_Tickets_Script SHALL report the count of tickets that passed and the count of tickets that failed, identify which of the L1, L2, and L3 tickets failed, and exit with a non-zero status.
4. IF a ticket cannot complete verification during the smoke run because a grade run exceeds the enforced 60-second sandbox timeout or otherwise errors before producing a fail-before/pass-after result, THEN THE Verify_Tickets_Script SHALL count that ticket as failed, include it in the failed-ticket report of criterion 3, and continue verifying the remaining tickets.
