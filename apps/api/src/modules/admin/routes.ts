/**
 * admin routes (demo-only): POST /admin/tickets/reload.
 *
 * Reloads ticket definitions from the server-only
 * sim-companies/brightline-hidden/tickets.json by upserting them into the
 * Ticket table (real Prisma writes). Restricted to the company-admin demo
 * handle — any other current user is rejected with `unauthorized`.
 */
import { Router } from "express";
import { adminEndpoints } from "@sidequest/shared";
import { asyncHandler } from "../../http/validate.js";
import { requireCompany } from "../users/middleware.js";
import { reloadTickets } from "../tickets/loader.js";
import { dropDemoJob, toContractJob } from "../marketplace/service.js";

/** The seeded company-admin demo handle (// MOCK auth). */
export const ADMIN_HANDLE = "admin";

export const adminRouter: Router = Router();

// POST /admin/tickets/reload — upsert tickets from the hidden manifest.
adminRouter.post(
  "/tickets/reload",
  asyncHandler(async (req, res) => {
    requireCompany(req); // company-only; 403 forbidden otherwise
    const result = await reloadTickets();
    res.json(
      adminEndpoints.reloadTicketsResponse.parse({
        added: result.added,
        total: result.total,
      }),
    );
  }),
);

// POST /admin/jobs/drop-demo — demo-only: drop a fresh open job and publish
// `job.dropped` over SSE (marketplace requirement M1). Company-only.
adminRouter.post(
  "/jobs/drop-demo",
  asyncHandler(async (req, res) => {
    requireCompany(req); // company-only; 403 forbidden otherwise
    const job = await dropDemoJob();
    res.status(201).json(adminEndpoints.dropDemoJobResponse.parse(toContractJob(job)));
  }),
);
