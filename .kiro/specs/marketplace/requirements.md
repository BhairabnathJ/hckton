# Requirements Document

## Introduction

This feature is build-plan spec #5 (`marketplace`) from `/docs/architecture.md`: the module that owns **job drops, claims, submissions, acceptance, and mock escrow** for the SideQuest paid job marketplace that Level 6+ students unlock. It implements the real HTTP + SSE surface that `api-contract` (spec #1) already defined in `/packages/shared`, living in `apps/api/src/modules/marketplace/`.

It produces the live, demoable marketplace flow for the hackathon video:

1. A **demo operator** drops a job on demand (`POST /admin/jobs/drop-demo`).
2. **Two Level 6+ students race to claim it** at the same instant, and **exactly one wins** — the claim is a single atomic conditional database update, so a job can never be double-claimed.
3. The **`/events` SSE stream** fans out `job.dropped`, `job.claimed`, and `job.claim_expired` live so the UI reacts in real time.

This spec is **planning and documentation only** at the requirements/design/tasks stage. Implementation (the module code, the Prisma models, and the smoke test) happens only after requirements, design, and tasks are approved, per the plan-first workflow.

### Authoritative-reference conformance

`/docs/architecture.md` is the authoritative reference. This spec conforms to its:

- **Module boundaries (§2):** `marketplace` owns job drop/claim/submit/accept and mock escrow; it reads the Level 6 gate from `users`/`progression` and publishes `job.*` events to the `events` hub. It does **not** own real payments (Stripe escrow + payouts are `// MOCK`) and does not compute the level used by its own gate.
- **Data model (§3):** claim state lives on `Job.claimedByUserId` + `Job.claimExpiresAt` (no `Claim` entity); escrow lives on `Job.escrowStatus` valued `funded|released|refunded` (`// MOCK`, no `EscrowTransaction` entity); `Job` carries `droppedAt`. `User` carries `rating` and `workAuthorized`.
- **State machine (§5):** `open → claimed → submitted → accepted → paid`, with `claimed → open` on release and `claimed → expired` on expiry; `job.dropped` published on entry to `open`, `job.claimed` on claim, `job.claim_expired` on `claimed → expired`.
- **Security model (§6):** errors use `{ error: { code, message } }`; no secret material in responses; the `X-Demo-User` auth seam is `// MOCK`.
- **Mocks (§7):** escrow release and payout are `// MOCK`, swappable behind a single `PaymentProvider` interface; `marketplace.service` and its routes do not change when the mocks are replaced.
- **Risk register (§9):** the FCFS claim race is mitigated by a **single conditional DB update** — exactly one claimant wins and concurrent losers receive HTTP `409` with code `job_already_claimed`.

### Relationship to `api-contract` (spec #1)

The request/response shapes, the `Job` entity schema, the SSE event payloads, the error envelope, and the shared enums are already defined in `/packages/shared` by `api-contract` and are **reused verbatim** here — this spec does not redefine them. The one naming reconciliation below aligns the admin endpoint with the user-facing demo requirement.

### Conflicts reconciled before approval (per the architecture conflict-and-deviation rule)

The task introduces marketplace business rules that are **additive** — none contradicts an element **defined in** `/docs/architecture.md`, so no architecture-document change is required. They are recorded here as marketplace-owned policy because §2 assigns job claim/accept/escrow ownership to this module:

- **M1 — Admin demo-drop path.** `api-contract`'s design named the demo-drop endpoint `POST /admin/jobs/drop`; the task names it `POST /admin/jobs/drop-demo`. This spec implements **`POST /admin/jobs/drop-demo`** and reuses the api-contract `dropDemoJobResponse` (the `Job` schema) verbatim. This is a path label on a demo-only endpoint, not an element defined in the authoritative architecture document, so it is reconciled at the spec level. The demo job is fixed at **$75 (`payCents: 7500`)**, **4 hours (`timeLimitHours: 4`)**, `minLevel: 6`, status `open`, `escrowStatus: funded`.
- **M2 — Max 2 active claims per user.** An additive per-user concurrency cap not mentioned in §3/§5. It gates the claim transition and introduces no new entity or state.
- **M3 — Early access for high-rated users.** Users with `rating >= 4.5` may claim a newly dropped job during a **10-minute head-start window** before other eligible users. Uses the existing `User.rating` (§3) and `Job.droppedAt` (§3); introduces no new entity or state.
- **M4 — Payout blocked unless `workAuthorized`.** The mock payout step (`accepted → paid`) is gated on the claimant's `User.workAuthorized === true` (§3). Escrow release (`funded → released`) still occurs on accept; only the payout/`paid` transition is blocked when the claimant is not work-authorized. Additive gate on the mock payout path.
- **M5 — Background claim-expiry sweep.** A sweep running every **30 seconds** finds claims whose `claimExpiresAt` has passed, returns each such job to `open` by the architecture `claimed → open`/`claimed → expired` transition, sets escrow `funded → refunded` (`// MOCK`), and publishes `job.claim_expired`. The 30 s cadence is an implementation detail of the architecture's claim-timeout transition, not a contradiction of it.

Every requirement below conforms to these reconciled decisions and to `/docs/architecture.md`.

## Glossary

- **Marketplace_Module**: The `apps/api/src/modules/marketplace/` module with `routes.ts` (thin HTTP + zod parsing), `service.ts` (all business logic), and `schema.ts` (re-exporting shared schemas), per §2 and the `structure` steering rule.
- **Job**: The marketplace job entity defined in `/packages/shared` (`Job` schema) and persisted via Prisma; claim and escrow state are fields on it.
- **Level_Gate**: The Level 6 minimum (`Job.minLevel` is 6 for marketplace jobs) required to claim a job, read from `users`/`progression`.
- **Atomic_Claim**: A single conditional database write (`UPDATE ... WHERE id = ? AND status = 'open'`) that transitions a job `open → claimed`; it succeeds for at most one concurrent caller.
- **Claim_Window**: The interval `[claimedAt, claimExpiresAt]` during which the claimant holds the job; `claimExpiresAt = claimedAt + timeLimitHours`.
- **Active_Claim**: A job currently held by a user in status `claimed` or `submitted` (claimed but not yet terminal/released).
- **Max_Active_Claims**: The per-user cap of **2** Active_Claims (M2).
- **Early_Access_Window**: The first **10 minutes** after `Job.droppedAt` during which only users with `rating >= 4.5` may claim the job (M3).
- **Expiry_Sweep**: The background task that runs every **30 seconds**, expiring Claim_Windows whose `claimExpiresAt` has passed (M5).
- **Escrow_Status**: The `Job.escrowStatus` mock field valued `funded | released | refunded` (`// MOCK`).
- **Payment_Provider**: The single interface (`PaymentProvider`) behind which the mock escrow release and payout live, so production Stripe/payout swaps in without changing `service.ts` or routes (§7).
- **Work_Authorized**: The claimant's `User.workAuthorized` boolean gating the mock payout (M4).
- **SSE_Hub**: The `events` module SSE transport (`GET /events`) that fans `job.dropped`, `job.claimed`, and `job.claim_expired` to subscribers (§2).
- **Error_Envelope**: The canonical `{ error: { code, message } }` response shape (§6).

## Requirements

### Requirement 1: Jobs endpoints implement the api-contract surface

**User Story:** As a web developer, I want the real marketplace endpoints to match the contract already in `/packages/shared`, so that the UI built against the mock works unchanged against the live API.

#### Acceptance Criteria

1. THE Marketplace_Module SHALL implement `GET /jobs` returning a list validated against the shared `jobsEndpoints.listJobsResponse`.
2. THE Marketplace_Module SHALL implement `POST /jobs` accepting `jobsEndpoints.postJobRequest` and returning `jobsEndpoints.postJobResponse` (a `Job` in status `open`).
3. THE Marketplace_Module SHALL implement `POST /jobs/:id/claim` returning `jobsEndpoints.claimJobResponse` (a `Job` in status `claimed` with `claimedByUserId` and `claimExpiresAt` set).
4. THE Marketplace_Module SHALL implement `POST /jobs/:id/submit` accepting `jobsEndpoints.submitJobRequest` (`{ prUrl }`) and returning `jobsEndpoints.submitJobResponse` (a `Job` in status `submitted`).
5. THE Marketplace_Module SHALL implement `POST /jobs/:id/accept` returning `jobsEndpoints.acceptJobResponse`.
6. THE Marketplace_Module SHALL validate every request body/params with the shared zod Request_Schema and return `400` `{ error: { code: "validation_error", message } }` on failure, with no state change.
7. THE Marketplace_Module SHALL keep `routes.ts` thin (HTTP + zod parsing only) and place all business logic in `service.ts`, per the `structure` steering rule and §2.
8. THE Marketplace_Module SHALL NOT redefine any entity, enum, error, or SSE schema already exported by `/packages/shared`; it SHALL import and reuse them.

### Requirement 2: Posting a job funds a mock escrow

**User Story:** As a company posting a job, I want posting to fund escrow, so that a claimant knows the money is set aside before they start.

#### Acceptance Criteria

1. WHEN `POST /jobs` succeeds, THE Marketplace_Module SHALL create the `Job` in status `open` with `escrowStatus = "funded"`, marked `// MOCK`.
2. THE escrow funding SHALL go through the Payment_Provider seam (`PaymentProvider.fundEscrow(jobId)` or equivalent), marked `// MOCK`, so a real Stripe Connect escrow replaces it without changing `service.ts` or routes (§7).
3. WHEN a new `open` job is created, THE Marketplace_Module SHALL set `Job.droppedAt` to the creation time and publish `job.dropped` on the SSE_Hub carrying the `Job`.
4. THE created `Job` SHALL have `claimedByUserId = null` and `claimExpiresAt = null`.

### Requirement 3: Claiming is an atomic, race-safe conditional update

**User Story:** As a Level 6+ student, I want claiming a job to be first-come-first-serve and race-safe, so that two of us can never both claim the same job.

#### Acceptance Criteria

1. THE claim SHALL be performed as a single Atomic_Claim conditional update (`UPDATE Job SET status='claimed', claimedByUserId=?, claimExpiresAt=? WHERE id=? AND status='open'`), such that at most one concurrent caller's update affects a row.
2. WHEN two or more users call `POST /jobs/:id/claim` for the same `open` job concurrently, THE Marketplace_Module SHALL allow exactly one to succeed (`200` with the claimed `Job`) and SHALL return `409` `{ error: { code: "job_already_claimed", message } }` to every other caller, matching the §9 FCFS fallback.
3. WHEN a claim succeeds, THE Marketplace_Module SHALL set `claimExpiresAt = now + timeLimitHours` and publish `job.claimed` on the SSE_Hub with the `Job` and `claimedByUserId`.
4. WHEN `POST /jobs/:id/claim` targets an unknown job id, THE Marketplace_Module SHALL return `404` `{ error: { code: "not_found", message } }`.
5. THE claim SHALL NOT read-then-write across two statements in a way that could let two readers both observe `open`; correctness SHALL rest on the conditional update's `WHERE status='open'` clause (or an equivalent single-statement guarantee).

### Requirement 4: Claim eligibility gates

**User Story:** As the marketplace, I want claims gated by level, early-access, and a per-user cap, so that only eligible students claim and no one hoards jobs.

#### Acceptance Criteria

1. WHEN a user below the Level_Gate (level < 6) calls `POST /jobs/:id/claim`, THE Marketplace_Module SHALL return `403` `{ error: { code: "level_gate", message } }` and SHALL NOT claim the job. The level SHALL be read from `users`/`progression`, not computed in `marketplace`.
2. WHEN a user whose rating is below 4.5 calls `POST /jobs/:id/claim` within the Early_Access_Window (within 10 minutes of `Job.droppedAt`), THE Marketplace_Module SHALL refuse the claim with `403` `{ error: { code: "level_gate", message } }` (early-access not yet open to them) and SHALL NOT claim the job.
3. WHEN a user with `rating >= 4.5` claims within the Early_Access_Window, THE Marketplace_Module SHALL permit the claim (subject to the other gates).
4. WHEN the Early_Access_Window has elapsed (more than 10 minutes after `droppedAt`), THE Marketplace_Module SHALL permit claims from any Level 6+ user regardless of rating.
5. WHEN a user who already holds Max_Active_Claims (2) Active_Claims calls `POST /jobs/:id/claim`, THE Marketplace_Module SHALL refuse with `409` `{ error: { code: "conflict", message } }` and SHALL NOT claim the job.
6. THE eligibility gates SHALL be evaluated such that an ineligible caller never wins the Atomic_Claim (the gate checks precede or are combined with the conditional update so an ineligible user cannot claim even under a race).

### Requirement 5: Claim expiry returns jobs to the pool

**User Story:** As the marketplace, I want expired claims to free the job automatically, so that a job abandoned mid-claim becomes available again and the UI shows it live.

#### Acceptance Criteria

1. THE Marketplace_Module SHALL run an Expiry_Sweep every 30 seconds that selects jobs in status `claimed` whose `claimExpiresAt <= now`.
2. WHEN the Expiry_Sweep finds an expired claim, THE Marketplace_Module SHALL transition the job per the §5 state machine and publish `job.claim_expired` on the SSE_Hub carrying the `Job`.
3. WHEN a claim expires, THE Marketplace_Module SHALL set `escrowStatus = "refunded"` through the Payment_Provider seam, marked `// MOCK` (§5: `funded → refunded` on expiry).
4. THE Expiry_Sweep transition SHALL itself be race-safe (a conditional update guarded on the job still being `claimed` with the same claimant/expiry), so a claim that is submitted or released in the same instant is not wrongly expired.
5. THE Expiry_Sweep SHALL be startable and stoppable so tests can trigger a single sweep deterministically rather than waiting 30 seconds.

### Requirement 6: Submission and acceptance

**User Story:** As a claimant, I want to submit my PR and have it accepted, so that escrow releases and I get paid.

#### Acceptance Criteria

1. WHEN the claimant calls `POST /jobs/:id/submit` with a valid `{ prUrl }` on a job they hold in status `claimed`, THE Marketplace_Module SHALL transition the job to `submitted` and return the updated `Job`.
2. WHEN `POST /jobs/:id/submit` targets a job not in status `claimed`, THE Marketplace_Module SHALL return `409` `{ error: { code: "conflict", message } }` and SHALL NOT change state.
3. WHEN `POST /jobs/:id/accept` is called on a job in status `submitted`, THE Marketplace_Module SHALL release escrow (`escrowStatus funded → released`) through the Payment_Provider seam, marked `// MOCK`, moving the job to `accepted`.
4. WHEN `POST /jobs/:id/accept` targets a job not in status `submitted`, THE Marketplace_Module SHALL return `409` `{ error: { code: "conflict", message } }` and SHALL NOT change state.
5. THE accept flow SHALL publish the internal `job.accepted` / `escrow.released` signals server-side (consumed internally; not fanned out on the live SSE stream, per the §5 change log).

### Requirement 7: Payout is blocked unless the claimant is work-authorized

**User Story:** As the platform, I want payout blocked for students who are not work-authorized, so that we never disburse funds to an unauthorized worker.

#### Acceptance Criteria

1. WHEN a job reaches `accepted` AND the claimant's `User.workAuthorized === true`, THE Marketplace_Module SHALL trigger the mock payout through `PaymentProvider.payout(jobId)` (marked `// MOCK`) and transition the job `accepted → paid`.
2. WHEN a job reaches `accepted` AND the claimant's `User.workAuthorized === false`, THE Marketplace_Module SHALL NOT trigger payout and SHALL NOT transition the job to `paid`; the job SHALL remain in `accepted` with `escrowStatus = "released"`.
3. WHEN payout is blocked for lack of work authorization, THE Marketplace_Module SHALL surface a `409` `{ error: { code: "conflict", message } }` naming the missing work authorization (without exposing any PII beyond the authorization state) OR SHALL return the `accepted` job unchanged with an indication that payout is pending authorization — the design SHALL pick exactly one and document it.
4. THE escrow release (Requirement 6.3) SHALL occur independently of the work-authorization gate; only the payout/`paid` transition SHALL be gated by Work_Authorized.

### Requirement 8: Admin demo-drop endpoint

**User Story:** As a demo operator, I want to drop a $75 / 4-hour demo job instantly, so that I can trigger the live marketplace flow during the video.

#### Acceptance Criteria

1. THE Marketplace_Module SHALL implement `POST /admin/jobs/drop-demo` that creates and persists a demo `Job` with `payCents = 7500`, `timeLimitHours = 4`, `minLevel = 6`, status `open`, and `escrowStatus = "funded"` (`// MOCK`).
2. WHEN `POST /admin/jobs/drop-demo` succeeds, THE Marketplace_Module SHALL set `droppedAt = now`, publish `job.dropped` on the SSE_Hub, and return `201` with the created `Job` validated against the shared `adminEndpoints.dropDemoJobResponse` schema.
3. THE demo-drop endpoint SHALL be documented and labeled as a demo-only operation.
4. THE demo-drop SHALL go through the same creation path (and Payment_Provider escrow funding) as `POST /jobs`, so the demo job is indistinguishable from a normally posted job apart from its fixed fields.

### Requirement 9: SSE stream fans out the three marketplace events

**User Story:** As a web developer, I want the `/events` stream to push drop, claim, and expiry events, so that the UI updates live during the demo.

#### Acceptance Criteria

1. THE Marketplace_Module SHALL publish `job.dropped` (payload = the `Job`) to the SSE_Hub whenever a job enters `open` (via `POST /jobs` or `POST /admin/jobs/drop-demo`).
2. THE Marketplace_Module SHALL publish `job.claimed` (payload = the `Job` + `claimedByUserId`) to the SSE_Hub on a successful claim.
3. THE Marketplace_Module SHALL publish `job.claim_expired` (payload = the `Job`, status `expired`) to the SSE_Hub when the Expiry_Sweep expires a claim.
4. THE three event payloads SHALL match the shared `events.ts` schemas (`jobDroppedPayload`, `jobClaimedPayload`, `jobClaimExpiredPayload`) exactly.
5. THE Marketplace_Module SHALL publish events through the `events` SSE_Hub transport (§2) and SHALL NOT embed its own SSE transport, so `events` remains the sole owner of client connections.

### Requirement 10: Mock boundaries are labeled and isolated behind one interface

**User Story:** As a reviewer, I want every escrow and payout mock clearly labeled behind one seam, so that real Stripe/payouts swap in without touching marketplace logic.

#### Acceptance Criteria

1. THE escrow funding, escrow release, escrow refund, and payout SHALL each be marked `// MOCK` at the call site in `service.ts`.
2. THE four mock money operations SHALL be reached only through the single Payment_Provider interface (`fundEscrow`, `releaseEscrow`, `refundEscrow`, `payout`), so `marketplace.service` never mutates `Job.escrowStatus` for a real-money reason except as the local mock implementation of that interface (§7 seam preservation).
3. THE Marketplace_Module SHALL NOT call real Stripe, real payout, GitHub, or Bedrock surfaces.
4. THE Marketplace_Module documentation SHALL name the production replacement (Stripe Connect escrow + real payout provider behind `PaymentProvider`, §7) for each mock.
5. THE error responses from every endpoint SHALL use the Error_Envelope and SHALL carry no secret material (§6).

### Requirement 11: Live smoke test proves the race and the events

**User Story:** As a demo operator, I want a runnable smoke test that proves the claim race and the SSE events, so that I can trust the live demo before recording.

#### Acceptance Criteria

1. THE smoke test SHALL drop a demo job via `POST /admin/jobs/drop-demo` and assert it is created in status `open` with `payCents = 7500` and `timeLimitHours = 4`.
2. THE smoke test SHALL have two Level 6+ users call `POST /jobs/:id/claim` for the same job concurrently (fired as close to simultaneously as possible) and SHALL assert exactly one receives `200` (claimed) and the other receives `409` with code `job_already_claimed`.
3. THE smoke test SHALL subscribe to `GET /events` and assert that `job.dropped` and `job.claimed` events fire with payloads matching the shared schemas, and (by forcing a sweep on an expired claim) that `job.claim_expired` fires.
4. THE smoke test SHALL be runnable with a single command and SHALL exit non-zero if any assertion fails.
