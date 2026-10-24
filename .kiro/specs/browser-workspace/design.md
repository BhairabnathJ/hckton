# Design: browser-workspace

## Overview

A new `workspace` module under `apps/api/src/modules/workspace/` (thin `routes.ts`,
fat `service.ts`, `schema.ts` re-exporting shared) plus a new grader entrypoint
`gradeWorkspace()` in `/grader`. Attempts gains a second submit path that funnels
into the same verdict + XP code already used by the PR path.

```
web editor ── HTTP ─▶ workspace.routes ─▶ workspace.service ──┐
                                                              │ filesystem clone
                                       ┌──────────────────────┘ under tmpdir
  submit ─▶ attempts.service.submitWorkspace() ─▶ grader.gradeWorkspace()
                     │                                   │ copy+hidden tests+run
                     └─ persist GradeRun+Review, verdict, XP (shared with PR path)
```

## Workspace storage & safety

- Root: `os.tmpdir()/sidequest-workspaces/<attemptId>` (one dir per attempt).
- `create`: if the dir is absent, `git clone --branch <ticket.branch> <localBrightline> <root>`
  (the local path is `<REPO_ROOT>/sim-companies/brightline`). Idempotent.
- `safeResolve(root, p)`: reject `p` that is absolute or contains a `..` segment;
  `path.resolve(root, p)` and assert it starts with `root + sep`; else
  `AppError.validation`. Used by every file read/write.
- `buildTree(root)`: recursive walk, skipping `.git`, `.venv`, `__pycache__`;
  emits `{ path (relative, posix), type }`, dirs before files, sorted.
- File read/write: reject > 200 KB; reject non-text (NUL byte) → `validation_error`.

## run-tests (visible only)

`service.runTests(root)` calls `createSandboxRunner(cfg.runner).run({ cloneDir: root,
reportPath: root/.sq-report.json, timeoutMs: 60_000, memoryMb: 512, cpus: 1 })`
against the workspace **as-is** (visible `tests/` only — no hidden tests copied).
Maps `SandboxOutcome` → `{ passed: testsPassed, failed: testsFailed, output }`,
`output = clip(logExcerpt + failures, 20_000)`.

## grader.gradeWorkspace()

New export in `/grader/src/grade.ts`, reusing helpers:
1. `copyDir(workspacePath → tmp)` (skip `.git`), `copyHiddenTests(ticket, tmp)`,
   `createSandboxRunner(cfg.runner).run(...)` → `SandboxOutcome`.
2. `diff = git diff <ticket.branch>` run inside `workspacePath`; `review({ diff,
   ticket, outcome })` (existing reviewer) → `{ text, verdict }`.
3. If `WORKSPACE_OPEN_PR=true`: `GitHub.pushWorkspaceBranch()` +
   `GitHub.openPr(base=ticket.branch)` + existing `postComment()`. Any failure →
   log non-secret reason, `reviewCommentUrl = null`, grading still returns.
Returns a `GradeResult` superset additionally carrying `reviewBody` (= review
text) and `prUrl`. `toGradeResult` invariants unchanged.

New GitHub helpers (reuse Octokit + token redaction already in `github.ts`):
- `pushWorkspaceBranch(workspacePath, branch)`: `git -C ws checkout -b <branch>`,
  `commit -am`, `push` to a token-injected origin URL (never logged), then strip
  the remote.
- `openPr({ owner, repo, head, base, title })` via `pulls.create` → `{ number,
  html_url }`; on "already exists" reuse the open PR.

## Attempt enrichment (both paths)

`CoreGradeResult` gains `testsFailed`, `failures`, `reviewBody`, `prUrl` (already
has `testsPassed/testsTotal/advisoryPass/verdict/reviewCommentUrl`). The PR
adapter (`GraderModuleRunner`) maps the grader's existing `failures`/review text
through; `gradeWorkspace` fills the same fields. `attempts.service` persists them
onto the `GradeRun`/`Review` and returns them in the contract attempt. The
`Attempt` Prisma model gains nullable columns:
`testsPassed Int?`, `testsFailed Int?`, `failuresJson String?`, `verdict String?`,
`reviewBody String?`, `reviewCommentUrl String?` (prUrl already exists).

Verdict rule is unchanged and shared:
`passed iff testsTotal>0 && testsPassed===testsTotal && advisoryPass`.

## Contract (`/packages/shared`)

- `attempt` entity: add optional `testsPassed`, `testsFailed`,
  `failures: {name,message}[]`, `verdict` (nullable enum APPROVE|REQUEST_CHANGES),
  `reviewBody`, `reviewCommentUrl` (all nullable/optional).
- new `src/endpoints/workspace.ts`: `workspaceTree` (`{ files: [{path,type}] }`),
  `fileContent` (`{path,content}`), `writeFileRequest` (`{path,content}` →
  `{ok:true}`), `runTestsResponse` (`{passed,failed,output}`).
- `openapi.yaml`: document the six endpoints + enriched Attempt + new schemas; no
  `hiddenTestRef`/hidden path anywhere.

## Security recap (architecture §6)

Hidden tests only ever enter the grading temp copy, never the workspace. Path
traversal blocked by `safeResolve`. `GITHUB_TOKEN` read from env only, redacted in
URLs/errors, never returned. Student-visible output is bounded.
