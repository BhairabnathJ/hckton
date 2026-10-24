# Implementation Plan: system-architecture

## Overview

This spec is **planning and documentation only**. It produces no application code,
configuration, or scripts. The single deliverable is the authoritative planning
artifact `/docs/architecture.md`, assembled section by section from the approved
design document.

The tasks below each author or assemble one of the nine required sections of
`/docs/architecture.md` (plus the authoritative-reference framing), ordered by
dependency. The document is built incrementally: the file and framing are created
first, then each section is appended in the fixed order the design mandates, and a
final script-based smoke test verifies the artifact exists, contains all nine
section headings, contains every required Mermaid fence, and that no application
code was produced.

Because this spec ships no runtime system, there are **no Correctness Properties to
test here** — the design's Correctness Properties are behavioral properties of the
future runtime implemented and tested by downstream specs (`core-api`, `grader`,
`marketplace`). Accordingly, this plan contains no property-based or unit-test
sub-tasks; verification is script-based document validation only.

Each task is estimated in minutes against the 8-hour hackathon context. Tasks marked
**[CUTTABLE]** can be dropped if time runs short while still leaving a usable
architecture document; tasks not so marked are the minimum viable artifact.

## Tasks

- [~] 1. Create the artifact file and authoritative-reference framing
  - Create `/docs/architecture.md` with a title and an opening framing block.
  - Declare the document the authoritative reference for the SideQuest backend and sandbox system.
  - State that every later spec (`api-contract`, `sandbox-brightline`, `grader`, `core-api`, `marketplace`, `injection-hook`) must conform to the module boundaries, data model, interfaces, state machines, security model, and build plan defined here.
  - State the conflict rule: if a later spec conflicts with any element defined here, this document is updated first before the later spec is approved; record that an approved deviation must identify the superseded element and the date the change took effect.
  - State that this spec produces only this document and no application code, config, or executable scripts.
  - Est: 15 min
  - _Requirements: 1.1, 1.4, 11.1, 11.2, 11.3, 11.4_

- [~] 2. Author Section 1 — System overview + component diagram
  - Append the top-level heading for the system overview (first of the nine sections).
  - Describe the Express + TypeScript API, the grader, and the live update (SSE) transport, each in at least one sentence.
  - Embed the Component_Diagram as a Mermaid fenced code block (` ```mermaid `) depicting distinct labeled nodes for: API feature modules, grader, Docker sandbox, GitHub, Bedrock, SQLite, and the SSE hub.
  - Ensure every named component has at least one connection, and that the only read/write connection to SQLite originates from the API component.
  - _Requirements: 1.2, 2.1, 2.2, 2.3, 2.4, 2.5_

- [~] 3. Author Section 2 — Module boundaries and responsibilities
  - Append the top-level heading for module boundaries (second section).
  - Document all nine modules: users, tickets, attempts, ai-personas, progression, telemetry, grader, marketplace, events.
  - For each module, state what it owns and what it explicitly does not own, ensuring no responsibility is owned by two modules.
  - Describe the inter-module dependency direction as a directed acyclic graph (no cycles); for any module with no outgoing dependency, state it has none.
  - _Requirements: 1.2, 3.1, 3.2, 3.3, 3.4, 3.5_

- [~] 4. Author Section 3 — Data model (ER diagram)
  - Append the top-level heading for the data model (third section).
  - Embed the ER_Diagram as a Mermaid `erDiagram` fenced block with exactly the entities User, Ticket, Attempt, GradeRun, Review, Persona, Job, Submission, TelemetryEvent — no others.
  - Give each entity at least one primary-key identifier attribute, and assign every inter-entity relationship a cardinality (1:1, 1:many, or many:many).
  - Mark the hidden-test reference field (`Ticket.hiddenTestRef`) with a server-only annotation stating it is never exposed to the student-facing repo or client.
  - _Requirements: 1.2, 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 5. Author Section 4 — Sequence diagrams
  - Append the top-level heading for sequence diagrams (fourth section).
  - [~] 5.1 Add sequence diagram (a): start ticket → PR → grade → review → XP
    - Mermaid `sequenceDiagram` fenced block depicting all 5 steps in ascending chronological order, each step with at least one labeled interaction.
    - Label every participant with a name matching a component named elsewhere in the document.
    - _Requirements: 5.1, 5.4_
  - [~] 5.2 Add sequence diagram (b): job drop → claim → submit → accept → mock escrow release
    - Mermaid `sequenceDiagram` fenced block depicting all 5 steps in ascending chronological order, each step with at least one labeled interaction.
    - Label every participant with a name matching a component named elsewhere in the document.
    - _Requirements: 5.2, 5.4_
  - [~] 5.3 Add sequence diagram (c): bug-injection hook → new ticket
    - Mermaid `sequenceDiagram` fenced block depicting ordered interactions from hook trigger to new-ticket creation, each step with at least one labeled interaction.
    - Label every participant with a name matching a component named elsewhere in the document.
    - _Requirements: 5.3, 5.4_

- [ ] 6. Author Section 5 — State machines (Attempt, Job)
  - Append the top-level heading for state machines (fifth section).
  - [~] 6.1 Add the Attempt state machine
    - Mermaid `stateDiagram-v2` fenced block including states in_progress, grading, changes_requested, passed, abandoned.
    - Define each permitted transition as a directed edge labeled with its triggering event; mark in_progress as initial and passed and abandoned as terminal.
    - _Requirements: 6.1, 6.3, 6.5, 6.7_
  - [~] 6.2 Add the Job state machine
    - Mermaid `stateDiagram-v2` fenced block including states dropped, claimed, submitted, accepted.
    - Define each permitted transition as a directed edge labeled with its triggering event; mark dropped as initial and accepted as terminal.
    - _Requirements: 6.2, 6.4, 6.6, 6.7_

- [~] 7. Author Section 6 — Security model
  - Append the top-level heading for the security model (sixth section).
  - Describe hidden-test isolation: hidden tests and ticket definitions are server-only and no API response includes their contents.
  - Document sandbox limits (`--network none`, 512 MB, 1 CPU, 60 s timeout) and that a run exceeding the timeout is terminated and reported as failed.
  - Document that the GitHub PAT and Bedrock credentials are read from env vars, never logged or returned (including in error responses), and that a missing credential at startup is surfaced as an error without exposing any value.
  - Document that telemetry events are recorded only when the user has opted in.
  - _Requirements: 1.2, 7.1, 7.2, 7.3, 7.4, 7.5_

- [~] 8. Author Section 7 — Mock inventory and production replacements
  - Append the top-level heading for mocks and production replacements (seventh section).
  - List exactly three mocks: the `X-Demo-User` auth mock, the Stripe escrow mock, and the payouts mock.
  - For each, record its source location (file path) and the containing component/module, and describe the named production replacement mechanism and the observable behavior it provides.
  - State the MOCK convention: every mock code path is marked in source with a `// MOCK` comment; mark any mock lacking a replacement with an explicit "undefined" indicator.
  - _Requirements: 1.2, 8.1, 8.2, 8.3, 8.4, 8.5_

- [~] 9. Author Section 8 — Build plan in dependency order
  - Append the top-level heading for the build plan (eighth section).
  - List exactly the six specs api-contract, sandbox-brightline, grader, core-api, marketplace, injection-hook in dependency order (each spec appears after every spec in its dependencies).
  - For each spec state all five attributes: inputs, outputs, dependencies, owner (one of Person A/B/C/D), and time estimate in hours, with the per-owner sum not exceeding 8 hours.
  - Note that any dependency on a spec outside the six listed must be flagged as unresolved.
  - _Requirements: 1.2, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

- [~] 10. Author Section 9 — Known risks and fallbacks
  - Append the top-level heading for known risks and fallbacks (ninth section).
  - List at least 3 risk entries, each with a risk description, a corresponding fallback action, and a trigger condition.
  - Include the specific risk that Docker is unavailable, paired with the fallback of a local subprocess runner behind the same grader interface.
  - Ensure no entry omits its fallback action or trigger condition.
  - _Requirements: 1.2, 10.1, 10.2, 10.3, 10.4_

- [~] 11. Checkpoint — review section structure and ordering
  - Confirm the document contains exactly the nine required top-level sections, in the mandated order, with no missing, extraneous, or out-of-order section.
  - Ensure all tests pass, ask the user if questions arise.
  - Est: 10 min
  - _Requirements: 1.2, 1.3_

- [~] 12. Author a script-based smoke test and run final verification
  - Create a verification shell script (e.g., `docs/verify-architecture.sh`) — NOT an HTTP curl, since no service runs — that asserts the artifact and its structure.
  - The script MUST: fail if `/docs/architecture.md` does not exist; grep for all nine required section headings and report any that is missing; and grep for the required Mermaid fences (` ```mermaid `) confirming the component diagram, ER diagram, the three sequence diagrams, and the two state machines are all present (expect at least 7 fenced Mermaid blocks).
  - The script MUST also confirm no application code was produced by this spec: assert the only new deliverable path is under `/docs/` (the architecture document and this verification script) and that no `apps/`, `packages/`, `grader/`, or `sim-companies/` source files were created by this spec.
  - Run the script and confirm it passes; this is the final smoke test.
  - Est: 25 min
  - _Requirements: 1.1, 1.3, 1.4, 2.2, 4.1, 5.5, 6.1, 6.2_

## Notes

- This spec produces **only** `/docs/architecture.md` (plus the verification script in task 12). No application code, config, or executable application scripts are created — per Requirement 1.4.
- **[CUTTABLE]** candidates if the 8-hour clock runs short: sequence diagram (c) in 5.3 (injection-hook flow is the last/independently cuttable spec), and the Job state machine detail in 6.2 can be reduced to states-only. The core loop (sections 1–4, 5.1, 6.1, 7) is the minimum viable artifact and must not be cut.
- There are no property-based or unit tests in this plan: the deliverable is a document, and the design's Correctness Properties belong to downstream runtime specs. Verification here is script-based document validation (task 12).
- Each task references the specific requirement sub-clauses it satisfies for traceability.
- The checkpoint (task 11) and the final smoke test (task 12) ensure the artifact is structurally complete and renders before the spec is considered done.

## Task Dependency Graph

> Every task appends to the same file (`/docs/architecture.md`), so no two authoring
> tasks may run in the same wave. They are serialized in document order; the final
> verification task runs last once all sections exist.

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2"] },
    { "id": 2, "tasks": ["3"] },
    { "id": 3, "tasks": ["4"] },
    { "id": 4, "tasks": ["5.1"] },
    { "id": 5, "tasks": ["5.2"] },
    { "id": 6, "tasks": ["5.3"] },
    { "id": 7, "tasks": ["6.1"] },
    { "id": 8, "tasks": ["6.2"] },
    { "id": 9, "tasks": ["7"] },
    { "id": 10, "tasks": ["8"] },
    { "id": 11, "tasks": ["9"] },
    { "id": 12, "tasks": ["10"] },
    { "id": 13, "tasks": ["12"] }
  ]
}
```
