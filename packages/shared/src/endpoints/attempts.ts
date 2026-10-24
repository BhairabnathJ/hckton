import { z } from "zod";
import { attempt } from "../entities/attempt.js";

/** POST /attempts — start an attempt; returns an Attempt in status in_progress. */
export const startAttemptRequest = z.object({ ticketId: z.string() });
export const startAttemptResponse = attempt;

/** POST /attempts/:id/submit — submit a PR; returns the Attempt in status grading. */
export const submitAttemptRequest = z.object({ prUrl: z.string().url() });
export const submitAttemptResponse = attempt;

/** GET /attempts/:id — the current attempt and its status. */
export const getAttemptResponse = attempt;

export type StartAttemptRequest = z.infer<typeof startAttemptRequest>;
export type SubmitAttemptRequest = z.infer<typeof submitAttemptRequest>;
