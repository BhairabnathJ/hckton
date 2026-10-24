/**
 * grader seam types (internal, server-only — NEVER serialized to a client).
 *
 * core-api consumes the already-built `/grader` module (build-plan spec #3).
 * This seam normalizes the grader's `GradeResult` into the shape `attempts`
 * needs to persist a GradeRun + Review and apply the verdict. The student-
 * facing data is limited to counts + a bounded logExcerpt (architecture §6).
 */

/** What `attempts` passes to the seam to grade one submission. */
export interface CoreGradeRequest {
  attemptId: string;
  ticketId: string;
  prUrl: string;
}

/** The normalized grade outcome the `attempts` module persists. */
export interface CoreGradeResult {
  /** Runner-level pass: all hidden tests passed (false on error/timeout). */
  passed: boolean;
  testsPassed: number;
  testsTotal: number;
  /** Review advisory: the AI reviewer said APPROVE. */
  advisoryPass: boolean;
  /** Raw verdict string for the Review summary ("APPROVE" | "REQUEST_CHANGES"). */
  verdict: string;
  /** Bounded, sanitized log excerpt (never hidden-test source). */
  logExcerpt: string;
  /** The posted PR review comment URL, when the runner posted one. */
  reviewCommentUrl: string | null;
}

/** The seam a runner implements. */
export interface GraderRunner {
  readonly name: string;
  grade(req: CoreGradeRequest): Promise<CoreGradeResult>;
}
