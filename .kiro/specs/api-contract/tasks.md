# Implementation Plan: api-contract

## Total Estimate: 60 minutes (≤ 60, per build-plan spec #1)

## Overview

Lean 8-hour-hackathon plan. Build order follows the design and the dependency chain: the shared zod package is the single source of truth, so it is built and committed **first** (every downstream spec and the UI depend on it), then the OpenAPI 3 file derived from it, then the one-command mock server with seeded data, then the contract-integrity checks. No application/business logic is written — only the contract (schemas), its OpenAPI projection, and a mock that serves seeded data.

- This spec conforms to the reconciled `/docs/architecture.md` (change log 2026-10-24): Attempt enum per §5 (C1); Job enum + `escrowStatus`/`claimedByUserId`/`claimExpiresAt` fields, `Company`/`SimCompany`/`HintLog` entities, `telemetryOptIn`, and `job.dropped`/`job.claimed`/`job.claim_expired` events (C2–C6).
- `[CUTTABLE]` tasks can be dropped to stay under budget; the running sum assumes all tasks run.
- Test/check sub-tasks are marked optional with `*` per workflow convention.
- Every mock seam is marked `// MOCK` (steering convention): `X-Demo-User` auth and `escrowStatus`/payout only.

## Tasks

- [ ] 1. Build and COMMIT `/packages/shared` — the contract source of truth (22 min)
  - [ ] 1.1 Scaffold the shared workspace (4 min)
    - Create `packages/shared/package.json` (name `@sidequest/shared`, `main`/`exports` to `src/index.ts`, `zod` dependency), `tsconfig.json`, and `src/index.ts` barrel; ensure both `apps/api` and `apps/web` can import it and neither imports the other
    - _Requirements: 1.5_
  - [ ] 1.2 Define shared enums and the error envelope (4 min)
    - Create `src/enums.ts` with single exported zod enums: `attemptStatus` (`in_progress|grading|passed|changes_requested|abandoned`), `jobStatus` (`open|claimed|submitted|accepted|paid|expired`), `escrowStatus` (`funded|released|refunded`, `// MOCK`), `hintPersona` (`pm|coach`), and `errorCode`; create `src/error.ts` with `errorEnvelope` = `{ error: { code, message } }`
    - _Requirements: 1.3, 1.6, 2.11, 2.12, 3.3, 3.4_
  - [ ] 1.3 Define the eight entity schemas with inferred types (7 min)
    - Create `src/entities/` for `user` (id, handle, name, school, xp, level, rating, workAuthorized, telemetryOptIn), `company` (id, name, size), `simCompany` (id, name, repoTemplateUrl), `ticket` (id, simCompanyId, level, title, description, acceptanceCriteria, branch — **no hiddenTestRef**), `attempt` (id, userId, ticketId, status, prUrl, testRuns, reviewRounds, hintsUsed), `hintLog` (id, attemptId, persona, question, response), `telemetryEvent` (id, userId, type, payload, createdAt), `job` (id, companyId, title, description, payCents, timeLimitHours, minLevel, status, claimedByUserId, claimExpiresAt, escrowStatus); export `z.infer` types for each
    - _Requirements: 1.1, 1.2, 1.7, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10_
  - [ ] 1.4 Define per-endpoint Request/Response schemas and SSE payloads (5 min)
    - Create `src/endpoints/{users,tickets,attempts,ai,jobs,admin}.ts` with the Request/Response schemas from the design's endpoint catalogue (reusing entity + enum schemas), and `src/events.ts` with `sseEventName` and the discriminated-union payloads for `job.dropped`, `job.claimed`, `job.claim_expired`; re-export all from `src/index.ts`
    - _Requirements: 1.4, 6.1, 6.2, 6.3, 7.1, 7.2, 8.1, 8.2, 8.3, 8.4, 9.1, 9.2, 9.3, 10.1, 10.2, 10.3, 10.4, 10.5, 11.1, 11.3, 12.1, 12.2, 12.3, 12.4, 12.5_
  - [ ] 1.5 Commit the shared package on its own (2 min)
    - `git add` ONLY `packages/shared/**` and commit, so downstream specs and the UI can build against the frozen contract immediately
    - _Requirements: 1.5_

- [ ] 2. Produce `/apps/api/openapi.yaml` from the shared schemas (14 min)
  - [ ] 2.1 Scaffold `apps/api` package and OpenAPI generation (6 min)
    - Create `apps/api/package.json` depending on `@sidequest/shared`; add `src/mock/openapi.ts` using `@asteasolutions/zod-to-openapi` to register every entity/endpoint schema and emit `apps/api/openapi.yaml` (or hand-author `openapi.yaml` kept in lockstep); add an `openapi` npm script
    - _Requirements: 4.1, 4.6_
  - [ ] 2.2 Document every endpoint, header, SSE, and error (6 min)
    - Ensure `openapi.yaml` documents each endpoint in the catalogue with method/path/params/body/success + error responses referencing the `errorEnvelope`; document the `X-Demo-User` header (marked mock) on auth endpoints; document `GET /events` with event names `job.dropped`/`job.claimed`/`job.claim_expired` and each payload; verify no response component contains `hiddenTestRef`
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 3.1, 3.2_
  - [ ] 2.3* Validate the OpenAPI document (2 min)
    - Run an OpenAPI 3 validator (e.g. `redocly lint` or `swagger-cli validate`) against `apps/api/openapi.yaml`
    - _Requirements: 4.1_

- [ ] 3. Build the one-command mock server with seeded data (18 min)
  - [ ] 3.1 Deterministic seed data (5 min)
    - Create `apps/api/src/mock/seed.ts` with: users `ada` (level 3) and `grace` (level 7); company `Northwind`; simCompany `Brightline`; three Brightline tickets at levels 1/2/3 (no hiddenTestRef); one `in_progress` attempt for `ada`; two `Northwind` jobs (one `open` minLevel 6, one `claimed` by `grace` with near-future `claimExpiresAt`, `escrowStatus: funded`)
    - _Requirements: 5.4, 5.8_
  - [ ] 3.2 `// MOCK` demo-user middleware (2 min)
    - Create `apps/api/src/mock/demoUser.ts` resolving the current user from `X-Demo-User`, defaulting to a seeded user when absent; mark `// MOCK` and note the production auth-middleware replacement seam (§7)
    - _Requirements: 5.5, 13.2, 13.4_
  - [ ] 3.3 Express app + all HTTP routes with request/response validation (7 min)
    - Create `apps/api/src/mock/server.ts`: an Express app with one handler per endpoint in the catalogue; each handler `safeParse`s its Request_Schema (400 `validation_error` on failure), builds the response from seed, and `parse`s it against the Response_Schema before sending; map errors to the Error Handling table (`not_found`/`level_gate`/`job_already_claimed`/`conflict`/`unauthorized`); mark the `escrowStatus`/payout path on accept `// MOCK`
    - _Requirements: 5.1, 5.2, 5.6, 5.7, 5.8, 6.4, 6.5, 7.3, 7.4, 8.5, 8.6, 9.4, 9.5, 10.6, 10.7, 10.8, 13.1, 13.3_
  - [ ] 3.4 SSE hub + admin drop + claim/expiry events (3 min)
    - Implement `GET /events` (`text/event-stream`, per-connection registration) and the publishers: `POST /admin/jobs/drop` → `job.dropped` (job `open`); claim → `job.claimed`; a claim timer → `job.claim_expired` flipping the job to `expired`; wire the `"mock"` script in `apps/api/package.json` so `npm run mock` starts the server with no DB/Docker/GitHub/Bedrock
    - _Requirements: 5.1, 5.3, 11.1, 11.2, 11.4, 12.1, 12.2, 12.3, 12.4_

- [ ] 4. Contract-integrity checks (6 min)
  - [ ] 4.1* Seed-validates-against-schema + hidden-test-leak guard (3 min)
    - Add a check that every Response_Schema `.parse`s its seed value, and a guard that greps the shared schemas and `openapi.yaml` for `hiddenTestRef` and fails if present
    - _Requirements: 5.2, 5.8, 7.3, 3.3_
  - [ ] 4.2* Mock smoke test (3 min)
    - Start the mock, hit each endpoint once asserting 2xx + schema-valid body, and assert `POST /admin/jobs/drop` causes a `job.dropped` event on `/events`
    - _Requirements: 5.1, 5.2, 5.3, 11.2_
```
