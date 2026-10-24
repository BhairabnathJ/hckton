/**
 * attempts service (architecture §2 attempts, §4a, §5 state machine).
 *
 * Owns the attempt lifecycle and orchestrates the learning loop:
 *   start -> submit (grade INLINE, Option B synchronous) -> resolve.
 *
 * Delegates grading to the `grader` seam (the real /grader module adapter or
 * the DemoRunner) and XP to `progression`; publishes attempt updates through
 * `events`. Verdict rule (Requirement 5.3-5.5):
 *
 *   passed  iff  testsTotal > 0 && testsPassed === testsTotal && advisoryPass
 *   else    changes_requested  (and reviewRounds++)
 *
 * A runner error/timeout yields passed:false, so it can only ever land in
 * changes_requested — a failed run can never pass an attempt.
 */
import type { Attempt as AttemptRow, User as UserRow } from "@prisma/client";
import type { Attempt } from "@sidequest/shared";
import { prisma } from "../../db.js";
import { AppError } from "../../http/error.js";
import { grade as runGrade, gradeWorkspace as runGradeWorkspace } from "../grader/service.js";
import type { CoreGradeResult } from "../grader/types.js";
import { awardForAttempt } from "../progression/service.js";
import { publish } from "../events/service.js";
import { record as recordTelemetry } from "../telemetry/service.js";

/** Map a Prisma Attempt row to the contract `attempt` shape. */
export function toContractAttempt(row: AttemptRow): Attempt {
  return {
    id: row.id,
    userId: row.userId,
    ticketId: row.ticketId,
    status: row.status as Attempt["status"],
    prUrl: row.prUrl,
    testRuns: row.testRuns,
    reviewRounds: row.reviewRounds,
    hintsUsed: row.hintsUsed,
    testsPassed: row.testsPassed,
    testsFailed: row.testsFailed,
    failures: row.failuresJson
      ? (JSON.parse(row.failuresJson) as Array<{ name: string; message: string }>)
      : [],
    verdict: (row.verdict as Attempt["verdict"]) ?? null,
    reviewBody: row.reviewBody,
    reviewCommentUrl: row.reviewCommentUrl,
  };
}

/** POST /attempts — start an attempt (level-gated). */
export async function start(user: UserRow, ticketId: string): Promise<AttemptRow> {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw AppError.notFound(`Ticket "${ticketId}" not found.`);
  if (ticket.level > user.level) {
    throw AppError.levelGate(
      `Ticket "${ticketId}" is level ${ticket.level}; your level is ${user.level}.`,
    );
  }

  const attempt = await prisma.attempt.create({
    data: {
      userId: user.id,
      ticketId,
      branch: ticket.branch, // intended working branch; GitHub seam is tolerant (§9)
      status: "in_progress",
      prUrl: null,
      testRuns: 0,
      reviewRounds: 0,
      hintsUsed: 0,
    },
  });
  recordTelemetry(user.id, "attempt.started", { ticketId });
  return attempt;
}

export async function getById(id: string): Promise<AttemptRow> {
  const row = await prisma.attempt.findUnique({ where: { id } });
  if (!row) throw AppError.notFound(`Attempt "${id}" not found.`);
  return row;
}

/**
 * POST /attempts/:id/submit — record the PR, grade INLINE, apply the verdict,
 * award XP on a pass, and return the resolved attempt. Responds 202 per the
 * contract (the body is already resolved under synchronous grading).
 */
export async function submit(id: string, prUrl: string): Promise<AttemptRow> {
  const existing = await getById(id);
  if (existing.status === "passed") {
    throw AppError.conflict(`Attempt "${id}" has already passed; it cannot be re-submitted.`);
  }

  // Enter grading; count this run.
  const grading = await prisma.attempt.update({
    where: { id },
    data: { prUrl, status: "grading", testRuns: { increment: 1 } },
  });

  // Grade inline via the grader seam (real /grader module or DemoRunner).
  const result = await runGrade({
    attemptId: grading.id,
    ticketId: grading.ticketId,
    prUrl,
  });

  return resolveGrade(grading, result);
}

/**
 * POST /attempts/:id/workspace/submit — grade the in-browser workspace INLINE
 * through the same verdict + XP machinery as the PR path. The workspace path is
 * already created; grading copies it to a temp dir and injects hidden tests
 * (never into the workspace itself).
 */
export async function submitWorkspace(
  id: string,
  workspacePath: string,
  studentHandle: string,
): Promise<AttemptRow> {
  const existing = await getById(id);
  if (existing.status === "passed") {
    throw AppError.conflict(`Attempt "${id}" has already passed; it cannot be re-submitted.`);
  }

  const grading = await prisma.attempt.update({
    where: { id },
    data: { status: "grading", testRuns: { increment: 1 } },
  });

  const result = await runGradeWorkspace({
    attemptId: grading.id,
    ticketId: grading.ticketId,
    workspacePath,
    studentHandle,
  });

  return resolveGrade(grading, result);
}

/**
 * Shared verdict/persistence path used by BOTH submit flows (PR + workspace).
 *
 * Verdict rule (unchanged): passed iff testsTotal > 0 && all tests pass &&
 * advisoryPass. A runner error/timeout yields passed:false, so a failed run can
 * only ever land in changes_requested. Persists the GradeRun, the Review, and
 * the grade-detail fields, awards XP on a pass, publishes the event, and returns
 * the resolved attempt row.
 */
async function resolveGrade(grading: AttemptRow, result: CoreGradeResult): Promise<AttemptRow> {
  const allTestsPass = result.testsTotal > 0 && result.testsPassed === result.testsTotal;
  const passed = allTestsPass && result.advisoryPass;

  await prisma.gradeRun.create({
    data: {
      attemptId: grading.id,
      passed: result.passed,
      testsPassed: result.testsPassed,
      testsTotal: result.testsTotal,
      logExcerpt: result.logExcerpt,
    },
  });
  await upsertReview(grading.id, result.verdict, result.advisoryPass, result.reviewCommentUrl);

  // Grade-detail fields surfaced on the attempt (both paths, R5).
  const detail = {
    testsPassed: result.testsPassed,
    testsFailed: result.testsFailed,
    failuresJson: JSON.stringify(result.failures ?? []),
    verdict: result.verdict,
    reviewBody: result.reviewBody,
    reviewCommentUrl: result.reviewCommentUrl,
    prUrl: result.prUrl ?? grading.prUrl,
  };

  let resolved: AttemptRow;
  if (passed) {
    resolved = await prisma.attempt.update({
      where: { id: grading.id },
      data: { status: "passed", ...detail },
    });
    const award = await awardForAttempt(resolved);
    publish({
      type: "attempt.passed",
      attemptId: resolved.id,
      userId: resolved.userId,
      xp: award.xp,
      level: award.level,
    });
    recordTelemetry(resolved.userId, "attempt.passed", {
      ticketId: resolved.ticketId,
      xpDelta: award.delta,
    });
  } else {
    resolved = await prisma.attempt.update({
      where: { id: grading.id },
      data: { status: "changes_requested", reviewRounds: { increment: 1 }, ...detail },
    });
    publish({
      type: "attempt.changes_requested",
      attemptId: resolved.id,
      userId: resolved.userId,
      testsPassed: result.testsPassed,
      testsTotal: result.testsTotal,
    });
    recordTelemetry(resolved.userId, "attempt.changes_requested", {
      ticketId: resolved.ticketId,
    });
  }
  return resolved;
}

/** Create or replace the single advisory Review for an attempt. */
async function upsertReview(
  attemptId: string,
  verdict: string,
  advisoryPass: boolean,
  reviewCommentUrl: string | null,
): Promise<void> {
  const summary = reviewCommentUrl
    ? `AI review: ${verdict} (comment: ${reviewCommentUrl})`
    : `AI review: ${verdict}`;
  const commentsJson = JSON.stringify({ verdict, reviewCommentUrl });
  await prisma.review.upsert({
    where: { attemptId },
    create: { attemptId, personaId: "coach", summary, commentsJson, advisoryPass },
    update: { personaId: "coach", summary, commentsJson, advisoryPass },
  });
}
