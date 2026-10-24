/**
 * grader service — the seam `attempts` calls to grade a submission.
 *
 * Thin pass-through to the selected runner (the real `/grader` module adapter,
 * or the offline DemoRunner). The grader NEVER writes the database (§2); it
 * returns a CoreGradeResult that `attempts` persists as a GradeRun + Review.
 */
import type { CoreGradeRequest, CoreGradeResult } from "./types.js";
import { createGraderRunner } from "./runner.js";

export async function grade(req: CoreGradeRequest): Promise<CoreGradeResult> {
  const runner = createGraderRunner();
  return runner.grade(req);
}
