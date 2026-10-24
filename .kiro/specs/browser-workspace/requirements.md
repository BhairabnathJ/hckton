# Requirements: browser-workspace

## Introduction

An additive submission path: students edit a ticket's code in an in-browser
editor on our site, run the **visible** tests, and submit for grading — with no
local setup. This conforms to `/docs/architecture.md` (attempts own the lifecycle
and delegate grading to the grader; grader never writes the DB; hidden tests stay
server-only, §2/§6) and the steering (thin routes, fat services, zod validation,
`{ error: { code, message } }`, `// MOCK` auth via `X-Demo-User`).

**The existing PR-URL submit flow MUST keep working unchanged.** The workspace is
a second path into the same grade → verdict → XP machinery.

## Requirements

### R1 — Workspace lifecycle (owner-scoped)
All `/attempts/:id/workspace*` endpoints resolve the current user from
`X-Demo-User` and return `403 forbidden` if the caller is not the attempt owner,
`404 not_found` if the attempt is unknown.

1. `POST /attempts/:id/workspace` — create the workspace if missing: `git clone`
   the ticket's `branch` from the local `/sim-companies/brightline` repo into
   `os.tmpdir()/sidequest-workspaces/<attemptId>`. Idempotent (no-op if present).
   Returns `{ files: [{ path, type: "file"|"dir" }] }`, excluding `.git`,
   `.venv`, `__pycache__`.
2. `GET /attempts/:id/workspace/files` — the same tree.
3. `GET /attempts/:id/workspace/file?path=…` — `{ path, content }`.
4. `PUT /attempts/:id/workspace/file` body `{ path, content }` — `{ ok: true }`.
5. `POST /attempts/:id/workspace/run-tests` — run ONLY the visible tests
   (`pytest tests`) via the existing `SandboxRunner`, 60 s timeout. Returns
   `{ passed, failed, output }`, `output` truncated to 20 KB.
6. `POST /attempts/:id/workspace/submit` — returns **202**, grades the workspace,
   and resolves the attempt to `passed`/`changes_requested` exactly like the PR
   path, with the **same XP rules**.

### R2 — Path & file safety
Reject any path that escapes the workspace: no `..` segments, no absolute paths;
the resolved real path must stay within the workspace root → `400 validation_error`.
Max file size **200 KB**; text files only (reject on NUL byte / non-UTF-8).

### R3 — Hidden-test isolation
Hidden tests are **never** copied into the workspace. They are copied only into a
**separate temp copy** at grading time (R4.1). The workspace tree and file reads
never expose hidden-test material.

### R4 — Grader: `gradeWorkspace({ attemptId, ticketId, workspacePath, studentHandle })`
Reuses the existing runner, report parsing, and reviewer:
1. Copy the workspace to a temp dir, add the hidden tests, run them (sandbox).
2. Compute the diff with `git diff <ticketBranch>` inside the workspace; send it
   to the existing Gemini reviewer.
3. If `WORKSPACE_OPEN_PR=true` (default **true**): commit the student's changes in
   the workspace to a new branch `sq/<handle>/<ticketId>-<attemptId>`, push to
   origin (`https://github.com/BhairabnathJ/brightline.git` via `GITHUB_TOKEN`),
   open a PR with base = the ticket branch, and post the review comment — reusing
   the existing GitHub helpers. **If any GitHub step fails, still complete grading
   and set `reviewCommentUrl` to null.**

### R5 — Attempt response enrichment (BOTH paths)
The attempt response adds: `testsPassed`, `testsFailed`, `failures[{ name, message }]`,
`verdict` (`APPROVE|REQUEST_CHANGES`), `reviewBody`, `reviewCommentUrl`, `prUrl`.
These are filled for BOTH the PR-URL submit path and the workspace submit path.
All optional/nullable so a freshly-started attempt still validates.

### R6 — Contract
`/packages/shared` and `apps/api/openapi.yaml` are updated for all of the above
(the enriched attempt, the workspace request/response schemas, the new paths).
No hidden-test field is ever added to the contract.
