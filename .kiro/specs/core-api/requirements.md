# Requirements Document

## Introduction

This feature is build-plan spec #4 (`core-api`) from `/docs/architecture.md`: the real Express + TypeScript API that implements the learning loop against the frozen `api-contract`. It turns the `/packages/shared` zod contract and the `/apps/api/openapi.yaml` document into running feature modules backed by Prisma + SQLite, consuming the `grader` seam and the `LLMProvider` seam that already exist in the repo.

It produces the seven API modules named in `/docs/architecture.md` §8 build-plan output for `core-api`:

- **`users`** — demo auth from `X-Demo-User` (`// MOCK`), profile reads, telemetry opt-in toggle, the Level 6 gate check.
- **`tickets`** — ticket definitions sourced from `sim-companies/brightline-hidden/tickets.json`, listed and filtered by the current user's level, public view only (never `hiddenTestRef`).
- **`attempts`** — the attempt lifecycle: start, submit PR (queues a grade through `grader`, returns `202`), read status; applies the grade outcome and triggers the XP award.
- **`ai-personas`** — `pm` and `coach` personas over `LLMProvider`; coach logs every message to `HintLog` and increments `hintsUsed`.
- **`progression`** — XP math, level computation, Level 6 unlock; applied on a passing attempt.
- **`telemetry`** — opt-in event capture, recorded **only** when `User.telemetryOptIn === true`.
- **`events`** — the SSE hub transport (progress/XP updates), reused by `attempts` and `progression`.

The `grader` module seam (the bridge to the Docker sandbox runner + reviewer) is consumed here; its full Docker runner is owned by the separate `grader` spec (build-plan #3). This spec provides the grader seam interface plus a default runner good enough to run the demo loop end to end, selectable by env so the real Docker runner drops in behind the same interface.

This spec is **planning and documentation only** at the requirements/design/tasks stage. Implementation (the Prisma schema, the modules, the seed, and the smoke script) happens only after requirements, design, and tasks are approved.

### Authoritative-reference conformance

`/docs/architecture.md` is the authoritative reference. This spec conforms to its module boundaries (§2), data model (§3), sequence flows (§4), state machines (§5), security model (§6, hidden-test isolation / secrets / opt-in telemetry), the mock inventory (§7), and the `core-api` inputs/outputs/dependencies in the build plan (§8). It builds only against `api-contract` (§8 #1) and `grader` (§8 #3), with no dependency outside the six specs.

### Contract conformance (terminology reconciliation)

The user-provided task used several field names that differ from the frozen `api-contract` in `/packages/shared`. Per the architecture conflict-and-deviation rule, the **contract wins** (it is already approved and committed), and this spec uses the contract names. The mapping below is normative for every requirement that follows:

- The telemetry opt-in field is **`telemetryOptIn`** (User), not `optInProfile`. The task's "optInProfile = true" means `User.telemetryOptIn === true`.
- The attempt lifecycle field is **`status`** with values `in_progress | grading | passed | changes_requested | abandoned` (architecture §5 / `api-contract` C1), not a free-form `state`.
- The attempt counters are **`testRuns`**, **`reviewRounds`**, and **`hintsUsed`** (Attempt entity). "reviewRounds++" increments `Attempt.reviewRounds`; "hintsUsed" increments `Attempt.hintsUsed`.
- Tickets carry no `hiddenTestRef` in any client response; the server-side hidden-test reference is sourced from `sim-companies/brightline-hidden/tickets.json` (`hiddenTestPath`) and kept inside the API process only.

No requirement below introduces a new entity, field, endpoint, or enum value beyond the frozen `api-contract`. Any shape not already in `/packages/shared` (e.g. the internal `GradeResult`) is an **internal, server-only** type that is never serialized to a client.

### Implementation profile (Option B — demo-critical path)

The requirements are implementation-agnostic; the approved **Option B** profile refines *how* they are met without weakening *what* they require:

- **Synchronous grading.** The "enqueue a Grade_Job" / "graded in the background" language (Requirements 4.3, 4.7, 5.2) is satisfied by grading **inline** within the submit request: the attempt still moves through `grading` and resolves to `passed`/`changes_requested`, and the submit still returns `202`. The job queue is **deferred** (not built in this spec); reintroducing it later is additive and changes no module boundary.
- **Subprocess runner.** The Grader_Seam runner (Requirement 5.1, 11.2) is the `SubprocessRunner` by default (`GRADER_RUNNER=subprocess`); the Docker runner is the last, cuttable task.
- **Live Gemini reviewer.** The `ai-personas` reviewer (Requirement 6.5) uses `LLM_PROVIDER=gemini` with `GEMINI_MODEL=gemini-3.8-flash` — the real model, not the mock provider.
- **`.env` is operator-managed.** Credentials (`GITHUB_TOKEN`, `GEMINI_API_KEY`) are provided by the operator; the implementation never creates or edits `.env` (Requirement 1.7).
- **Optional (`*`) checks deferred.** The end-to-end smoke test (Requirement 10) plus a GitHub wrong-fix PR proof are the verification.

## Glossary

- **Core_API**: The Express + TypeScript process under `apps/api` whose feature modules live in `src/modules/<name>/`, each with a thin `routes.ts`, a fat `service.ts`, and a `schema.ts` (re-exporting `/packages/shared` where shared).
- **Shared_Contract**: The frozen zod schemas + types in `/packages/shared` imported by Core_API; the single source of truth for request/response shapes.
- **Prisma_Schema**: The Prisma data model (`apps/api/prisma/schema.prisma`) targeting SQLite, modeling the architecture §3 entities, Postgres-compatible for a later migration.
- **Demo_User_Header**: The `X-Demo-User` request header resolving the current user in the demo auth seam (`// MOCK`).
- **Current_User**: The `User` resolved from the Demo_User_Header on a request.
- **Level_Gate**: The Level 6 minimum, computed from XP, required to unlock the marketplace (consumed by the downstream `marketplace` spec via `users`/`progression`).
- **Public_Ticket_View**: The ticket response shape from Shared_Contract (`ticket`), which omits `hiddenTestRef` / any hidden-test reference.
- **Hidden_Ticket_Def**: A ticket record in `sim-companies/brightline-hidden/tickets.json` including its server-only `hiddenTestPath`.
- **Grade_Job**: A queued unit of grading work created by a PR submit; processed asynchronously by the Grader_Seam.
- **Grader_Seam**: The `grader` module interface (`grade(request) -> GradeResult`) bridging Core_API to the sandbox runner + reviewer; its Docker runner is owned by the `grader` spec.
- **Grade_Result**: The internal, server-only result of a grade run: hidden-test pass/fail counts, a bounded log excerpt, and an advisory review (summary + `advisoryPass`). Never serialized to a client.
- **Review_Advisory**: The `ai-personas` reviewer output on a graded diff — a structured summary and a pass/fail **advisory** signal that does not by itself decide the attempt.
- **Hint_Persona**: One of the two AI personas a student may ask — `pm` (product framing, clarifies requirements) or `coach` (nudges only).
- **Event_Hub**: The `events` SSE transport that fans server-side domain events (attempt updates, XP, level-ups) out to subscribed clients.
- **Telemetry_Optin**: The `User.telemetryOptIn` boolean gate; telemetry events are recorded only when it is `true`.

## Requirements

### Requirement 1: Feature modules, Prisma persistence, and the canonical error shape

**User Story:** As a backend developer, I want the Core_API organized as thin-route / fat-service feature modules over a Prisma + SQLite data model, so that the architecture's boundaries hold and the data model is faithful and swappable to Postgres later.

#### Acceptance Criteria

1. THE Core_API SHALL place each feature module under `apps/api/src/modules/<name>/` with a thin `routes.ts` (HTTP + zod parsing only), a fat `service.ts` (all business logic), and a `schema.ts` (zod schemas, re-exporting `/packages/shared` where shared), for `users`, `tickets`, `attempts`, `ai-personas`, `progression`, `telemetry`, `events`, and the consumed `grader` seam.
2. THE Prisma_Schema SHALL model the architecture §3 entities relevant to core-api — `User`, `SimCompany`, `Ticket` (with server-only `hiddenTestRef`), `Attempt`, `GradeRun`, `Review`, `Persona`, `HintLog`, `TelemetryEvent` — with the relationships and cardinalities from §3, on SQLite via Prisma, and Postgres-compatible.
3. WHEN any Core_API endpoint returns a non-2xx response, THE Core_API SHALL return a body matching the Shared_Contract error envelope `{ error: { code, message } }` with a stable machine-readable `code` from the contract's `errorCode` enum.
4. THE Core_API SHALL validate every endpoint's request (body and/or path/query) with its Shared_Contract Request_Schema and respond with `400` `validation_error` on a parse failure, making no state change.
5. THE Core_API SHALL serialize every endpoint success body through its Shared_Contract Response_Schema so no response can drift from the contract, and SHALL NOT include `hiddenTestRef` or any hidden-test reference in any response.
6. WHERE a value is produced by a module that another module owns (e.g. XP from `progression`, grade outcome from `grader`), THE module SHALL obtain it from the owning module per the §2 boundaries rather than recomputing it, keeping the inter-module dependency graph acyclic (§2).
7. THE Core_API SHALL read the GitHub PAT and the LLM/Bedrock credentials only from environment variables, SHALL NOT log or return any credential value, and WHEN a required credential is missing at startup for a selected provider THE Core_API SHALL surface an error naming the missing environment variable without printing any secret value.

### Requirement 2: Mocked demo auth and three seeded demo users

**User Story:** As a demo operator, I want the current user resolved from the `X-Demo-User` header against three seeded demo users, so that the full loop can be driven without real authentication.

#### Acceptance Criteria

1. THE `users` module SHALL resolve the Current_User from the Demo_User_Header via a `resolveDemoUser` seam in `users/service.ts` marked `// MOCK`, and SHALL document the production auth-middleware replacement seam per §7.
2. WHEN the Demo_User_Header names an unknown user, THE `users` module SHALL respond `401` with code `unauthorized` and make no state change.
3. THE seed SHALL create a demo user **Maya Chen** at **Level 1**, school **UMass Amherst**.
4. THE seed SHALL create a demo user **Jordan Okafor** at **Level 6**, school **Northeastern**, with `rating` **4.8** and `workAuthorized` **true**.
5. THE seed SHALL create a demo **company admin** user resolvable from the Demo_User_Header for admin/demo operations.
6. THE seeded users' `xp` values SHALL be consistent with their stated `level` under the Requirement 7 level formula (e.g. Maya at Level 1 has `xp` in `[0, 100)`, Jordan at Level 6 has `xp` in `[500, 600)`), so a profile read never shows a level that contradicts its XP.
7. THE `users` module SHALL define `GET /users/me` (returns the Current_User), `GET /users/:id` (returns a user's profile, `404` `not_found` on unknown id), and `PATCH /users/me` (accepts `{ telemetryOptIn }`, returns the updated user) as the only users endpoint that mutates state.

### Requirement 3: Tickets filtered by the user's level

**User Story:** As a student, I want to see only the tickets I'm allowed to work on at my level, so that I pick work appropriate to my progression.

#### Acceptance Criteria

1. THE `tickets` module SHALL load ticket definitions from `sim-companies/brightline-hidden/tickets.json` (Hidden_Ticket_Def records) into the data model on seed, mapping each to a `Ticket` row that carries the server-only hidden-test reference (`hiddenTestRef` from the def's `hiddenTestPath`) and a `simCompanyId`.
2. WHEN `GET /tickets` is called, THE `tickets` module SHALL return the Public_Ticket_View list filtered to the Current_User's level, including only tickets whose `level` is at or below the Current_User's `level`.
3. THE `tickets` module SHALL define `GET /tickets/:id` returning a single Public_Ticket_View, with `404` `not_found` on an unknown id.
4. THE `tickets` module SHALL NOT serialize `hiddenTestRef` or any hidden-test path/content in any response; the Public_Ticket_View response SHALL conform to the Shared_Contract `ticket` schema that omits it.
5. WHERE a Current_User is Level 1, THE `GET /tickets` result SHALL include the Level 1 ticket (`brightline-l1-pagination`) and exclude the Level 2 and Level 3 tickets, so the demo's Maya sees exactly her available work.

### Requirement 4: Attempt lifecycle — start, submit, read

**User Story:** As a student, I want to start an attempt on a ticket, submit my PR for grading, and read my attempt's status, so that I can move through the learning loop.

#### Acceptance Criteria

1. WHEN `POST /attempts` is called with a valid `{ ticketId }` by the Current_User, THE `attempts` module SHALL create an Attempt in status `in_progress` for that user and ticket (with `prUrl: null`, `testRuns: 0`, `reviewRounds: 0`, `hintsUsed: 0`) and return it.
2. WHEN `POST /attempts` references a ticket above the Current_User's level or an unknown ticket, THE `attempts` module SHALL respond with an error envelope (`level_gate` for a too-high level, `not_found` for an unknown id) and create no Attempt.
3. WHEN `POST /attempts/:id/submit` is called with a valid `{ prUrl }`, THE `attempts` module SHALL record the `prUrl`, move the Attempt to status `grading`, enqueue a Grade_Job through the Grader_Seam, and respond **`202 Accepted`** with the updated Attempt (status `grading`).
4. WHEN a submit request omits `prUrl` or supplies a non-URL value, THE `attempts` module SHALL respond `400` `validation_error` and make no state change (no status change, no enqueue).
5. THE `attempts` module SHALL define `GET /attempts/:id` returning the current Attempt and its `status`, `prUrl`, `testRuns`, `reviewRounds`, and `hintsUsed`.
6. THE Attempt status transitions SHALL follow the architecture §5 Attempt state machine: `in_progress → grading` on submit, `grading → passed` or `grading → changes_requested` on grade completion, and `changes_requested → grading` on a re-submit; a submit on a `passed` (terminal) attempt SHALL be rejected with `conflict`.
7. THE submit path SHALL increment `Attempt.testRuns` once per enqueued Grade_Job, so the count reflects how many times grading was triggered.

### Requirement 5: Grading outcome applied asynchronously

**User Story:** As a student, I want my submission graded in the background and my attempt updated with the verdict, so that I pass only when the work is actually correct and get feedback otherwise.

#### Acceptance Criteria

1. THE Grader_Seam SHALL expose a `grade(request)` interface that accepts the repo, the PR ref, the ticket (including its server-only hidden-test reference), and returns a Grade_Result with hidden-test pass/fail counts (`testsPassed`/`testsTotal`), a bounded sanitized `logExcerpt`, and a Review_Advisory (`summary`, `advisoryPass`); its Docker runner is provided by the `grader` spec and selected by env behind this same interface.
2. WHEN a Grade_Job completes, THE `attempts` module SHALL persist a `GradeRun` for the attempt and a `Review` authored by the reviewing `Persona`, then resolve the attempt per criteria 3–4.
3. WHEN all hidden tests pass (`testsPassed === testsTotal` and `testsTotal > 0`) AND the Review_Advisory `advisoryPass` is `true` (APPROVE), THE `attempts` module SHALL move the Attempt to status `passed` and trigger the XP award through `progression` (Requirement 7).
4. WHEN either not all hidden tests pass OR the Review_Advisory is not APPROVE, THE `attempts` module SHALL move the Attempt to status `changes_requested` and increment `Attempt.reviewRounds` by one, and SHALL NOT award XP for that grade run.
5. WHEN grading fails to run or exceeds the sandbox timeout, THE Grader_Seam SHALL return a Grade_Result with `passed: false` and a timeout/error log excerpt, and THE `attempts` module SHALL treat it as `changes_requested` (never `passed`), so a failed run can never pass an attempt.
6. THE Grade_Result and the `GradeRun`/`Review` data exposed to the student SHALL be limited to pass/fail counts and the bounded `logExcerpt`; THE Core_API SHALL NOT serialize hidden-test source or the `hiddenTestRef` in any grade-related response (§6).
7. WHEN a Grade_Job resolves an attempt, THE `attempts` module SHALL publish the corresponding attempt-update event (`passed` or `changes_requested`) through the Event_Hub so a client polling or streaming sees the transition.

### Requirement 6: AI personas — PM clarifies, Coach nudges (and logs)

**User Story:** As a student, I want a PM persona that clarifies requirements and a coach persona that nudges me, without either handing me the solution, so that I learn the real workflow.

#### Acceptance Criteria

1. THE `ai-personas` module SHALL define `POST /ai/pm` and `POST /ai/coach`, each accepting `{ question, attemptId? }` (Shared_Contract `askPersonaRequest`) and returning `{ persona, question, response }` (`askPersonaResponse`), responding `400` `validation_error` on a missing or empty `question`.
2. THE **PM persona** SHALL answer using only the ticket and repo context, clarifying requirements and acceptance criteria, and SHALL NOT provide solution code, diffs, or step-by-step fixes.
3. THE **Coach persona** SHALL provide nudges and guidance only and SHALL NOT provide solution code, diffs, or a complete fix.
4. WHEN the Coach persona answers a question tied to an `attemptId`, THE `ai-personas` module SHALL write a `HintLog` row (persona `coach`, the `question`, the `response`) for that attempt AND increment that Attempt's `hintsUsed` by one.
5. THE `ai-personas` responses SHALL be produced through the existing `LLMProvider` seam (selected by `LLM_PROVIDER`), and SHALL NOT return any hidden-test content, reference solution, or `hiddenTestRef`.
6. WHERE the `LLMProvider` call fails or times out, THE `ai-personas` module SHALL return a clearly-labeled fallback response rather than erroring the request, so a hint request never blocks the loop (§9 Bedrock-latency fallback).

### Requirement 7: Progression — XP, bonuses, penalties, and level

**User Story:** As a student, I want XP awarded for clearing tickets with bonuses for clean solves and penalties for excessive review rounds, so that my level reflects the quality and efficiency of my work.

#### Acceptance Criteria

1. THE `progression` module SHALL own XP math and level computation; no other module SHALL compute XP or level (§2).
2. WHEN an Attempt transitions to `passed`, THE `progression` module SHALL award **100 XP** for clearing the ticket.
3. WHERE the passing Attempt used **zero hints** (`hintsUsed === 0`), THE `progression` module SHALL add a **+25 XP** bonus.
4. WHERE the passing Attempt's `reviewRounds` exceeds **2**, THE `progression` module SHALL subtract **10 XP for each review round beyond 2** (i.e. `-10 * (reviewRounds - 2)`).
5. THE XP awarded for a passing attempt SHALL be `100 + (hintsUsed === 0 ? 25 : 0) - 10 * max(0, reviewRounds - 2)`, and THE resulting total `User.xp` SHALL never go below 0 (the award is clamped so a user's XP is non-negative).
6. THE `progression` module SHALL compute `level = floor(xp / 100) + 1` from the user's total XP, and SHALL persist the updated `xp` and `level` on the user atomically with the award.
7. WHEN an award causes the user's level to increase, THE `progression` module SHALL publish `xp.awarded` and (on a level increase) `level.up` through the Event_Hub; THE Level_Gate check ("is this user Level 6+?") SHALL be answered from the persisted level for the downstream `marketplace` spec.

### Requirement 8: Opt-in telemetry only

**User Story:** As a privacy-conscious user, I want product telemetry recorded only if I have opted in, so that no event is captured about me by default.

#### Acceptance Criteria

1. THE `telemetry` module SHALL record a `TelemetryEvent` for a user **only when** that user's `telemetryOptIn` is `true`.
2. WHEN a telemetry capture is attempted for a user whose `telemetryOptIn` is `false` (the default) or unset, THE `telemetry` module SHALL record nothing for that user and SHALL NOT error the originating request (it is a side channel).
3. THE telemetry opt-in SHALL be toggled through `PATCH /users/me` (`{ telemetryOptIn }`), flipping `User.telemetryOptIn`; opt-in SHALL be off by default.
4. THE recorded `TelemetryEvent` props SHALL be bounded and anonymized and SHALL NOT store PII or any secret, per §6.
5. THE telemetry writes SHALL not block the main request flow (a telemetry failure SHALL not fail the user-facing operation).

### Requirement 9: SSE event hub transport

**User Story:** As a client developer, I want live server events for attempt and progression changes, so that the UI updates as grading completes and XP changes.

#### Acceptance Criteria

1. THE `events` module SHALL expose `GET /events` as a Server-Sent Events endpoint (`text/event-stream`) maintaining per-subscriber connections, and SHALL own transport only (no business logic, §2).
2. THE Event_Hub SHALL accept published domain events from `attempts` (attempt resolved) and `progression` (`xp.awarded`, `level.up`) and fan them out to subscribers.
3. WHERE the downstream `marketplace` spec publishes `job.dropped`, `job.claimed`, and `job.claim_expired`, THE Event_Hub SHALL carry those event names unchanged (contract `sseEventName`), so marketplace can reuse this hub without changing it.
4. THE Event_Hub SHALL serialize each event payload consistently with the Shared_Contract event schemas where one exists.

### Requirement 10: Database seed and the demo loop

**User Story:** As a demo operator, I want a one-command seed and a smoke script that runs the full Maya loop end to end, so that the demo is reproducible.

#### Acceptance Criteria

1. THE seed script SHALL load tickets from `sim-companies/brightline-hidden/tickets.json`, create the one `SimCompany` (Brightline) they belong to, and create the three demo users from Requirement 2 (Maya, Jordan, company admin) with contract-valid, level-consistent fields.
2. THE seed SHALL be runnable with a single command (e.g. `npm run seed`) and SHALL be deterministic (re-running resets to the same known state).
3. THE Core_API SHALL be startable with a single command (e.g. `npm run dev`) against the seeded SQLite database, reading configuration (port, provider, credentials) from the environment.
4. THE `tasks.md` SHALL deliver a curl smoke-test script that runs the full loop **as Maya** (via `X-Demo-User: maya`): start the Level 1 attempt → submit a PR URL → poll `GET /attempts/:id` until it resolves → confirm Maya's XP updated via `GET /users/me`.
5. THE smoke script SHALL assert the observable success criteria (attempt reaches `passed`, and Maya's `xp`/`level` increased per Requirement 7) and exit non-zero if any step fails, so the demo loop is verifiable.
6. THE smoke script SHALL require only the running Core_API (with its selected grader runner and `LLM_PROVIDER`) and `curl` — no manual UI steps.

### Requirement 11: Mocks labeled; real surfaces behind seams

**User Story:** As a reviewer, I want every mock clearly labeled and every real integration behind a swappable seam, so that production implementations drop in without hunting.

#### Acceptance Criteria

1. THE `X-Demo-User` auth resolution SHALL be marked `// MOCK` in `users/service.ts` with the production auth-middleware replacement named (§7).
2. THE Grader_Seam SHALL be a single interface so the real Docker runner (from the `grader` spec) and any fallback subprocess/stub runner are selected by env (`GRADER_RUNNER`) with no change to `attempts` (§9 Docker-unavailable fallback).
3. THE `LLMProvider` seam SHALL be used for all AI calls and selected by `LLM_PROVIDER`, so Gemini/Bedrock/OpenRouter/mock swap without changing `ai-personas`.
4. THE GitHub (Octokit + PAT) interaction for branch/PR, where used by `attempts`, SHALL be isolated behind a seam and SHALL tolerate a manually pasted `prUrl` path so an attempt can be graded from a provided ref if GitHub is unavailable (§9 GitHub fallback).
5. THE core-api spec SHALL NOT implement the `marketplace` module (jobs/claims/escrow/payouts) or the bug-injection hook; those are the downstream `marketplace` and `injection-hook` specs and are out of scope here.
