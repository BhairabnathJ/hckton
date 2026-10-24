/**
 * grader service — the seam `attempts` calls to grade a submission.
 *
 * Thin pass-through to the selected runner (the real `/grader` module adapter,
 * or the offline DemoRunner). The grader NEVER writes the database (§2); it
 * returns a CoreGradeResult that `attempts` persists as a GradeRun + Review.
 */
import type {
  CoreGradeRequest,
  CoreGradeResult,
  CoreWorkspaceGradeRequest,
} from "./types.js";
import { createGraderRunner } from "./runner.js";

export async function grade(req: CoreGradeRequest): Promise<CoreGradeResult> {
  const runner = createGraderRunner();
  return runner.grade(req);
}

const MAX_LOG = 4000;
function clip(s: string, n = MAX_LOG): string {
  return s.length <= n ? s : s.slice(0, n) + `… [truncated ${s.length - n} chars]`;
}

/**
 * Grade a browser workspace (browser-workspace spec). In the offline `demo`
 * runner mode this reuses the DemoRunner for a deterministic result; otherwise
 * it defers to the real `/grader` module's `gradeWorkspace()`, which copies the
 * workspace, injects hidden tests, runs them, reviews the diff, and (by default)
 * opens a PR + posts the review comment.
 */
export async function gradeWorkspace(
  req: CoreWorkspaceGradeRequest,
): Promise<CoreGradeResult> {
  const kind = (process.env.GRADER_RUNNER ?? "subprocess").trim().toLowerCase();
  if (kind === "demo") {
    // Deterministic offline path — reuse the DemoRunner verdict by ticket id.
    const runner = createGraderRunner();
    return runner.grade({ attemptId: req.attemptId, ticketId: req.ticketId });
  }

  const grader = await import("../../../../../grader/src/index.js");
  const result = await grader.gradeWorkspace({
    attemptId: req.attemptId,
    ticketId: req.ticketId,
    workspacePath: req.workspacePath,
    studentHandle: req.studentHandle,
  });
  return {
    passed: result.passed,
    testsPassed: result.testsPassed,
    testsTotal: result.testsTotal,
    testsFailed: result.testsFailed,
    failures: (result.failures ?? []).map((f) => ({ name: f.test, message: f.message })),
    advisoryPass: result.verdict === "APPROVE",
    verdict: result.verdict,
    reviewBody: result.reviewBody ?? "",
    logExcerpt: clip(result.logExcerpt),
    reviewCommentUrl: result.reviewCommentUrl,
    prUrl: result.prUrl ?? null,
  };
}
