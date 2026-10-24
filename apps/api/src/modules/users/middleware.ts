/**
 * Current-user middleware — attaches the resolved demo user to `req`.
 *
 * // MOCK: resolution reads the X-Demo-User header via the users service seam.
 * Production replacement is a real auth middleware behind the same seam (§7).
 * An unknown/missing handle yields 401 `unauthorized`.
 */
import type { Request, Response, NextFunction } from "express";
import type { User as UserRow } from "@prisma/client";
import { AppError } from "../../http/error.js";
import { resolveDemoUser } from "./service.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      currentUser?: UserRow;
    }
  }
}

export function currentUser(req: Request, _res: Response, next: NextFunction): void {
  resolveDemoUser(req.header("X-Demo-User"))
    .then((user) => {
      if (!user) {
        throw AppError.unauthorized(
          "Unknown or missing X-Demo-User. Set the X-Demo-User header to a seeded demo handle.",
        );
      }
      req.currentUser = user;
      next();
    })
    .catch(next);
}

/** Read the attached current user or throw (routes mounted behind `currentUser`). */
export function requireUser(req: Request): UserRow {
  if (!req.currentUser) throw AppError.unauthorized("No current user resolved.");
  return req.currentUser;
}

/**
 * Authorize the current user as the `company` (admin) account.
 *
 * // MOCK auth: the seeded company demo user carries `role: "company"` (the
 * admin handle). Only that user may post jobs, accept submissions, or drop demo
 * jobs; everyone else gets 403 `forbidden`. Production replacement is a real
 * role/authorization check behind this same seam (§7).
 */
export function requireCompany(req: Request): UserRow {
  const me = requireUser(req);
  if (me.role !== "company") {
    throw AppError.forbidden("Only the company account may perform this action.");
  }
  return me;
}
