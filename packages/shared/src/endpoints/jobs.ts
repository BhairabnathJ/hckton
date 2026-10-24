import { z } from "zod";
import { job } from "../entities/job.js";

/** GET /jobs — list jobs. */
export const listJobsResponse = z.array(job);

/** POST /jobs — post a job. */
export const postJobRequest = z.object({
  companyId: z.string(),
  title: z.string(),
  description: z.string(),
  payCents: z.number().int().nonnegative(),
  timeLimitHours: z.number().int().positive(),
  minLevel: z.number().int().nonnegative(),
});
export const postJobResponse = job;

/** POST /jobs/:id/claim — FCFS claim; returns the claimed Job. */
export const claimJobResponse = job;

/** POST /jobs/:id/submit — submit a PR for a claimed job. */
export const submitJobRequest = z.object({ prUrl: z.string().url() });
export const submitJobResponse = job;

/** POST /jobs/:id/accept — accept; triggers mock escrow release + payout. */
export const acceptJobResponse = job;

export type PostJobRequest = z.infer<typeof postJobRequest>;
export type SubmitJobRequest = z.infer<typeof submitJobRequest>;
