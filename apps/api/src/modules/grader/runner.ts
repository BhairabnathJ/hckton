/**
 * Runner selection for the grader seam (Requirement 5.1, 11.2; §9 fallback).
 *
 * GRADER_RUNNER selects the runner:
 *   - "demo"                  -> DemoRunner (offline, deterministic; no GitHub/LLM)
 *   - "subprocess" (default)  -> GraderModuleRunner (the real /grader module; its
 *                                sandbox uses the subprocess runner)
 *   - "docker"                -> GraderModuleRunner (the real /grader module; its
 *                                sandbox uses the Docker runner)
 *
 * The real runner is a THIN ADAPTER over the already-built `/grader` module
 * (`@sidequest/grader`): it calls that module's `grade()` and normalizes the
 * result. core-api does not reimplement cloning, the sandbox, the reviewer, or
 * GitHub comment posting — the grader owns all of that (architecture §2).
 */
import type { CoreGradeRequest, CoreGradeResult, GraderRunner } from "./types.js";

const MAX_LOG = 4000;
function clip(s: string, n = MAX_LOG): string {
  return s.length <= n ? s : s.slice(0, n) + `… [truncated ${s.length - n} chars]`;
}

/**
 * The real runner: a thin adapter that defers to the `/grader` module's
 * `grade()`. The grader resolves the PR, clones it, injects the ticket's hidden
 * tests, runs them in its sandbox (subprocess/docker per its own GRADER_RUNNER),
 * generates the AI review via the LLMProvider seam, and posts the PR comment —
 * then returns a GradeResult we normalize.
 */
export class GraderModuleRunner implements GraderRunner {
  readonly name = "grader-module";

  async grade(req: CoreGradeRequest): Promise<CoreGradeResult> {
    // Dynamic import so the DemoRunner path never loads the grader's GitHub/
    // octokit dependencies. Relative path to the committed /grader module.
    const grader = await import("../../../../../grader/src/index.js");
    const result = await grader.grade({
      attemptId: req.attemptId,
      ticketId: req.ticketId,
      prUrl: req.prUrl,
    });

    return {
      passed: result.passed,
      testsPassed: result.testsPassed,
      testsTotal: result.testsTotal,
      advisoryPass: result.verdict === "APPROVE",
      verdict: result.verdict,
      logExcerpt: clip(result.logExcerpt),
      reviewCommentUrl: result.reviewCommentUrl,
    };
  }
}

/**
 * Offline demo runner: deterministic, no GitHub/LLM. It returns a passing
 * result for the seeded Level 1 ticket so the demo loop completes without
 * network access, and a request-changes result otherwise. Selected with
 * GRADER_RUNNER=demo.
 */
export class DemoRunner implements GraderRunner {
  readonly name = "demo";

  async grade(req: CoreGradeRequest): Promise<CoreGradeResult> {
    const isSeededL1 = req.ticketId === "brightline-l1-pagination";
    if (isSeededL1) {
      return {
        passed: true,
        testsPassed: 2,
        testsTotal: 2,
        advisoryPass: true,
        verdict: "APPROVE",
        logExcerpt: "[demo runner] All hidden tests passed (deterministic demo result).",
        reviewCommentUrl: null,
      };
    }
    return {
      passed: false,
      testsPassed: 0,
      testsTotal: 1,
      advisoryPass: false,
      verdict: "REQUEST_CHANGES",
      logExcerpt: "[demo runner] No deterministic result for this ticket; request changes.",
      reviewCommentUrl: null,
    };
  }
}

/** Select the runner from GRADER_RUNNER (default: the real grader module). */
export function createGraderRunner(): GraderRunner {
  const kind = (process.env.GRADER_RUNNER ?? "subprocess").trim().toLowerCase();
  if (kind === "demo") return new DemoRunner();
  // "subprocess" | "docker" | anything else -> the real grader module, which
  // validates its own GRADER_RUNNER value for the sandbox.
  return new GraderModuleRunner();
}
