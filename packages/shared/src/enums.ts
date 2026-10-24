import { z } from "zod";

/**
 * Attempt lifecycle status.
 *
 * Verbatim from /docs/architecture.md §5 Attempt state machine (conflict C1,
 * resolved in favor of the architecture). The `grading` state powers the UI's
 * "tests running" timeline.
 */
export const attemptStatus = z.enum([
  "in_progress",
  "grading",
  "passed",
  "changes_requested",
  "abandoned",
]);

/**
 * Job lifecycle status.
 *
 * Reconciled /docs/architecture.md §5 Job state machine (conflict C2). `open`
 * is the initial state (formerly `dropped`); `paid` follows `accepted` on the
 * mock payout; `expired` is reached from `claimed` on claim timeout.
 */
export const jobStatus = z.enum([
  "open",
  "claimed",
  "submitted",
  "accepted",
  "paid",
  "expired",
]);

/**
 * Mock escrow status carried on Job.escrowStatus (conflict C2).
 *
 * // MOCK: escrow is modeled as a field on Job for the demo, not a separate
 * entity. Production replacement is Stripe Connect escrow behind a
 * PaymentProvider interface (architecture §7).
 */
export const escrowStatus = z.enum(["funded", "released", "refunded"]);

/** AI hint persona a student can ask (conflict C5: named persona instances). */
export const hintPersona = z.enum(["pm", "coach"]);

/** AI reviewer verdict — the final advisory line of a code review. */
export const reviewVerdict = z.enum(["APPROVE", "REQUEST_CHANGES"]);

/**
 * Demo user role (// MOCK auth).
 *
 * `student` users complete tickets and (at Level 6) claim marketplace jobs.
 * `company` users (the admin demo handle) own the company surface: posting
 * jobs, accepting submissions, and dropping demo jobs. Production replacement
 * (architecture §7) is a real auth/role system behind the same seam.
 */
export const userRole = z.enum(["student", "company"]);

/** Stable, machine-readable error codes used in the canonical error envelope. */
export const errorCode = z.enum([
  "validation_error",
  "not_found",
  "level_gate",
  "forbidden",
  "job_already_claimed",
  "unauthorized",
  "conflict",
  "internal",
]);

export type AttemptStatus = z.infer<typeof attemptStatus>;
export type JobStatus = z.infer<typeof jobStatus>;
export type EscrowStatus = z.infer<typeof escrowStatus>;
export type HintPersona = z.infer<typeof hintPersona>;
export type ReviewVerdict = z.infer<typeof reviewVerdict>;
export type UserRole = z.infer<typeof userRole>;
export type ErrorCode = z.infer<typeof errorCode>;
