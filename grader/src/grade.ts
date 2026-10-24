/**
 * The grade() orchestrator (grader spec §4a, Requirement 1 + 9).
 *
 * Synchronous in the demo-critical scope (no queue): resolve PR -> shallow
 * clone -> inject hidden tests -> sandbox run -> diff -> AI review -> post
 * comment -> GradeResult. A ResourceStack guarantees cleanup of the temp dir
 * (and container, for the Docker runner) on success, error, and timeout.
 */
import { mkdtemp, rm, cp } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "./config.js";
import { GitHub } from "./github.js";
import { loadTicket, copyHiddenTests } from "./tickets.js";
import { createSandboxRunner } from "./runners/index.js";
import { review } from "./reviewer.js";
import { ResourceStack } from "./cleanup.js";
import { toGradeResult, type GradeRequest, type GradeResult } from "./types.js";

export async function grade(req: GradeRequest): Promise<GradeResult> {
  const cfg = loadConfig({ requireGithub: true });
  const gh = new GitHub(cfg.githubToken);
  const stack = new ResourceStack();

  try {
    // 1. Resolve the PR head and 2. shallow-clone it.
    const head = await gh.resolvePrHead(req.prUrl);
    const cloneDir = await mkdtemp(join(tmpdir(), "grader-clone-"));
    stack.defer(() => rm(cloneDir, { recursive: true, force: true }));
    await gh.shallowClone(head, cloneDir);

    // 3. Look up the ticket and copy its hidden tests into the clone.
    const ticket = loadTicket(req.ticketId);
    copyHiddenTests(ticket, cloneDir);

    // 4. Run pytest in the sandbox under enforced limits.
    const runner = createSandboxRunner(cfg.runner);
    const outcome = await runner.run({
      cloneDir,
      reportPath: join(cloneDir, ".grader-report.json"),
      timeoutMs: 60_000,
      memoryMb: 512,
      cpus: 1,
    });

    // 5. Get the PR diff and 6. generate the AI review.
    let diff = "";
    try {
      diff = await gh.getDiff(req.prUrl);
    } catch {
      diff = "(diff unavailable)";
    }
    const reviewOut = await review({ diff, ticket, outcome });

    // 7. Post the review as a PR comment.
    const commentUrl = await gh.postComment(req.prUrl, reviewOut.text);

    const result = toGradeResult(outcome, reviewOut.verdict, commentUrl);
    return { ...result, reviewBody: reviewOut.text, prUrl: req.prUrl };
  } finally {
    await stack.dispose(); // always — success, error, timeout
  }
}

/** Run a git command in `cwd`, resolving with stdout (throws on non-zero). */
function git(args: string[], cwd: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("git", args, { cwd, env: process.env });
    let out = "";
    let err = "";
    child.stdout?.on("data", (d) => (out += d.toString()));
    child.stderr?.on("data", (d) => (err += d.toString()));
    child.on("close", (code) =>
      code === 0 ? resolvePromise(out) : reject(new Error(`git ${args[0]} failed: ${err.slice(0, 300)}`)),
    );
    child.on("error", reject);
  });
}

export interface WorkspaceGradeRequest {
  attemptId: string;
  ticketId: string;
  workspacePath: string;
  studentHandle: string;
}

/**
 * Grade an in-browser workspace (browser-workspace spec R4). Reuses the runner,
 * report parsing, and reviewer. Hidden tests are added ONLY to a temp copy, never
 * to the student's workspace.
 *
 * 1. Copy workspace -> temp, inject hidden tests, run sandbox.
 * 2. `git diff <ticket.branch>` in the workspace -> Gemini reviewer.
 * 3. If WORKSPACE_OPEN_PR !== "false": commit+push a branch, open a PR (base =
 *    ticket branch), post the review comment. Any GitHub failure -> grading still
 *    completes with reviewCommentUrl = null.
 */
export async function gradeWorkspace(req: WorkspaceGradeRequest): Promise<GradeResult> {
  // GitHub is only required when we intend to open a PR.
  const openPr = (process.env.WORKSPACE_OPEN_PR ?? "true").trim().toLowerCase() !== "false";
  const cfg = loadConfig({ requireGithub: openPr });
  const stack = new ResourceStack();
  const ticket = loadTicket(req.ticketId);

  try {
    // 1. Copy the workspace into a throwaway temp dir (excluding .git) and add
    //    the hidden tests there — the workspace itself is never touched.
    const gradeDir = await mkdtemp(join(tmpdir(), "grader-ws-"));
    stack.defer(() => rm(gradeDir, { recursive: true, force: true }));
    await cp(req.workspacePath, gradeDir, {
      recursive: true,
      filter: (src) => {
        // Exclude the .git directory (and anything under it) from the grade copy.
        const rel = src.slice(req.workspacePath.length);
        return !/(^|\/)\.git(\/|$)/.test(rel);
      },
    });
    // Belt-and-braces: ensure no .git remains in the grade dir.
    await rm(join(gradeDir, ".git"), { recursive: true, force: true }).catch(() => {});
    copyHiddenTests(ticket, gradeDir);

    // 2. Run pytest in the sandbox under enforced limits.
    const runner = createSandboxRunner(cfg.runner);
    const outcome = await runner.run({
      cloneDir: gradeDir,
      reportPath: join(gradeDir, ".grader-report.json"),
      timeoutMs: 60_000,
      memoryMb: 512,
      cpus: 1,
    });

    // 3. Diff the workspace against the ticket branch for the reviewer.
    let diff = "";
    try {
      diff = await git(["diff", ticket.branch], req.workspacePath);
      if (!diff.trim()) diff = "(no changes against the ticket branch)";
    } catch {
      diff = "(diff unavailable)";
    }
    const reviewOut = await review({ diff, ticket, outcome });

    // 4. Optionally open a PR for the workspace changes and post the review.
    let commentUrl: string | null = null;
    let prUrl: string | null = null;
    if (openPr) {
      try {
        const gh = new GitHub(cfg.githubToken);
        const { owner, repo } = GitHub.parseRepoUrl(BRIGHTLINE_ORIGIN);
        const branch = `sq/${req.studentHandle}/${req.ticketId}-${req.attemptId}`;
        await gh.pushWorkspaceBranch(
          req.workspacePath,
          branch,
          owner,
          repo,
          `SideQuest: ${req.studentHandle} on ${req.ticketId} (attempt ${req.attemptId})`,
        );
        const pr = await gh.openPr({
          owner,
          repo,
          head: branch,
          base: ticket.branch,
          title: `[SideQuest] ${ticket.title} — ${req.studentHandle}`,
          body: "Automated SideQuest workspace submission.",
        });
        prUrl = pr.htmlUrl;
        commentUrl = await gh.postComment(pr.htmlUrl, reviewOut.text);
      } catch (err) {
        // R4: any GitHub failure must not fail grading.
        console.warn(`Workspace PR step failed (grading continues): ${(err as Error).message}`);
        commentUrl = null;
      }
    }

    const result = toGradeResult(outcome, reviewOut.verdict, commentUrl);
    return { ...result, reviewBody: reviewOut.text, prUrl };
  } finally {
    await stack.dispose();
  }
}

/** The demo origin the workspace branch is pushed to (browser-workspace R4). */
const BRIGHTLINE_ORIGIN = "https://github.com/BhairabnathJ/brightline.git";
