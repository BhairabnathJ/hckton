# Implementation Plan: browser-workspace

Pre-approved. Run all tasks in order; commit after each major (numbered) task.
The existing PR-URL submit flow must keep working — the workspace is additive.

- [ ] 1. Contract: enrich Attempt + workspace schemas (`/packages/shared`, `openapi.yaml`)
  - [ ] 1.1 `attempt` entity: add optional/nullable `testsPassed`, `testsFailed`,
    `failures[{name,message}]`, `verdict` (APPROVE|REQUEST_CHANGES nullable),
    `reviewBody`, `reviewCommentUrl`; add a `reviewVerdict` enum.
  - [ ] 1.2 New `src/endpoints/workspace.ts`: `workspaceTree`, `fileContent`,
    `writeFileRequest`/`writeFileResponse`, `runTestsResponse`; export from index.
  - [ ] 1.3 `openapi.yaml`: enriched Attempt schema + the six workspace paths +
    new component schemas; verify no `hiddenTestRef`/hidden path.
  - _R5, R6_

- [ ] 2. Prisma: nullable grade-detail columns on `Attempt` + push
  - Add `testsPassed Int?`, `testsFailed Int?`, `failuresJson String?`,
    `verdict String?`, `reviewBody String?`, `reviewCommentUrl String?`;
    `prisma generate` + `db push`. (Additive; existing rows unaffected.)
  - _R5_

- [ ] 3. Grader: `gradeWorkspace()` + GitHub push/openPr + CoreGradeResult enrichment
  - [ ] 3.1 `github.ts`: add `pushWorkspaceBranch(ws, branch)` and
    `openPr({owner,repo,head,base,title})` (Octokit, token redacted; reuse open PR
    if it already exists).
  - [ ] 3.2 `grade.ts`: `gradeWorkspace({attemptId,ticketId,workspacePath,studentHandle})`
    — copy ws→temp, `copyHiddenTests`, run sandbox; `git diff <branch>`; `review`;
    if `WORKSPACE_OPEN_PR!==false` push+PR+comment, else skip; any GitHub failure →
    `reviewCommentUrl=null`, still return. Return GradeResult + `reviewBody`,`prUrl`.
    Export from `/grader/src/index.ts`.
  - [ ] 3.3 core-api grader seam: extend `CoreGradeResult` with `testsFailed`,
    `failures`, `reviewBody`, `prUrl`; `GraderModuleRunner` maps the PR-path result
    through; add a `gradeWorkspace` pass-through in the grader seam.
  - _R4, R5_

- [ ] 4. attempts: persist + return the enriched fields on BOTH paths
  - Persist the new fields on the attempt in `submit()` (PR path) and the new
    `submitWorkspace()`; include them in `toContractAttempt`. Verdict/XP rules
    unchanged and shared. PR path behavior otherwise identical.
  - _R5 (PR path preserved)_

- [ ] 5. workspace module (`apps/api/src/modules/workspace/`)
  - [ ] 5.1 `service.ts`: `ensureWorkspace` (git clone, idempotent), `buildTree`
    (exclude .git/.venv/__pycache__), `safeResolve`, `readFile`/`writeFile`
    (200 KB, text-only), `runTests` (visible-only sandbox, 20 KB output),
    `requireOwnedAttempt(attemptId, user)` (404/403).
  - [ ] 5.2 `routes.ts` (thin): the six endpoints, zod-validated, owner-scoped;
    `submit` returns 202 via `attempts.submitWorkspace`. `schema.ts` re-exports shared.
  - [ ] 5.3 Mount `/attempts/:id/workspace*` in `app.ts` behind `currentUser`
    WITHOUT shadowing the existing attempts routes.
  - _R1, R2, R3_

- [ ] 6. Smoke script + end-to-end verification
  - `apps/api/scripts/smoke-workspace.sh` (+ `npm run smoke:workspace`): as Maya —
    create workspace for L1, GET the buggy `app/shipments.py`, PUT the fixed
    version, run-tests, submit (202), poll until `passed`, assert XP increased and
    `reviewBody` non-empty. Also re-run `smoke:demo` to prove the PR path still works.
  - _R1–R6_

## Notes
- `WORKSPACE_OPEN_PR` defaults true; for a deterministic offline smoke run it can
  be set false (grading still completes; `reviewCommentUrl` null).
- Visible L1 fix: in `app/shipments.py`, `offset = (page - 1) * pageSize`.
