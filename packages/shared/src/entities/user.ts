import { z } from "zod";
import { userRole } from "../enums.js";

/**
 * User entity (conflict C4, resolved).
 *
 * The opt-in field is `telemetryOptIn` (not `optInProfile`) everywhere, per the
 * reconciled /docs/architecture.md §3 data model. `role` (// MOCK auth) marks
 * the demo user as a `student` or the `company` (admin) account.
 */
export const user = z.object({
  id: z.string(),
  handle: z.string(),
  name: z.string(),
  school: z.string(),
  xp: z.number().int().nonnegative(),
  level: z.number().int().nonnegative(),
  rating: z.number().min(0).max(5),
  workAuthorized: z.boolean(),
  telemetryOptIn: z.boolean(),
  role: userRole,
});

export type User = z.infer<typeof user>;
