import { z } from "zod";
import { jobStatus, escrowStatus } from "../enums.js";

/**
 * Job entity — one marketplace job (reconciled architecture §3 / §5).
 *
 * Claim state lives on the Job via `claimedByUserId` + `claimExpiresAt`
 * (conflict C6; no separate Claim entity). Escrow lives on `escrowStatus`
 * (conflict C2; no separate EscrowTransaction entity).
 *
 * // MOCK: `escrowStatus` is a demo field; production replacement is a
 * PaymentProvider-driven escrow state (architecture §7).
 */
export const job = z.object({
  id: z.string(),
  companyId: z.string(),
  title: z.string(),
  description: z.string(),
  payCents: z.number().int().nonnegative(),
  timeLimitHours: z.number().int().positive(),
  minLevel: z.number().int().nonnegative(),
  status: jobStatus,
  claimedByUserId: z.string().nullable(),
  claimExpiresAt: z.string().datetime().nullable(),
  escrowStatus: escrowStatus,
});

export type Job = z.infer<typeof job>;
