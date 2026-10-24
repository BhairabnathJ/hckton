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
  prUrl?: string;
}

/** The normalized grade outcome the `attempts` module persists. */
export interface CoreGradeResult {
  /** Runner-level pass: all hidden tests passed (false on error/timeout). */
  passed: boolean;
  testsPassed: number;
  testsTotal: number;
  /** Failed-test count (testsTotal - testsPassed under the invariant). */
  testsFailed: number;
  /** Failing tests surfaced to the student (bounded; never hidden source). */
  failures: Array<{ name: string; message: string }>;
  /** Review advisory: the AI reviewer said APPROVE. */
  advisoryPass: boolean;
  /** Raw verdict string for the Review summary ("APPROVE" | "REQUEST_CHANGES"). */
  verdict: string;
  /** The AI review text (body). */
  reviewBody: string;
  /** Bounded, sanitized log excerpt (never hidden-test source). */
  logExcerpt: string;
  /** The posted PR review comment URL, when the runner posted one. */
  reviewCommentUrl: string | null;
  /** The PR url associated with this grade (PR path: the submitted PR; workspace: the opened PR). */
  prUrl: string | null;
}

/** What `attempts` passes to the workspace grading seam. */
export interface CoreWorkspaceGradeRequest {
  attemptId: string;
  ticketId: string;
  workspacePath: string;
  studentHandle: string;
}

/** The seam a runner implements. */
export interface GraderRunner {
  readonly name: string;
  grade(req: CoreGradeRequest): Promise<CoreGradeResult>;
}
