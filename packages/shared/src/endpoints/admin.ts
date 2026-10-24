import { job } from "../entities/job.js";

/**
 * POST /admin/jobs/drop — demo-only: create and publish a demo Job (status
 * open) and emit `job.dropped` on the SSE stream.
 */
export const dropDemoJobResponse = job;
