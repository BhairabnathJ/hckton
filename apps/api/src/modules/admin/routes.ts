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
import { AppError } from "../../http/error.js";
import { requireUser } from "../users/middleware.js";
import { reloadTickets } from "../tickets/loader.js";

/** The seeded company-admin demo handle (// MOCK auth). */
export const ADMIN_HANDLE = "admin";

export const adminRouter: Router = Router();

// POST /admin/tickets/reload — upsert tickets from the hidden manifest.
adminRouter.post(
  "/tickets/reload",
  asyncHandler(async (req, res) => {
    const me = requireUser(req);
    if (me.handle !== ADMIN_HANDLE) {
      throw AppError.unauthorized("Only the company-admin demo user may reload tickets.");
    }
    const result = await reloadTickets();
    res.json(
      adminEndpoints.reloadTicketsResponse.parse({
        added: result.added,
        total: result.total,
      }),
    );
  }),
);
