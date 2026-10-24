/**
 * The grade() orchestrator (grader spec §4a, Requirement 1 + 9).
 *
 * Synchronous in the demo-critical scope (no queue): resolve PR -> shallow
 * clone -> inject hidden tests -> sandbox run -> diff -> AI review -> post
 * comment -> GradeResult. A ResourceStack guarantees cleanup of the temp dir
 * (and container, for the Docker runner) on success, error, and timeout.
 */
import { mkdtemp, rm } from "node:fs/promises";
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

    return toGradeResult(outcome, reviewOut.verdict, commentUrl);
  } finally {
    await stack.dispose(); // always — success, error, timeout
  }
}
