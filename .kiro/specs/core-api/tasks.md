# Implementation Plan: core-api (Option B — demo-critical path)

## Approval

> **Approval note — 60 minutes.** This plan is scoped to a **60-minute** implementation budget (half of the `/docs/architecture.md` §8 core-api estimate of 2.5 h, co-owned by Person A and Person C at 1.25 h each). `[CUTTABLE]` tasks may be dropped to stay within the 60-minute budget; the running sum assumes all non-cuttable tasks run. Approve this tasks list to proceed to implementation.

> **Run all tasks.** On approval, run all tasks in order without stopping for per-task confirmation, pausing only if a task is blocked (missing credential, subprocess/python unavailable) or a verification step fails.

## Option B decisions (baked into every task)

- **Synchronous grading.** `POST /attempts/:id/submit` grades inline and returns the resolved attempt (status `202` per contract). **No job queue** is built.
- **Grader is the already-built `/grader` module (ADJUSTED).** The real `GraderRunner` is a **thin adapter** (`GraderModuleRunner`) that calls the committed `@sidequest/grader` module's `grade()` — core-api does NOT reimplement a runner, reviewer, clone, or GitHub comment posting. The offline `DemoRunner` remains selectable via `GRADER_RUNNER=demo`; `subprocess`/`docker` route to the real grader (which uses that same value for its own sandbox).
- **Live Gemini reviewer, not mock.** `LLM_PROVIDER=gemini`, `GEMINI_MODEL=gemini-3.8-flash`.
- **`.env` is operator-managed.** `GITHUB_TOKEN` and `GEMINI_API_KEY` are set by the operator; **never create or edit `.env`**. `gh` authenticates via the `.env` `GITHUB_TOKEN` (exported as `GH_TOKEN`).
- **`*` tests deferred.** Optional unit/contract checks are dropped from the critical path; the end-to-end smoke test + the GitHub wrong-fix proof are the verification.
- **Docker (task 11) skipped** unless everything else passed (it did; subprocess carries the demo).
- **New:** `POST /admin/tickets/reload` implemented for real (Prisma upsert from `brightline-hidden/tickets.json`, admin demo handle only).

## Total Estimate: 60 minutes

## Overview

Build order: data model → foundational modules (`users`, `tickets`, `events`) → grader subprocess seam → `ai-personas` (live Gemini) → `progression` → `attempts` (synchronous submit) → `telemetry` → seed + Maya smoke test → GitHub wrong-fix proof. Docker runner last and cuttable. Routes stay thin; services hold the logic; every response is parsed through `/packages/shared`; every mock seam is marked `// MOCK`. Conforms to the reconciled `/docs/architecture.md` and the frozen `/packages/shared` contract (`telemetryOptIn`, `status`, `testRuns`/`reviewRounds`/`hintsUsed`). Consumes only `api-contract` and the `grader` seam; `marketplace`/`injection-hook` are out of scope.

## Tasks

- [x] 1. Data model + app skeleton + error envelope (9 min)
  - [x] 1.1 Prisma schema over SQLite (4 min)
    - Add `prisma` + `@prisma/client`; `apps/api/prisma/schema.prisma` with the SQLite datasource and the design models (`User`, `SimCompany`, `Ticket` with server-only `hiddenTestRef`, `Attempt`, `GradeRun`, `Persona`, `Review`, `HintLog`, `TelemetryEvent`); enums/JSON as `String` (Postgres-compatible); `apps/api/src/db.ts` PrismaClient singleton; `prisma:generate`/`prisma:push` scripts; do NOT model `Company`/`Job`/`Submission`
    - _Requirements: 1.1, 1.2, 11.5_
  - [x] 1.2 Express app, env check, canonical error middleware (5 min)
    - `src/env.ts` (read env; startup check names any missing credential for the selected provider without printing it; never create/edit `.env`); `src/http/error.ts` (`AppError` + middleware → `{ error: { code, message } }` per the design mapping); `src/http/validate.ts` (zod `safeParse` → `400 validation_error`); `src/app.ts` mounts routers + error middleware; `src/server.ts` (`npm run dev`)
    - _Requirements: 1.3, 1.4, 1.5, 1.7_

- [x] 2. users module — `// MOCK` auth, profiles, opt-in, Level 6 gate (7 min)
  - [x] 2.1 resolveDemoUser seam + current-user middleware (3 min)
    - `modules/users/service.ts` `resolveDemoUser(handle)` marked `// MOCK` (unknown handle → `unauthorized`; names the production auth-middleware replacement, §7); middleware attaches `Current_User` to `req`
    - _Requirements: 2.1, 2.2, 11.1_
  - [x] 2.2 Routes + opt-in + gate (4 min)
    - `GET /users/me`, `GET /users/:id` (`404 not_found`), `PATCH /users/me` `{ telemetryOptIn }` (only mutating users route); `service.isLevel6OrAbove(userId)` reads persisted level; responses parsed through contract `user`
    - _Requirements: 2.7, 7.7, 8.3_

- [x] 3. tickets module — level-filtered public view (5 min)
  - [x] 3.1 toPublicTicket mapper + routes (5 min)
    - `modules/tickets/service.ts`: `listForUser(user)` returns tickets where `level <= user.level`; `getPublic(id)` (`404`); single `toPublicTicket` mapper strips `hiddenTestRef`/`repo`/`difficulty`/`xpReward`, JSON-parses `acceptanceCriteria`; `GET /tickets`, `GET /tickets/:id` parsed through contract `ticket`; Level 1 user sees only `brightline-l1-pagination`
    - _Requirements: 3.2, 3.3, 3.4, 3.5_

- [x] 4. events hub + grader subprocess seam + ai-personas (14 min)
  - [x] 4.1 events SSE hub (3 min)
    - `modules/events/{routes,service}.ts`: `GET /events` (`text/event-stream`, per-subscriber registration, heartbeat, cleanup); `publish(event)` fans out; accepts `attempt.*`/`xp.awarded`/`level.up` and carries `job.*` names unchanged for marketplace; job payloads follow contract `sseEvent`
    - _Requirements: 9.1, 9.2, 9.3, 9.4_
  - [x] 4.2 grader seam + SubprocessRunner (6 min)
    - `modules/grader/{types,runner,service}.ts`: internal `GradeRequest`/`GradeResult`/`GraderRunner` (server-only; never serialized); `runner.ts` selects by `GRADER_RUNNER`, default **`subprocess`** → `SubprocessRunner` checks out the PR ref (GitHub seam), runs the ticket's `hiddenTestRef` tests in a local Python subprocess with best-effort caps + 60 s timeout, parses pytest into `testsPassed`/`testsTotal` + bounded sanitized `logExcerpt`; `service.grade()` is a thin pass-through that attaches the `ai-personas` advisory; grader NEVER writes the DB; timeout/error → `passed:false`
    - _Requirements: 5.1, 5.5, 5.6, 11.2_
  - [x] 4.3 ai-personas — PM clarifies, Coach nudges + logs (live Gemini) (5 min)
    - `modules/ai-personas/{routes,service,schema}.ts`: `POST /ai/pm`, `POST /ai/coach` (`askPersonaRequest` → `askPersonaResponse`, `400` on empty question); PM answers only from ticket+repo context, no solutions; Coach nudges only; Coach with `attemptId` writes a `HintLog` and `attempt.hintsUsed++` in one transaction; all via `createLLMProvider()` with `LLM_PROVIDER=gemini` + `GEMINI_MODEL=gemini-3.8-flash` (not mock); labeled fallback on provider error; never emit hidden-test/solution content
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 11.3_

- [x] 5. progression — XP math, bonuses, penalties, level (5 min)
  - [x] 5.1 awardForAttempt + level + events (5 min)
    - `modules/progression/service.ts`: `delta = 100 + (hintsUsed===0 ? 25 : 0) - 10*max(0, reviewRounds-2)`; `xp = max(0, xp+delta)`; `level = floor(xp/100)+1`; persist `{xp, level}` atomically; publish `xp.awarded` and (on level increase) `level.up`; `isLevel6OrAbove` reads persisted level; no other module does this math
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

- [x] 6. attempts — lifecycle + synchronous submit (9 min)
  - [x] 6.1 Start + get (3 min)
    - `modules/attempts/{routes,service,schema}.ts`: `POST /attempts` (`level_gate` if ticket above level, `not_found` if unknown; creates `in_progress`, counters 0; branch via GitHub seam, null-tolerant per §9); `GET /attempts/:id`; responses parsed through contract `attempt`
    - _Requirements: 4.1, 4.2, 4.5, 4.6, 11.4_
  - [x] 6.2 Synchronous submit + verdict + XP (6 min)
    - `POST /attempts/:id/submit`: `400` on bad `prUrl`; `conflict` on a `passed` attempt; else record `prUrl`, `status=grading`, `testRuns++`, **run `grader.grade()` inline**, persist `GradeRun` + `Review`, apply verdict = `passed` **iff** `testsTotal>0 && testsPassed===testsTotal && advisoryPass===true`, else `changes_requested` + `reviewRounds++`; runner error/timeout → `changes_requested` (never `passed`); on `passed` call `progression.awardForAttempt`; publish the attempt event; respond **`202`** with the resolved attempt; student-visible data limited to counts + `logExcerpt` (no queue)
    - _Requirements: 4.3, 4.4, 4.7, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

- [x] 7. telemetry — opt-in side channel (3 min)
  - [x] 7.1 Consent-gated record (3 min)
    - `modules/telemetry/service.ts`: `record(userId, name, props)` no-ops unless `telemetryOptIn===true`; writes bounded, anonymized `propsJson` (no PII/secrets); fire-and-forget so it never fails the main request; guard a couple of call sites (e.g. attempt passed)
    - _Requirements: 8.1, 8.2, 8.4, 8.5_

- [x] 8. Seed + Maya end-to-end smoke test (8 min)
  - [x] 8.1 Deterministic seed (4 min)
    - `apps/api/prisma/seed.ts` (`npm run seed`, deterministic reset): load `sim-companies/brightline-hidden/tickets.json` into `Ticket` rows (carry `hiddenTestRef` from `hiddenTestPath`) under one `SimCompany` (Brightline); seed `Persona` rows `pm`/`coach`; three demo users resolvable by `X-Demo-User`:
      - **Maya Chen** — handle `maya`, Level 1, UMass Amherst, `xp = 0`
      - **Jordan Okafor** — handle `jordan`, Level 6, Northeastern, `rating 4.8`, `workAuthorized true`, `xp` in `[500,600)`
      - **company admin** — handle `admin`
    - _Requirements: 2.3, 2.4, 2.5, 2.6, 3.1, 10.1, 10.2_
  - [x] 8.2 `scripts/smoke.sh` — full loop as Maya (`npm run smoke`) (4 min)
    - curl loop with `X-Demo-User: maya`: (1) `GET /users/me` capture starting `xp`; (2) `POST /attempts {ticketId: brightline-l1-pagination}` → capture id, assert `in_progress`; (3) `POST /attempts/:id/submit {prUrl}` → assert **`202`**; (4) poll `GET /attempts/:id` until terminal (bounded retries); (5) `GET /users/me` → assert `xp` rose and `level` updated per the formula; exit non-zero on any failed assertion; requires only the running API + `curl`
    - _Requirements: 10.3, 10.4, 10.5, 10.6_

- [x] 9. **FIRST END-TO-END CHECKPOINT (most important) — run the Maya loop** (2 min)
  - Start the API with `LLM_PROVIDER=gemini`, `GEMINI_MODEL=gemini-3.8-flash`, `GRADER_RUNNER=subprocess`, then `npm run seed && npm run dev` and `npm run smoke`. As **Maya**, start the Level 1 ticket, submit the correct-fix PR URL, and **confirm: all hidden tests pass, the Gemini review advisory is APPROVE, and Maya's XP goes up (0 → 125, Level 1 → 2)**.
  - **Ticket-id note:** earlier steering said "BRT-101"; the actual Level 1 ticket id in `tickets.json` is **`brightline-l1-pagination`**. Treat "BRT-101" as its alias.
  - **If this checkpoint fails, fix it before anything else.** Report precisely: "The end-to-end test fails at [step N]. Error: [paste]." Diagnose root cause (seed, subprocess runner, verdict rule, Gemini advisory, or XP math) and fix before continuing.
  - _Requirements: 5.3, 5.4, 7.2, 7.3, 7.6, 10.4, 10.5, 10.6_

- [x] 10. GitHub wrong-fix PR proof (via `gh`) (4 min)
  - Using `gh` (auth from the operator-managed `GITHUB_TOKEN` in `.env`), create a **wrong-fix** PR on the L1 ticket branch with **base `ticket/l1-pagination`** on the `brightline` repo; run the smoke/grade over that PR's URL and **confirm on GitHub** that (a) the hidden tests **fail** (not all pass → attempt `changes_requested`, no XP) and (b) the Gemini **review comment is posted on the PR**. This proves the subprocess runner + live reviewer are wired to a real PR, not just the happy path.
  - Do not create or edit `.env`; `gh` uses the token the operator placed there.
  - _Requirements: 5.4, 5.5, 5.6, 6.5, 11.2, 11.4_

- [~] 11. [CUTTABLE] Docker runner behind the grader seam (LAST) — SKIPPED
  - Skipped per instruction: everything else passed, so the subprocess runner carries the demo. The real `DockerRunner` already exists inside the `/grader` module and is reachable via `GRADER_RUNNER=docker` (the grader falls back to subprocess if no Docker daemon is up), so no core-api change is needed to enable it later.
  - _Requirements: 11.2_

## Verification results (all tasks run end to end)

- **Task 9 — first end-to-end checkpoint (real grader): PASS.** Correct-fix branch `sq/maya-chen/brt-101` created from `ticket/l1-pagination` with `offset = (page - 1) * pageSize`, pushed, PR opened as **#2** (base `ticket/l1-pagination`): `https://github.com/BhairabnathJ/brightline/pull/2`. As Maya: started BRT-101 (`brightline-l1-pagination`), submitted PR #2 → `202` → hidden tests passed → Gemini review **APPROVE** (comment posted on PR #2) → attempt `passed` → XP **0 → 125**, level **1 → 2**.
- **Task 10 — wrong-fix GitHub proof: PASS.** Reused the already-pushed branch `ticket/l1-pagination-wrongfix` and its existing PR **#1** (`https://github.com/BhairabnathJ/brightline/pull/1`) — no duplicate created. Graded PR #1 → hidden tests **9/10 (1 failing)** → Gemini review **REQUEST_CHANGES** (comment posted on PR #1) → attempt `changes_requested`, `reviewRounds` 1, **no XP** (Maya stayed xp 0 / level 1).
- **Adapter adjustment:** the real `GraderRunner` is `GraderModuleRunner`, a thin adapter over the committed `@sidequest/grader` `grade()`; `DemoRunner` selectable via `GRADER_RUNNER=demo`.
- **Admin:** `POST /admin/tickets/reload` upserts tickets from the hidden manifest (admin handle only) — verified (`{"reloaded":3}`; non-admin → `unauthorized`).
- **Smoke script:** `apps/api/scripts/smoke.sh` (`npm run smoke`) runs the full Maya loop and asserts XP increase + level recompute; passes against both the demo runner and the real grader.
