import { z } from "zod";

/**
 * User entity (conflict C4, resolved).
 *
 * The opt-in field is `telemetryOptIn` (not `optInProfile`) everywhere, per the
 * reconciled /docs/architecture.md §3 data model.
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
});

export type User = z.infer<typeof user>;
