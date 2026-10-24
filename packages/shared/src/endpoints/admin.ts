import { z } from "zod";
import { job } from "../entities/job.js";

/**
 * POST /admin/jobs/drop — demo-only: create and publish a demo Job (status
 * open) and emit `job.dropped` on the SSE stream.
 */
export const dropDemoJobResponse = job;

/**
 * POST /admin/tickets/reload — admin-only (resolved via the `X-Demo-User: admin`
 * mock auth seam). Re-reads the server-only ticket definitions and upserts any
 * new tickets into the store without a restart.
 *
 * SECURITY (architecture §6): the response carries only counts — it never
 * includes ticket bodies or any hidden-test reference (`hiddenTestPath` /
 * `hiddenTestRef`). The raw ticket-definition shape (which does carry the
 * server-only hidden-test path) is intentionally NOT part of this client
 * contract; it stays inside the API process.
 *
 * - `added`: number of tickets newly upserted on this call (ids not seen before).
 * - `total`: total number of tickets in the store after the reload.
 */
export const reloadTicketsResponse = z.object({
  added: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

export type ReloadTicketsResponse = z.infer<typeof reloadTicketsResponse>;
