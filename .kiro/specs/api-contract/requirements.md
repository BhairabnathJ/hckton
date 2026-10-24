# Requirements Document

## Introduction

This feature is build-plan spec #1 (`api-contract`) from `/docs/architecture.md`: the **foundational, dependency-free contract** that every other spec builds against. It defines **every endpoint and every shared type before any implementation exists**, so the `apps/web` UI can build against mocks immediately while the backend is still being written.

It produces exactly three deliverables:

1. **zod schemas and TypeScript types in `/packages/shared`** — the single source of truth for request/response shapes, entity shapes, enums, and the canonical error envelope, re-exported for both API and web.
2. **an OpenAPI 3 file at `/apps/api/openapi.yaml`** — the human- and machine-readable HTTP contract for every endpoint, generated from / kept consistent with the zod schemas.
3. **a mock server runnable with one command (`npm run mock`)** — serving realistic, seeded data for every endpoint and the `/events` SSE stream, so the UI has a working backend to develop against on day one.

This spec is **planning and documentation only** at the requirements/design/tasks stage; implementation (the schemas, the OpenAPI file, and the mock server) happens only after requirements, design, and tasks are approved.

### Authoritative-reference conformance

`/docs/architecture.md` is the authoritative reference. This spec conforms to its data model, module boundaries, state machines, security model (hidden-test isolation, secrets handling, opt-in telemetry), the canonical error shape `{ error: { code, message } }`, and the `api-contract` inputs/outputs in the build plan.

### Conflicts reconciled before approval (per the architecture conflict-and-deviation rule)

The user-provided task specified an entity and endpoint surface that diverged from the condensed model in `/docs/architecture.md` §3. Per the architecture's conflict-and-deviation rule, the architecture was **reconciled first** — `/docs/architecture.md` was updated on **2026-10-24** (see its "Change log (approved deviations)" table) to record each superseded element. The reconciliation decisions this spec now conforms to are:

- **C1 — Attempt status enum (resolved to the architecture).** The Attempt uses the architecture §5 enum: `in_progress | grading | passed | changes_requested | abandoned`. The `grading` state powers the UI's "tests running" timeline. The task's `started`/`submitted` wording maps to `in_progress`/`grading`.
- **C2 — Job status enum (resolved to the task).** The Job uses `open | claimed | submitted | accepted | paid | expired`, plus an `escrowStatus` field on Job valued `funded | released | refunded` (marked `// MOCK`). There is **no separate `EscrowTransaction` entity**.
- **C3 — New entities (partial).** `Company`, `SimCompany`, and `HintLog` are added as entities. `Claim` and `EscrowTransaction` are **not** entities — claim state lives on `Job` (C6) and escrow lives on `Job.escrowStatus` (C2).
- **C4 — User fields (resolved).** `User` is `id, handle, name, school, xp, level, rating, workAuthorized, telemetryOptIn`. The opt-in field is `telemetryOptIn` everywhere (not `optInProfile`).
- **C5 — AI personas (compatible).** `pm` and `coach` are named persona instances; no model change.
- **C6 — Claim + expiry (resolved).** Claim state is `Job.claimedByUserId` and `Job.claimExpiresAt`; there is no `Claim` entity. SSE events are `job.dropped`, `job.claimed`, and `job.claim_expired`.

Every requirement below conforms to these reconciled decisions and to the updated `/docs/architecture.md`.

## Glossary

- **Shared_Package**: The `/packages/shared` workspace holding the zod schemas and inferred TypeScript types imported by both `apps/api` and `apps/web`.
- **Entity_Schema**: A zod schema in Shared_Package describing one domain entity (User, Company, SimCompany, Ticket, Attempt, HintLog, TelemetryEvent, Job).
- **Request_Schema / Response_Schema**: zod schemas for an endpoint's validated request body/params and its response body.
- **Error_Envelope**: The canonical error response shape `{ error: { code, message } }` defined in `/docs/architecture.md`.
- **OpenAPI_File**: The OpenAPI 3 document at `/apps/api/openapi.yaml` describing every endpoint, its parameters, request bodies, responses, and the Error_Envelope.
- **Mock_Server**: A standalone HTTP + SSE server, started by `npm run mock`, that serves seeded data conforming to the Response_Schemas for every endpoint.
- **Seed_Data**: The deterministic, realistic in-memory dataset the Mock_Server returns (users, sim companies, tickets, attempts, jobs, etc.).
- **Demo_User_Header**: The `X-Demo-User` request header that resolves the current user in the mock auth seam (`// MOCK`).
- **Level_Gate**: The Level 6 minimum required to claim marketplace jobs.
- **Public_Ticket_View**: The ticket Response_Schema that **omits** `hiddenTestRef` (and any hidden-test reference), so hidden-test material can never be serialized to a client.
- **SSE_Stream**: The `GET /events` Server-Sent Events endpoint emitting `job.dropped`, `job.claimed`, and `job.claim_expired` events.
- **Hint_Persona**: One of the two AI personas a student can ask — `pm` (product manager framing) or `coach` (engineering coaching).

## Requirements

### Requirement 1: Shared zod schemas and types are the single source of truth

**User Story:** As a web developer, I want every entity and every endpoint shape defined once as zod schemas with inferred types in `/packages/shared`, so that the UI and API share one contract and type errors catch drift.

#### Acceptance Criteria

1. THE Shared_Package SHALL define one Entity_Schema for each of the eight entities: User, Company, SimCompany, Ticket, Attempt, HintLog, TelemetryEvent, and Job.
2. THE Shared_Package SHALL export, for every Entity_Schema, an inferred TypeScript type derived from that zod schema (e.g. via `z.infer`), so the type and the runtime validator cannot diverge.
3. THE Shared_Package SHALL define the Error_Envelope schema exactly as `{ error: { code: string, message: string } }`, matching `/docs/architecture.md`.
4. THE Shared_Package SHALL define, for every endpoint in Requirements 6–13, a Request_Schema for its validated input (body and/or path/query params) and a Response_Schema for its success body.
5. THE Shared_Package SHALL be importable by both `apps/api` and `apps/web` without either importing the other.
6. THE Shared_Package SHALL define each status enum (Attempt status, Job status, Job escrowStatus, Hint_Persona) as a single exported zod enum reused by every schema that references it, so no enum is redefined inline.
7. WHERE a field in an Entity_Schema corresponds to an attribute in the `/docs/architecture.md` §3 data model, THE Entity_Schema SHALL use a value type consistent with that attribute, OR the divergence SHALL be one of the flagged conflicts C1–C6 recorded in the Introduction.

### Requirement 2: Entity schemas match the specified fields

**User Story:** As an API and web developer, I want each entity schema to carry exactly the fields the product needs, so that both sides agree on data shape.

#### Acceptance Criteria

1. THE User Entity_Schema SHALL contain `id`, `handle`, `name`, `school`, `xp`, `level`, `rating`, `workAuthorized` (boolean), and `telemetryOptIn` (boolean).
2. THE Company Entity_Schema SHALL contain `id`, `name`, and `size`.
3. THE SimCompany Entity_Schema SHALL contain `id`, `name`, and `repoTemplateUrl`.
4. THE Ticket Entity_Schema SHALL contain `id`, `simCompanyId`, `level`, `title`, `description`, `acceptanceCriteria`, and `branch`, and SHALL NOT contain `hiddenTestRef` or any hidden-test reference.
5. THE Attempt Entity_Schema SHALL contain `id`, `userId`, `ticketId`, `status`, `prUrl`, `testRuns`, `reviewRounds`, and `hintsUsed`.
6. THE HintLog Entity_Schema SHALL contain `id`, `attemptId`, `persona`, `question`, and `response`, where `persona` is the Hint_Persona enum (`pm` or `coach`).
7. THE TelemetryEvent Entity_Schema SHALL contain `id`, `userId`, `type`, `payload`, and `createdAt`.
8. THE Job Entity_Schema SHALL contain `id`, `companyId`, `title`, `description`, `payCents`, `timeLimitHours`, `minLevel`, `status`, `claimedByUserId`, `claimExpiresAt`, and `escrowStatus`.
9. THE Job `escrowStatus` field SHALL be one of `funded`, `released`, or `refunded`, and SHALL be documented as a mock (`// MOCK`). There SHALL be no separate `EscrowTransaction` entity.
10. THE Job claim state SHALL be represented by `claimedByUserId` (the claiming user, nullable when unclaimed) and `claimExpiresAt` (claim expiry timestamp, nullable when unclaimed). There SHALL be no separate `Claim` entity.
11. THE Attempt status field SHALL accept exactly the values `in_progress`, `grading`, `passed`, `changes_requested`, and `abandoned`, matching the `/docs/architecture.md` §5 Attempt state machine.
12. THE Job status field SHALL accept exactly the values `open`, `claimed`, `submitted`, `accepted`, `paid`, and `expired`, matching the reconciled `/docs/architecture.md` §5 Job state machine.

### Requirement 3: Canonical error envelope on every error

**User Story:** As a web developer, I want every error from every endpoint to use one shape, so that the UI has a single error-handling path.

#### Acceptance Criteria

1. THE OpenAPI_File SHALL declare the Error_Envelope as the response body schema for every documented non-2xx response.
2. WHEN the Mock_Server returns any non-2xx response, THE Mock_Server SHALL return a body matching the Error_Envelope with a machine-readable `code` and a human-readable `message`.
3. THE Error_Envelope `code` SHALL be a stable string identifier (e.g. `not_found`, `validation_error`, `level_gate`, `job_already_claimed`), not a free-form message.
4. THE Error_Envelope SHALL carry no secret material, matching the `/docs/architecture.md` secrets-handling rule.

### Requirement 4: OpenAPI 3 file describes every endpoint

**User Story:** As any consumer of the API, I want one OpenAPI 3 document describing every endpoint, so that I can read the contract and generate clients.

#### Acceptance Criteria

1. THE OpenAPI_File SHALL be a valid OpenAPI 3 document located at `/apps/api/openapi.yaml`.
2. THE OpenAPI_File SHALL document every endpoint defined in Requirements 6–13 with its method, path, parameters, request body (where applicable), and success and error responses.
3. THE OpenAPI_File SHALL reference component schemas that correspond to the Shared_Package Entity_Schemas and Request/Response_Schemas, with no response schema exposing `hiddenTestRef` or any hidden-test reference.
4. THE OpenAPI_File SHALL document the `X-Demo-User` header as the current-user resolution mechanism on endpoints that require a current user, marked as a mock.
5. THE OpenAPI_File SHALL document the `GET /events` SSE endpoint, including its event names `job.dropped`, `job.claimed`, and `job.claim_expired` and the payload schema for each.
6. WHERE the OpenAPI_File and the Shared_Package both describe the same shape, the two SHALL be consistent (the OpenAPI components are derived from or kept in lockstep with the zod schemas).

### Requirement 5: One-command mock server with seeded data

**User Story:** As a web developer, I want to run `npm run mock` and immediately get a server returning realistic data for every endpoint, so that I can build the UI before the real backend exists.

#### Acceptance Criteria

1. THE Mock_Server SHALL start with the single command `npm run mock`.
2. THE Mock_Server SHALL serve an HTTP endpoint for every endpoint defined in Requirements 6–13, returning a body that validates against that endpoint's Response_Schema.
3. THE Mock_Server SHALL serve the `GET /events` SSE_Stream and emit `job.dropped`, `job.claimed`, and `job.claim_expired` events with payloads matching the documented schemas.
4. THE Mock_Server SHALL return deterministic Seed_Data on startup that includes at least: one current demo user at or below Level 6 and one at or above Level 6, at least one Company, at least one SimCompany, at least three Tickets spanning different levels, at least one Attempt, and at least two Jobs.
5. THE Mock_Server SHALL resolve the current user from the Demo_User_Header (`X-Demo-User`), marked `// MOCK`, and default to a seeded demo user when the header is absent.
6. WHEN a request to the Mock_Server fails validation against its Request_Schema, THE Mock_Server SHALL respond with a non-2xx status and an Error_Envelope body with code `validation_error`.
7. THE Mock_Server SHALL NOT require a database, Docker, GitHub, or Bedrock to run.
8. THE Mock_Server SHALL NOT include `hiddenTestRef` or any hidden-test reference in any response.

### Requirement 6: Users endpoints

**User Story:** As a student, I want to read my own profile, view a public profile, and toggle my profile opt-in, so that I control what the marketplace sees.

#### Acceptance Criteria

1. THE contract SHALL define `GET /users/me` returning the current User (resolved from the Demo_User_Header) as a User Response_Schema.
2. THE contract SHALL define `GET /users/:id` returning that user's public profile as a User Response_Schema, excluding fields not intended for public view where the design marks them private.
3. THE contract SHALL define an opt-in update endpoint (`PATCH /users/me` or `PUT /users/me/opt-in`) whose Request_Schema accepts the `telemetryOptIn` boolean and returns the updated User.
4. WHEN `GET /users/:id` is called with an unknown id, THE contract SHALL specify a `404` Error_Envelope with code `not_found`.
5. THE users opt-in endpoint SHALL be the only users endpoint that mutates state, keeping the read endpoints side-effect free.

### Requirement 7: Tickets endpoints

**User Story:** As a student, I want to list the tickets available at my level and read one ticket in detail, so that I can pick work to do.

#### Acceptance Criteria

1. THE contract SHALL define `GET /tickets` returning a list of Public_Ticket_View objects filtered to the current user's level.
2. THE contract SHALL define `GET /tickets/:id` returning a single Public_Ticket_View.
3. THE Public_Ticket_View Response_Schema SHALL omit `hiddenTestRef` and any hidden-test reference, so hidden-test material is never serialized.
4. WHEN `GET /tickets/:id` is called with an unknown id, THE contract SHALL specify a `404` Error_Envelope with code `not_found`.
5. THE `GET /tickets` filtering SHALL be expressed against the current user's `level` so that only tickets at or below (or matching, per design) the user's level are returned.

### Requirement 8: Attempts endpoints

**User Story:** As a student, I want to start an attempt on a ticket, submit my PR, and check my attempt status, so that I can progress through the learning loop.

#### Acceptance Criteria

1. THE contract SHALL define `POST /attempts` whose Request_Schema accepts a `ticketId` and returns a new Attempt in status `in_progress`.
2. THE contract SHALL define a submit endpoint (`POST /attempts/:id/submit`) whose Request_Schema accepts `{ prUrl }` and returns the updated Attempt (status `grading`).
3. THE contract SHALL define `GET /attempts/:id` returning the current Attempt and its status.
4. THE Attempt Response_Schema SHALL expose `status`, `prUrl`, `testRuns`, `reviewRounds`, and `hintsUsed`.
5. WHEN a submit request body omits `prUrl` or supplies a non-URL value, THE contract SHALL specify a `validation_error` Error_Envelope and no state change.
6. THE Attempt status transitions implied by these endpoints SHALL be consistent with the `/docs/architecture.md` §5 Attempt state machine (`in_progress → grading → passed | changes_requested`, C1).

### Requirement 9: AI persona endpoints

**User Story:** As a student, I want to ask the PM persona and the coach persona questions, so that I get product framing and engineering coaching while I work.

#### Acceptance Criteria

1. THE contract SHALL define an endpoint to ask the `pm` persona (e.g. `POST /ai/pm`) whose Request_Schema accepts a `question` (and optionally an `attemptId`) and returns a `response`.
2. THE contract SHALL define an endpoint to ask the `coach` persona (e.g. `POST /ai/coach`) with the same Request/Response shape.
3. THE AI Response_Schema SHALL carry the persona, the question, and the response text, aligning with the HintLog Entity_Schema fields.
4. WHEN an AI request omits `question` or sends an empty question, THE contract SHALL specify a `validation_error` Error_Envelope.
5. THE AI endpoints SHALL NOT return any hidden-test content, reference solution, or `hiddenTestRef`.

### Requirement 10: Jobs endpoints (marketplace)

**User Story:** As a Level 6+ student, I want to list jobs, claim one first-come-first-serve, submit my work, and have it accepted, so that I can earn from the marketplace.

#### Acceptance Criteria

1. THE contract SHALL define `GET /jobs` returning a list of Job Response_Schema objects.
2. THE contract SHALL define `POST /jobs` (post a job) whose Request_Schema accepts `companyId`, `title`, `description`, `payCents`, `timeLimitHours`, and `minLevel`, returning the created Job.
3. THE contract SHALL define `POST /jobs/:id/claim` returning the claimed Job (with `claimedByUserId` and `claimExpiresAt` set), gated behind the Level_Gate.
4. THE contract SHALL define `POST /jobs/:id/submit` whose Request_Schema accepts `{ prUrl }` and returns the updated Job.
5. THE contract SHALL define `POST /jobs/:id/accept` returning the accepted Job, triggering the mock escrow release.
6. WHEN a user below the Level_Gate calls `POST /jobs/:id/claim`, THE contract SHALL specify a `403` Error_Envelope with code `level_gate`.
7. WHEN two users race to claim the same job, THE contract SHALL specify that exactly one succeeds and the loser receives `409` with code `job_already_claimed`, matching the architecture's FCFS fallback.
8. THE job accept flow SHALL be the point at which the mock `Job.escrowStatus` transitions to `released` (and the Job status moves `accepted → paid` on mock payout), marked `// MOCK`.

### Requirement 11: Admin endpoint to drop a demo job

**User Story:** As a demo operator, I want to drop a demo job on demand, so that I can trigger the live marketplace flow during the demo.

#### Acceptance Criteria

1. THE contract SHALL define an admin endpoint (e.g. `POST /admin/jobs/drop`) that creates and publishes a demo Job.
2. WHEN the admin drop endpoint is called, THE contract SHALL specify that a `job.dropped` event is emitted on the SSE_Stream.
3. THE admin drop endpoint SHALL return the created Job in its initial status (`open`).
4. THE admin drop endpoint SHALL be documented as a demo-only operation.

### Requirement 12: SSE events stream

**User Story:** As a web developer, I want a single SSE stream of marketplace events, so that the UI updates live as jobs drop, get claimed, and expire.

#### Acceptance Criteria

1. THE contract SHALL define `GET /events` as a Server-Sent Events endpoint.
2. THE SSE_Stream SHALL emit a `job.dropped` event when a job is dropped, with a payload carrying the Job.
3. THE SSE_Stream SHALL emit a `job.claimed` event when a job is claimed, with a payload identifying the Job and claiming user.
4. THE SSE_Stream SHALL emit a `job.claim_expired` event when a claim expires, with a payload identifying the Job (mapping to the architecture Job `claimed --> expired` transition).
5. THE Shared_Package SHALL define a Response_Schema for each SSE event payload, reused by the OpenAPI_File and the Mock_Server.

### Requirement 13: Mock boundaries are labeled and isolated

**User Story:** As a reviewer, I want every mock in the contract clearly labeled, so that the real implementations can be swapped in later without hunting for them.

#### Acceptance Criteria

1. THE Job `escrowStatus` field and every escrow/payout path in the Mock_Server SHALL be marked `// MOCK`.
2. THE Demo_User_Header (`X-Demo-User`) auth resolution SHALL be marked `// MOCK` in the Mock_Server and documented as a mock in the OpenAPI_File.
3. THE contract SHALL NOT expose real payment, real auth, Docker, GitHub, or Bedrock surfaces as part of this spec.
4. WHERE a capability is mocked (auth, escrow, payouts), THE documentation SHALL name the production replacement seam consistent with `/docs/architecture.md` §7.
