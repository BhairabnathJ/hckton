# Requirements Document

## Introduction

This feature is build-plan spec #3 (`grader`) from `/docs/architecture.md`: the bridge between the SideQuest API and the disposable Docker sandbox + AI reviewer. It lives in `/grader` and is consumed by `/apps/api` (the `attempts` module calls it to grade a submitted PR). It takes an attempt, a ticket, and a PR, runs the student's code against the ticket's **hidden** tests inside a locked-down sandbox, obtains an AI code review, posts that review on the PR, and returns a structured `GradeResult`.

Per `/docs/architecture.md` §2, the grader **owns**: accepting a grade request (repo, ref, ticket, hidden-test reference); running student code in the Docker sandbox with enforced limits; collecting results; invoking the AI reviewer via the `LLMProvider` seam; returning a `GradeResult`. It **does not own**: writing to the database or mutating attempt/progression state (it returns data that `attempts` persists). This spec honors those boundaries — the grader is a pure function of its inputs plus GitHub/LLM side effects, with no DB access.

The grader's dependencies (build-plan §8) are the **grader I/O contract** and the **sandbox repos** from `sandbox-brightline` (both already exist: `/sim-companies/brightline-hidden/tickets.json` defines the tickets and `hiddenTestPath` per ticket, and `/sim-companies/brightline-hidden/tests/<id>/` holds the hidden tests). Its outputs (build-plan §8) are the `GraderRunner` (Docker implementation) plus a reviewer via the `LLMProvider` seam, and the `GradeResult` type.

This spec is **planning and documentation only** at the requirements/design/tasks stage; no `/grader` code, configuration, or scripts are produced until requirements, design, and tasks are approved.

### Authoritative-reference conformance

`/docs/architecture.md` is the authoritative reference. This spec conforms to:
- **§4(a)** the grade sequence: `attempts` → `grader.grade(repo, prRef, ticket, hiddenTestRef)` → sandbox run → AI review → `GradeResult`.
- **§6** the security model: `--network none`, 512 MB memory, 1 CPU, 60 s wall-clock timeout, read-only root filesystem except a scratch dir, non-root where possible, disposable one-container-per-run; a timeout is terminated and reported as failed; hidden tests are server-only and never serialized; the `GITHUB_TOKEN` and LLM credentials are read only from env and never logged or returned.
- **§7** the mocks/fallbacks: the `GraderRunner` interface with a Docker implementation and a **local subprocess fallback** selected by `GRADER_RUNNER`, and the `LLMProvider` seam.
- **§9** the risk register: Docker-unavailable → `GRADER_RUNNER=subprocess`; Bedrock latency/outage → canned fallback review; GitHub rate-limit/PAT issues → manual `prUrl` path; timeout ⇒ failed.

### Reuse of the existing LLMProvider seam

The `LLMProvider` interface already exists at `/apps/api/src/llm` (built for api-contract), with four implementations — Gemini (default), Bedrock, OpenRouter, and Mock — selected by the `LLM_PROVIDER` env var, and a factory (`createLLMProvider`). This spec **reuses that seam** rather than defining a second one; the grader's reviewer calls it. The user's requirement — "an LLMProvider interface with a Bedrock implementation and a fallback chosen by env var" — is satisfied by the existing seam (Bedrock is present; the default Gemini and the canned Mock are the fallbacks; selection is by env var).

### Conflict reconciled before approval (per the architecture conflict-and-deviation rule)

- **G1 — `GradeResult` shape.** The user's requested return is `{ passed, testsPassed, testsFailed, failures[], verdict, reviewCommentUrl }`. `/docs/architecture.md` §3/§4 names a `GradeResult` carrying `{ passed, testsPassed, testsTotal, logExcerpt }` plus an advisory review. These are reconciled by making the grader's returned `GradeResult` a **superset** that satisfies both: it carries `passed`, `testsPassed`, `testsFailed`, `testsTotal` (derivable as `testsPassed + testsFailed`), `failures[]`, a bounded `logExcerpt`, `verdict` (`APPROVE` | `REQUEST_CHANGES`), and `reviewCommentUrl`. No architecture field is dropped; the extra fields are additive and demo-facing. This is recorded here; if the team prefers, the architecture `GradeResult` description is updated first to name the additive fields. (The architecture already states grade output is limited to pass/fail counts + a bounded log excerpt for the *student-facing* response — the richer `GradeResult` is the grader→`attempts` internal contract, and `attempts` is responsible for not leaking hidden-test content downstream.)

## Glossary

- **Grader_Module**: The code under `/grader`, consumed by `/apps/api`. A library (plus a smoke script), not a standalone service.
- **Grade_Request**: The input to a grade — `{ attemptId, ticketId, prUrl }`.
- **Grade_Result**: The output — `{ passed, testsPassed, testsFailed, testsTotal, failures, logExcerpt, verdict, reviewCommentUrl }`.
- **Ticket_Manifest**: `/sim-companies/brightline-hidden/tickets.json`; the server-only source of ticket definitions and `hiddenTestPath` values.
- **Hidden_Test_Suite**: The pytest file(s) under `/sim-companies/brightline-hidden/tests/<ticketId>/`, referenced by a ticket's `hiddenTestPath`. Server-only; never shipped to students.
- **PR_Head**: The head repository (owner/name) and branch of the pull request identified by the PR URL.
- **Clone_Dir**: The temporary directory into which the PR head is shallow-cloned and the hidden tests are copied.
- **Sandbox_Runner**: The `SandboxRunner` interface that executes pytest under enforced limits. Two implementations: Docker (default) and local subprocess (fallback).
- **Docker_Runner**: The `SandboxRunner` Docker implementation using `python:3.12-slim`.
- **Subprocess_Runner**: The `SandboxRunner` local-subprocess fallback applying the same limits best-effort.
- **Sandbox_Limits**: `--network none`, 512 MB memory, 1 CPU, 60 s wall-clock timeout, read-only root filesystem except `/tmp`.
- **Pytest_Report**: The machine-readable pytest JSON report produced inside the sandbox.
- **LLM_Provider**: The existing `LLMProvider` seam at `/apps/api/src/llm` (Gemini/Bedrock/OpenRouter/Mock, selected by `LLM_PROVIDER`).
- **Reviewer**: The grader component that builds the "senior engineer reviewer" prompt, calls LLM_Provider with the PR diff, and parses the verdict.
- **Verdict**: The final line of the review, exactly `APPROVE` or `REQUEST_CHANGES`.
- **Review_Comment**: The PR comment posted via Octokit carrying the review text; its URL is `reviewCommentUrl`.
- **Job_Queue**: The in-process async queue that runs one grade job at a time with per-job status tracking.
- **Grade_Job**: One queued grading unit with an id and a status in {`queued`, `running`, `succeeded`, `failed`}.

## Requirements

### Requirement 1: Grade entry point and GradeResult contract

**User Story:** As the `attempts` module, I want to call the grader with an attempt, a ticket, and a PR and receive a structured result, so that I can persist the outcome and drive the attempt state machine.

#### Acceptance Criteria

1. THE Grader_Module SHALL expose a grade entry point that accepts a Grade_Request of `{ attemptId, ticketId, prUrl }`.
2. THE Grader_Module SHALL return a Grade_Result of `{ passed, testsPassed, testsFailed, testsTotal, failures, logExcerpt, verdict, reviewCommentUrl }`.
3. THE Grade_Result `passed` SHALL be `true` only when `testsFailed` is 0 and `testsPassed` equals `testsTotal` with `testsTotal` greater than 0, consistent with the architecture pass/fail determination.
4. THE Grade_Result `testsTotal` SHALL equal `testsPassed + testsFailed`.
5. THE Grade_Result `failures` SHALL be an array of failure entries, each identifying the failing test and carrying a bounded failure message.
6. THE Grade_Result `verdict` SHALL be exactly `APPROVE` or `REQUEST_CHANGES`.
7. THE Grade_Result `reviewCommentUrl` SHALL be the URL of the posted Review_Comment, or null when no comment could be posted (with the reason recorded in the result or logs, never a secret).
8. THE Grader_Module SHALL NOT read from or write to the database, and SHALL NOT mutate attempt or progression state (architecture §2).

### Requirement 2: Resolve the PR and shallow-clone its head

**User Story:** As a grader engineer, I want the grader to fetch the PR's head repo/branch and clone it, so that student code can be tested at the exact submitted ref.

#### Acceptance Criteria

1. THE Grader_Module SHALL read `GITHUB_TOKEN` only from the environment and SHALL use Octokit to resolve the PR_Head (head repo owner/name and branch) from the PR URL.
2. THE Grader_Module SHALL shallow-clone the PR_Head branch into a Clone_Dir created under a temporary directory.
3. WHEN the PR URL does not identify a valid pull request, THE Grader_Module SHALL fail the grade with an error that names the condition without exposing `GITHUB_TOKEN`.
4. IF Octokit returns a rate-limit or auth error, THEN THE Grader_Module SHALL surface an error identifying the condition without exposing the token, consistent with the architecture GitHub-failure fallback.
5. THE Grader_Module SHALL NOT log or include `GITHUB_TOKEN` in any error, result, or review.

### Requirement 3: Copy the ticket's hidden tests into the clone

**User Story:** As a grader engineer, I want the grader to look up the ticket and inject its hidden tests, so that the submission is assessed by tests the student cannot see.

#### Acceptance Criteria

1. THE Grader_Module SHALL look up the ticket by `ticketId` in the Ticket_Manifest at `/sim-companies/brightline-hidden/tickets.json`.
2. WHEN the ticket is found, THE Grader_Module SHALL resolve its `hiddenTestPath` to the Hidden_Test_Suite under `/sim-companies/brightline-hidden/tests/<...>` and copy it into the Clone_Dir.
3. IF the `ticketId` is absent from the Ticket_Manifest, THEN THE Grader_Module SHALL fail the grade with an error naming the missing `ticketId` and SHALL NOT run the sandbox.
4. IF the resolved `hiddenTestPath` does not exist on disk, THEN THE Grader_Module SHALL fail the grade with an error naming the missing path and SHALL NOT run the sandbox.
5. THE Grader_Module SHALL place the hidden tests so pytest discovers and runs them against the cloned student code.
6. THE Grade_Result and the Review_Comment SHALL NOT contain Hidden_Test_Suite source content (architecture §6); only pass/fail counts, bounded failure messages, and a bounded `logExcerpt` are exposed.

### Requirement 4: Run pytest in the sandbox under enforced limits

**User Story:** As a security owner, I want student code executed under hard resource and network limits, so that it cannot exfiltrate data or exhaust the host.

#### Acceptance Criteria

1. THE Sandbox_Runner SHALL run pytest against the Clone_Dir (student code + injected hidden tests) and produce a Pytest_Report in JSON form.
2. THE Docker_Runner SHALL run in a disposable `python:3.12-slim` container with: `--network none`; a 512 MB memory cap; 1 CPU; a read-only root filesystem with a writable `/tmp` (scratch) mount; and non-root execution where possible.
3. THE Sandbox_Runner SHALL enforce a 60-second wall-clock timeout on the pytest run.
4. WHEN a run exceeds the 60-second timeout, THE Sandbox_Runner SHALL terminate (kill and reap) the run and report it as failed with a timeout indication in the `logExcerpt`, consistent with architecture §6.
5. THE Sandbox_Runner SHALL return a structured run outcome of `{ passed, testsPassed, testsFailed, failures, logExcerpt }` derived from the Pytest_Report.
6. IF the Pytest_Report indicates zero tests executed, THEN THE Sandbox_Runner SHALL treat the run as failed rather than passed.
7. THE Grader_Module SHALL select the Sandbox_Runner implementation by the `GRADER_RUNNER` env var, defaulting to the Docker_Runner.
8. WHERE `GRADER_RUNNER=subprocess` is set, or the Docker_Runner fails to initialize, THE Grader_Module SHALL use the Subprocess_Runner, which applies the same memory, CPU, and 60 s timeout limits on a best-effort basis behind the same SandboxRunner interface so no calling code changes.
9. THE `logExcerpt` SHALL be bounded in length and SHALL NOT contain Hidden_Test_Suite source.

### Requirement 5: Parse the test results

**User Story:** As the `attempts` module, I want accurate pass/fail counts and failure messages, so that I can decide the attempt outcome and show the student why it failed.

#### Acceptance Criteria

1. THE Grader_Module SHALL parse the Pytest_Report into `testsPassed`, `testsFailed`, and `testsTotal` as non-negative integers where `testsPassed + testsFailed = testsTotal`.
2. THE Grader_Module SHALL extract, for each failing test, an identifier (e.g. test node id) and a bounded failure message into `failures`.
3. THE Grader_Module SHALL set `passed` per Requirement 1.3.
4. IF the Pytest_Report is missing or unparseable, THEN THE Grader_Module SHALL treat the run as failed and record a bounded diagnostic in `logExcerpt`.

### Requirement 6: Generate the senior-engineer AI review

**User Story:** As a student, I want a specific, actionable code review on my PR, so that I learn what to fix without being handed the answer.

#### Acceptance Criteria

1. THE Grader_Module SHALL obtain the PR diff via Octokit.
2. THE Reviewer SHALL call LLM_Provider with a "senior engineer reviewer" system prompt and the PR diff.
3. THE Reviewer system prompt SHALL instruct the model to: be specific and reference `file:line`; point out bugs, missed edge cases, and style issues relevant to this codebase; NEVER write the fix; and end with a final line of exactly `APPROVE` or `REQUEST_CHANGES`.
4. THE Reviewer SHALL parse the final line of the review as the Verdict and SHALL normalize it to exactly `APPROVE` or `REQUEST_CHANGES`.
5. IF the review output does not end with a valid verdict line, THEN THE Reviewer SHALL derive the Verdict from the test outcome (`APPROVE` only when `passed` is true, otherwise `REQUEST_CHANGES`) and record that the model verdict was absent.
6. THE Reviewer SHALL select the LLM backend via the existing `LLM_PROVIDER` env var and the `createLLMProvider` factory, with Bedrock available and a fallback (Gemini default / canned Mock) selectable by env var.
7. IF the LLM call times out or errors, THEN THE Reviewer SHALL return a clearly-labeled fallback review and derive the Verdict from the test outcome, so grading still completes (architecture §9 Bedrock fallback).
8. THE Reviewer SHALL NOT include any LLM or GitHub credential in the review text.

### Requirement 7: Post the review as a PR comment

**User Story:** As a student, I want the review to appear on my pull request, so that I see the feedback where I work.

#### Acceptance Criteria

1. THE Grader_Module SHALL post the review text as a PR comment via Octokit.
2. WHEN the comment is posted, THE Grader_Module SHALL set `reviewCommentUrl` to the created comment's URL.
3. IF posting the comment fails, THEN THE Grader_Module SHALL set `reviewCommentUrl` to null and record the failure reason (without a secret), and SHALL still return the rest of the Grade_Result.
4. THE posted comment SHALL contain the review text including the final verdict line, and SHALL NOT contain Hidden_Test_Suite source or any credential.

### Requirement 8: In-process async job queue with status tracking

**User Story:** As the API process, I want grading serialized to one job at a time with observable status, so that concurrent submissions don't overwhelm the sandbox and callers can poll progress.

#### Acceptance Criteria

1. THE Job_Queue SHALL accept Grade_Requests and run at most one Grade_Job at a time within the process.
2. THE Job_Queue SHALL assign each Grade_Job an id and expose its status as one of `queued`, `running`, `succeeded`, or `failed`.
3. WHEN a Grade_Job completes successfully, THE Job_Queue SHALL expose the resulting Grade_Result for that job id.
4. WHEN a Grade_Job fails, THE Job_Queue SHALL expose a failure status and a bounded error for that job id (never a secret).
5. WHILE a Grade_Job is running, THE Job_Queue SHALL hold additional submitted jobs in `queued` and start them in submission order once the running job finishes.
6. THE Job_Queue SHALL remain responsive to status queries while a job is running.

### Requirement 9: Guaranteed cleanup of temp dir and container

**User Story:** As a build owner, I want every grade to clean up after itself, so that repeated grading does not leak disk, processes, or containers — even on failure.

#### Acceptance Criteria

1. WHEN a grade completes (pass or fail), THE Grader_Module SHALL remove the Clone_Dir and any temporary directories it created.
2. WHEN the Docker_Runner is used, THE Grader_Module SHALL remove the container (e.g. via `--rm` and/or explicit removal) after the run, including on error and on timeout.
3. IF the grade raises an error at any stage (clone, copy, sandbox, parse, review, comment), THEN THE Grader_Module SHALL still perform all cleanup for resources created up to that point before propagating or recording the failure.
4. WHEN a run times out, THE Grader_Module SHALL kill and reap the container/process and then perform cleanup.
5. THE cleanup SHALL be idempotent and SHALL NOT fail the grade if a resource was already removed.

### Requirement 10: Smoke test script

**User Story:** As a grader engineer, I want a one-command smoke test that grades a real PR against the L1 ticket and prints the GradeResult, so that I can prove the whole pipeline end to end before the demo.

#### Acceptance Criteria

1. THE Grader_Module SHALL provide a smoke test script that grades a real PR against the L1 ticket (`brightline-l1-pagination`) and prints the resulting Grade_Result.
2. THE smoke test script SHALL accept the target PR URL (and optionally attemptId) via argument or environment, and SHALL use `GITHUB_TOKEN` from the environment.
3. WHEN run, THE smoke test script SHALL print the full Grade_Result including `passed`, `testsPassed`, `testsFailed`, `verdict`, and `reviewCommentUrl`.
4. THE smoke test script SHALL honor `GRADER_RUNNER` and `LLM_PROVIDER` so it can run with the subprocess runner and/or the mock LLM when Docker or a live LLM is unavailable.
5. THE smoke test script SHALL exit non-zero if the grade pipeline errors before producing a Grade_Result, and SHALL clean up temporary resources regardless of outcome.

### Requirement 11: Secrets and isolation discipline

**User Story:** As a security owner, I want the grader to handle credentials and hidden material safely, so that nothing leaks through logs, results, or the sandbox.

#### Acceptance Criteria

1. THE Grader_Module SHALL read `GITHUB_TOKEN` and all LLM credentials only from environment variables (architecture §6).
2. THE Grader_Module SHALL never log, print, or return any credential value, including in error paths.
3. IF a required credential is missing when a grade starts, THEN THE Grader_Module SHALL fail with an error naming the missing environment variable without printing any partial or full secret.
4. THE sandbox SHALL run with `--network none` so student code cannot reach the network regardless of what it attempts (architecture §6).
5. THE Hidden_Test_Suite source SHALL never appear in the Grade_Result, the `logExcerpt`, the `failures`, or the Review_Comment.
