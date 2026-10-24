/**
 * progression service (architecture §2 progression).
 *
 * OWNS XP math and level computation — no other module computes XP or level.
 *
 *   delta = 100                              // clear a ticket
 *         + (hintsUsed === 0 ? 25 : 0)       // clean-solve bonus
 *         - 10 * max(0, reviewRounds - 2)    // penalty beyond 2 review rounds
 *   xp    = max(0, xp + delta)               // XP never negative
 *   level = floor(xp / 100) + 1
 *
 * Publishes `xp.awarded` and (on a level increase) `level.up` through the
 * events hub. Answers the Level 6 gate from the persisted level.
 */
import type { Attempt } from "@prisma/client";
import { prisma } from "../../db.js";
import { publish } from "../events/service.js";

export function computeDelta(hintsUsed: number, reviewRounds: number): number {
  const base = 100;
  const cleanBonus = hintsUsed === 0 ? 25 : 0;
  const penalty = 10 * Math.max(0, reviewRounds - 2);
  return base + cleanBonus - penalty;
}

export function computeLevel(xp: number): number {
  return Math.floor(xp / 100) + 1;
}

export interface AwardResult {
  delta: number;
  xp: number;
  level: number;
  leveledUp: boolean;
}

/** Award XP for a passing attempt and persist xp + level atomically. */
export async function awardForAttempt(attempt: Attempt): Promise<AwardResult> {
  const delta = computeDelta(attempt.hintsUsed, attempt.reviewRounds);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: attempt.userId } });
    const newXp = Math.max(0, user.xp + delta);
    const newLevel = computeLevel(newXp);
    const leveledUp = newLevel > user.level;
    await tx.user.update({
      where: { id: user.id },
      data: { xp: newXp, level: newLevel },
    });
    return { userId: user.id, newXp, newLevel, leveledUp };
  });

  publish({ type: "xp.awarded", userId: result.userId, delta, xp: result.newXp });
  if (result.leveledUp) {
    publish({ type: "level.up", userId: result.userId, level: result.newLevel });
  }

  return { delta, xp: result.newXp, level: result.newLevel, leveledUp: result.leveledUp };
}

/** The Level 6 gate, read from the persisted level (consumed by marketplace). */
export async function isLevel6OrAbove(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { level: true } });
  return (user?.level ?? 0) >= 6;
}
