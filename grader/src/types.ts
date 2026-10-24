/**
 * Grader types (grader spec, conflict G1 reconciled GradeResult superset).
 * Conforms to /docs/architecture.md §4a/§6.
 */

export interface GradeRequest {
  attemptId: string;
  ticketId: string;
  prUrl: string;
}

/** A single failing test. `message` is bounded and never hidden-test source. */
export interface Failure {
  test: string;
  message: string;
}

/** The raw outcome of a sandbox pytest run. */
export interface SandboxOutcome {
  passed: boolean;
  testsPassed: number;
  testsFailed: number;
  failures: Failure[];
  logExcerpt: string; // bounded; never hidden-test source
  timedOut: boolean;
}

export type Verdict = "APPROVE" | "REQUEST_CHANGES";

/**
 * The grader's return contract (superset per G1): carries the architecture
 * fields (passed, testsPassed, testsTotal, logExcerpt) plus the demo-facing
 * fields (testsFailed, failures, verdict, reviewCommentUrl).
 */
export interface GradeResult {
  passed: boolean;
  testsPassed: number;
  testsFailed: number;
  testsTotal: number;
  failures: Failure[];
  logExcerpt: string;
  verdict: Verdict;
  reviewCommentUrl: string | null;
  /** The AI review text (body). Present for both PR and workspace grading. */
  reviewBody?: string;
  /** The opened/submitted PR url, when one exists. */
  prUrl?: string | null;
}

/**
 * Build a GradeResult from a sandbox outcome + verdict + comment url, enforcing
 * the invariants: testsTotal = testsPassed + testsFailed, and passed is true
 * only when there is at least one test and none failed.
 */
export function toGradeResult(
  outcome: SandboxOutcome,
  verdict: Verdict,
  reviewCommentUrl: string | null,
): GradeResult {
  const testsTotal = outcome.testsPassed + outcome.testsFailed;
  const passed =
    testsTotal > 0 && outcome.testsFailed === 0 && outcome.testsPassed === testsTotal;
  return {
    passed,
    testsPassed: outcome.testsPassed,
    testsFailed: outcome.testsFailed,
    testsTotal,
    failures: outcome.failures,
    logExcerpt: outcome.logExcerpt,
    verdict,
    reviewCommentUrl,
  };
}
