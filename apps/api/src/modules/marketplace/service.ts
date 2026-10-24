/**
 * marketplace service (architecture §2 marketplace, §5 Job state machine).
 *
 * Owns job drop, claim, submit, accept, and mock escrow. Reads the Level 6 gate
 * from `users` and publishes `job.*` events through the `events` hub. Does NOT
 * own real payments — escrow release and payout are `// MOCK` (§7), isolated so
 * a production PaymentProvider swaps in without touching routes.
 *
 * The FCFS claim is a SINGLE conditional database update
 * (`UPDATE ... WHERE id = ? AND status = 'open'`), so a job can never be
 * double-claimed: exactly one concurrent caller wins (§9 claim-race mitigation),
 * and the losers get HTTP 409 `job_already_claimed`.
 */
import type { Job as JobRow } from "@prisma/client";
import type { Job } from "@sidequest/shared";
import { prisma } from "../../db.js";
import { AppError } from "../../http/error.js";
import { isLevel6OrAbove } from "../users/service.js";
import { publish } from "../events/service.js";

/** Map a Prisma Job row to the contract `job` shape. */
export function toContractJob(row: JobRow): Job {
  return {
    id: row.id,
    companyId: row.companyId,
    title: row.title,
    description: row.description,
    payCents: row.payCents,
    timeLimitHours: row.timeLimitHours,
    minLevel: row.minLevel,
    status: row.status as Job["status"],
    claimedByUserId: row.claimedByUserId,
    claimExpiresAt: row.claimExpiresAt ? row.claimExpiresAt.toISOString() : null,
    escrowStatus: row.escrowStatus as Job["escrowStatus"],
  };
}

/** GET /jobs — list every job. */
export async function list(): Promise<JobRow[]> {
  return prisma.job.findMany({ orderBy: { droppedAt: "desc" } });
}

export async function getById(id: string): Promise<JobRow> {
  const row = await prisma.job.findUnique({ where: { id } });
  if (!row) throw AppError.notFound(`Job "${id}" not found.`);
  return row;
}

/**
 * POST /jobs/:id/claim — FCFS claim, Level 6 gated.
 *
 * The claim is an atomic conditional update: `updateMany` with the guard
 * `status: "open"` succeeds for exactly one caller even under concurrency.
 * A count of 0 means the job was already claimed (or not open) → 409.
 */
export async function claim(id: string, userId: string): Promise<JobRow> {
  const job = await getById(id); // 404 if the job does not exist

  // Level 6 gate (read from users/progression).
  if (!(await isLevel6OrAbove(userId))) {
    throw AppError.levelGate("Claiming a marketplace job requires Level 6 or above.");
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + job.timeLimitHours * 3_600_000);

  // Atomic conditional claim: only one concurrent caller flips open -> claimed.
  const result = await prisma.job.updateMany({
    where: { id, status: "open" },
    data: {
      status: "claimed",
      claimedByUserId: userId,
      claimExpiresAt: expiresAt,
    },
  });

  if (result.count === 0) {
    // Lost the race (or the job was never open).
    throw new AppError("job_already_claimed", 409, "This job has already been claimed.");
  }

  const claimed = await getById(id);
  publish({ type: "job.claimed", job: toContractJob(claimed), claimedByUserId: userId });
  return claimed;
}

/** POST /jobs/:id/submit — record the PR on a claimed job (claimed -> submitted). */
export async function submit(id: string, userId: string, prUrl: string): Promise<JobRow> {
  const job = await getById(id);
  if (job.status !== "claimed") {
    throw AppError.conflict(`Job "${id}" is ${job.status}; only a claimed job can be submitted.`);
  }
  if (job.claimedByUserId !== userId) {
    throw AppError.conflict("Only the claimant may submit this job.");
  }
  return prisma.job.update({
    where: { id },
    data: { status: "submitted", prUrl },
  });
}

/**
 * POST /jobs/:id/accept — accept a submission.
 *
 * // MOCK: escrow release on accept (architecture §7). In production this is a
 * `PaymentProvider.releaseEscrow(jobId)` call behind the same seam; here we flip
 * `escrowStatus` to `released` and move the job `accepted -> paid` via the mock
 * payout. The route/service contract is unchanged when the mock is replaced.
 */
export async function accept(id: string): Promise<JobRow> {
  const job = await getById(id);
  if (job.status !== "submitted") {
    throw AppError.conflict(`Job "${id}" is ${job.status}; only a submitted job can be accepted.`);
  }

  // MOCK: release escrow, then run the mock payout to completion (accepted -> paid).
  const accepted = await prisma.job.update({
    where: { id },
    data: {
      status: "paid", // MOCK payout completes immediately for the demo
      escrowStatus: "released", // MOCK escrow release on accept
    },
  });
  return accepted;
}

/**
 * POST /admin/jobs/drop-demo — demo-only: create a fresh `open` job and publish
 * `job.dropped` on the SSE stream (marketplace requirement M1). Fixed at $75 /
 * 4 hours / minLevel 6, escrow `funded`.
 */
export async function dropDemoJob(): Promise<JobRow> {
  // Pick any seeded company to own the demo job.
  const company = await prisma.company.findFirst();
  if (!company) {
    throw AppError.internal("No company seeded; run `npm run seed` before dropping a demo job.");
  }

  const job = await prisma.job.create({
    data: {
      companyId: company.id,
      title: "DEMO: Fix the checkout totals rounding bug",
      description: "A freshly dropped demo job for the live marketplace flow.",
      payCents: 7500, // $75 (M1)
      timeLimitHours: 4, // (M1)
      minLevel: 6,
      status: "open",
      escrowStatus: "funded", // // MOCK
    },
  });

  publish({ type: "job.dropped", job: toContractJob(job) });
  return job;
}
