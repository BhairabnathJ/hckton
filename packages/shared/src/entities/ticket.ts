import { z } from "zod";

/**
 * Ticket entity — the client-facing (Public_Ticket_View) shape.
 *
 * SECURITY (architecture §6): this schema deliberately has NO `hiddenTestRef`
 * (or any hidden-test reference). The field does not exist here, so it cannot
 * be serialized to a client and any attempt to leak it fails type-check.
 */
export const ticket = z.object({
  id: z.string(),
  simCompanyId: z.string(),
  level: z.number().int().positive(),
  title: z.string(),
  description: z.string(),
  acceptanceCriteria: z.array(z.string()).min(1),
  branch: z.string(),
});

export type Ticket = z.infer<typeof ticket>;
