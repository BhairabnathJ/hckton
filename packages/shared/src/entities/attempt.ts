import { z } from "zod";
import { attemptStatus, reviewVerdict } from "../enums.js";

/** A single failing test surfaced to the student (bounded; never hidden source). */
export const testFailure = z.object({
  name: z.string(),
  message: z.string(),
});

/** Attempt entity — one student's work on one ticket. */
export const attempt = z.object({
  id: z.string(),
  userId: z.string(),
  ticketId: z.string(),
  status: attemptStatus,
  prUrl: z.string().url().nullable(),
  testRuns: z.number().int().nonnegative(),
  reviewRounds: z.number().int().nonnegative(),
  hintsUsed: z.number().int().nonnegative(),
  // Grade detail — filled after a submit resolves (both the PR-URL and the
  // browser-workspace paths). Null/absent on a freshly started attempt.
  testsPassed: z.number().int().nonnegative().nullable().optional(),
  testsFailed: z.number().int().nonnegative().nullable().optional(),
  failures: z.array(testFailure).optional(),
  verdict: reviewVerdict.nullable().optional(),
  reviewBody: z.string().nullable().optional(),
  reviewCommentUrl: z.string().url().nullable().optional(),
});

export type TestFailure = z.infer<typeof testFailure>;
export type Attempt = z.infer<typeof attempt>;
