import { z } from "zod";
import { attemptStatus } from "../enums.js";

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
});

export type Attempt = z.infer<typeof attempt>;
