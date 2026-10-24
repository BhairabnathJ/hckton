# Implementation Plan: grader

## Total Estimate: 60 minutes (approved demo-critical scope — Option B)

> **Approval note (2026-10-24).** Approved at the tasks step with a **60-minute**
> demo-critical scope (Option B): the **subprocess runner** and **synchronous
> grading** are the primary path; the in-process **job queue** and all `*` test
> sub-tasks are **deferred**; the **Docker runner** is added as the **LAST task,
> marked `[CUTTABLE]`**, behind the same `SandboxRunner` seam. The reviewer uses
> `LLM_PROVIDER=gemini` with `GEMINI_MODEL=gemini-3.8-flash` (key verified
> working). The full 120-minute scope (Docker runner + queue + tests) remains the
> architecture's 2.0 h budget for spec #3 and can be resumed later.

## Overview

Build order follows the demo-critical data flow: types + config first, then the
**subprocess** SandboxRunner behind the seam, then report parsing, then GitHub
(Octokit) + tickets/hidden-test injection, then the reviewer on the reused
`LLMProvider` seam, then the synchronous orchestrator with guaranteed cleanup,
then the REQUIRED smoke script. The **Docker runner** is the final `[CUTTABLE]`
task so `GRADER_RUNNER=docker` can be switched on later with no calling-code
changes. Stack per steering: Node 20 + TypeScript, Octokit, zod; pytest runs in a
throwaway venv (subprocess) or `python:3.12-slim` (Docker, cuttable).

- Conforms to `/docs/architecture.md` §4a/§6/§7/§9; reuses the existing
  `LLMProvider` seam at `/apps/api/src/llm` (Gemini default / Bedrock / OpenRouter
  / Mock, by `LLM_PROVIDER`).
- The `SandboxRunner` seam is selectable by `GRADER_RUNNER` (`subprocess` default
  for this scope; `docker` added by the final cuttable task).
- `[CUTTABLE]` tasks can be dropped to stay under budget.
- `*` test sub-tasks are deferred in this scope (not run).
- Every credential is read from env only and never logged/returned (§6).

## Tasks

- [ ] 1. Scaffold `/grader` package, types, and config (10 min)
  - [ ] 1.1 Create the package (4 min)
    - Create `grader/package.json` (`@sidequest/grader`, deps `@octokit/rest`, `zod`; dev `tsx`, `typescript`, `@types/node`), `grader/tsconfig.json`, and `grader/src/index.ts` barrel; wire into the npm workspace so it can import the LLM seam from `@sidequest/api`
    - _Requirements: 1.1, 1.8_
  - [ ] 1.2 Define `types.ts` (3 min)
    - `GradeRequest`, `Failure`, `SandboxOutcome`, `Verdict`, `GradeResult` exactly per design; include the `passed`/`testsTotal` invariants as a `toGradeResult()` helper
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_
  - [ ] 1.3 Define `config.ts` (3 min)
    - Resolve `GITHUB_TOKEN`, `GRADER_RUNNER` (default `subprocess` in this scope), `LLM_PROVIDER`, and the `brightline-hidden` manifest/tests paths from env; load `.env`; throw a named error for a missing required credential without printing any secret
    - _Requirements: 11.1, 11.2, 11.3_

- [ ] 2. SandboxRunner seam + SubprocessRunner (primary) (14 min)
  - [ ] 2.1 `runners/types.ts` interface + `createSandboxRunner` (4 min)
    - `SandboxRunner` + `RunSpec` per design; `createSandboxRunner()` reads `GRADER_RUNNER` (default `subprocess` in this scope) and returns the subprocess runner; a `docker` value is wired by Task 9
    - _Requirements: 4.7, 4.8_
  - [ ] 2.2 `runners/subprocess.ts` — SubprocessRunner (10 min)
    - Run pytest in a throwaway venv/temp dir against the clone (student code + injected hidden tests); produce a JSON report; enforce a 60 s watchdog that kills+reaps on timeout and marks `timedOut`; best-effort memory/CPU caps; return `SandboxOutcome`
    - _Requirements: 4.1, 4.3, 4.4, 4.5, 4.6_

- [ ] 3. Report parsing (`report.ts`) (8 min)
  - Parse the pytest JSON report into `testsPassed`/`testsFailed`/`testsTotal`, `failures[]` (node id + bounded message), `passed`, and a bounded `logExcerpt`; zero tests ⇒ failed; missing/unparseable ⇒ failed + diagnostic; strip anything resembling hidden-test source from messages
  - _Requirements: 4.6, 5.1, 5.2, 5.3, 5.4, 3.6, 11.5_

- [ ] 4. GitHub integration (`github.ts`) via Octokit (10 min)
  - [ ] 4.1 Resolve PR head + shallow clone (5 min)
    - `resolvePrHead(prUrl)` via `pulls.get`; `shallowClone` with `--depth 1 --branch` using a token-injected clone URL that is never logged, then strip the remote; map rate-limit/auth/invalid-PR to named errors without the token
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  - [ ] 4.2 Get diff + post comment (5 min)
    - `getDiff(prUrl)` (`mediaType: { format: "diff" }`); `postComment(prUrl, body)` via `issues.createComment` returning `html_url`; on post failure return null and record a non-secret reason
    - _Requirements: 6.1, 7.1, 7.2, 7.3, 7.4_

- [ ] 5. Tickets + hidden-test injection (`tickets.ts`) (6 min)
  - `loadTicket(ticketId)` from `/sim-companies/brightline-hidden/tickets.json` (named error if absent); `copyHiddenTests(ticket, cloneDir)` resolving `hiddenTestPath`, verifying existence (named error if missing), and copying so pytest discovers it; never emit the hidden path/source. (`brightline-l1-pagination` is the real ticket id; `BRT-101` is a display alias only and is never used for lookup.)
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [ ] 6. Reviewer (`reviewer.ts`) on the reused LLMProvider seam (12 min)
  - Build the fixed "senior engineer reviewer" system prompt (specific, `file:line`, bugs/edge-cases/style, NEVER the fix, final line exactly `APPROVE`/`REQUEST_CHANGES`); call `createLLMProvider()` (gemini, `GEMINI_MODEL=gemini-3.8-flash`) with `[system, user=diff+ticket context]`; use a generous LLM timeout (the model has been observed to take ~50 s); `parseVerdict` from the last line with test-outcome fallback; canned labeled review + test-derived verdict on LLM error/timeout; never include credentials
  - _Requirements: 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_

- [ ] 7. Cleanup stack + synchronous orchestrator (`cleanup.ts`, `grade.ts`) (12 min)
  - [ ] 7.1 `ResourceStack` (4 min)
    - LIFO `defer`/`dispose`, idempotent, swallows already-removed errors
    - _Requirements: 9.1, 9.5_
  - [ ] 7.2 `grade()` orchestrator — synchronous (8 min)
    - Wire the 7 steps (resolve PR → clone → load+copy hidden tests → sandbox run → diff → review → post comment → `toGradeResult`) and return the `GradeResult` directly (synchronous; no queue in this scope); defer temp-dir and container/process removal onto the stack as created; `dispose()` in `finally` so cleanup runs on success, error, and timeout
    - _Requirements: 1.1, 1.2, 9.1, 9.2, 9.3, 9.4_

- [ ] 8. Smoke test script (`smoke.ts`) — REQUIRED (8 min)
  - Grade a real PR against the L1 ticket (`brightline-l1-pagination`): read the PR URL (and optional attemptId) from argv/env and `GITHUB_TOKEN` from env; call `grade()` synchronously; print the full `GradeResult` (`passed`, `testsPassed`, `testsFailed`, `verdict`, `reviewCommentUrl`); honor `GRADER_RUNNER` and `LLM_PROVIDER`; exit non-zero if the pipeline errors before producing a result; clean up regardless. Add a `"smoke"` script to `grader/package.json`
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ] 9. [CUTTABLE] Docker runner (`runners/docker.ts`) behind the seam (14 min)
  - Add the `python:3.12-slim` DockerRunner with `--network none`, `--memory 512m`, `--cpus 1`, `--read-only`, `--tmpfs /tmp`, non-root where possible, JSON report via `/tmp`, 60 s kill+reap watchdog, and container removal via `--rm` + explicit `docker rm -f` on the cleanup stack; make `createSandboxRunner()` return it when `GRADER_RUNNER=docker` (probing `docker info`, falling back to subprocess if unreachable). No calling-code changes.
  - _Requirements: 4.2, 4.7, 4.8, 9.2, 9.4, 11.4_

## Deferred (out of this 60-minute scope; part of the full 120-minute plan)

- In-process async **job queue** with status tracking (Requirement 8) — the
  orchestrator runs synchronously for the demo; the queue wraps it later.
- All `*` test sub-tasks (runner contract test, unit tests) — Requirement
  verification is via the smoke script in this scope.
