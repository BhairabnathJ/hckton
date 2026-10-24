import { z } from "zod";
import { job } from "./entities/job.js";

/**
 * SSE event names emitted on GET /events (conflict C6).
 *
 * Maps to the reconciled /docs/architecture.md §5 Job state machine:
 * `job.dropped` on entry to `open`, `job.claimed` on claim, and
 * `job.claim_expired` on the `claimed --> expired` transition.
 */
export const sseEventName = z.enum([
  "job.dropped",
  "job.claimed",
  "job.claim_expired",
]);

export const jobDroppedPayload = z.object({
  type: z.literal("job.dropped"),
  job,
});

export const jobClaimedPayload = z.object({
  type: z.literal("job.claimed"),
  job,
  claimedByUserId: z.string(),
});

export const jobClaimExpiredPayload = z.object({
  type: z.literal("job.claim_expired"),
  job, // job.status is "expired" at this point
});

/** Discriminated union of every SSE event payload. */
export const sseEvent = z.discriminatedUnion("type", [
  jobDroppedPayload,
  jobClaimedPayload,
  jobClaimExpiredPayload,
]);

export type SseEventName = z.infer<typeof sseEventName>;
export type JobDroppedPayload = z.infer<typeof jobDroppedPayload>;
export type JobClaimedPayload = z.infer<typeof jobClaimedPayload>;
export type JobClaimExpiredPayload = z.infer<typeof jobClaimExpiredPayload>;
export type SseEvent = z.infer<typeof sseEvent>;
