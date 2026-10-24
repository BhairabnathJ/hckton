/**
 * users service (architecture §2 users).
 *
 * Owns: user records, the profile/level read surface, demo auth resolution from
 * the X-Demo-User header (// MOCK), and the Level 6 gate check consumed by the
 * downstream marketplace spec.
 */
import type { User as UserRow } from "@prisma/client";
import type { User } from "@sidequest/shared";
import { prisma } from "../../db.js";
import { AppError } from "../../http/error.js";

/** Map a Prisma User row to the contract `user` shape (drops createdAt). */
export function toContractUser(row: UserRow): User {
  return {
    id: row.id,
    handle: row.handle,
    name: row.name,
    school: row.school,
    xp: row.xp,
    level: row.level,
    rating: row.rating,
    workAuthorized: row.workAuthorized,
    telemetryOptIn: row.telemetryOptIn,
    role: row.role as User["role"],
  };
}

/**
 * // MOCK: resolve the current user from the `X-Demo-User` header value.
 *
 * Production replacement (architecture §7): a real auth middleware
 * (session/JWT/OAuth) resolves the authenticated user behind this same
 * "resolve current user" seam, leaving every downstream route unchanged. An
 * unknown handle resolves to `undefined` so the caller returns 401.
 */
export async function resolveDemoUser(handle: string | undefined): Promise<UserRow | undefined> {
  const h = handle && handle.trim() !== "" ? handle.trim() : undefined;
  if (!h) return undefined;
  return (await prisma.user.findUnique({ where: { handle: h } })) ?? undefined;
}

export async function getById(id: string): Promise<UserRow> {
  const row = await prisma.user.findUnique({ where: { id } });
  if (!row) throw AppError.notFound(`User "${id}" not found.`);
  return row;
}

export async function setTelemetryOptIn(id: string, telemetryOptIn: boolean): Promise<UserRow> {
  return prisma.user.update({ where: { id }, data: { telemetryOptIn } });
}

/** The Level 6 gate check consumed by the downstream marketplace spec. */
export async function isLevel6OrAbove(userId: string): Promise<boolean> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { level: true } });
  return (row?.level ?? 0) >= 6;
}
