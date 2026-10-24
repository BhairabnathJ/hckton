/**
 * tickets service (architecture §2 tickets).
 *
 * Owns: ticket listing/detail as the Public_Ticket_View. The single
 * `toPublicTicket` mapper is the ONE place that strips server-only fields
 * (hiddenTestRef, repo, difficulty, xpReward), so hidden-test material can
 * never leak into a response (architecture §6, Requirement 3.4).
 */
import type { Ticket as TicketRow } from "@prisma/client";
import type { Ticket } from "@sidequest/shared";
import { prisma } from "../../db.js";
import { AppError } from "../../http/error.js";

/** Map a Prisma Ticket row to the client-facing Public_Ticket_View. */
export function toPublicTicket(row: TicketRow): Ticket {
  // NOTE: hiddenTestRef / repo / difficulty / xpReward are intentionally NOT
  // included. The contract `ticket` schema has no such fields.
  return {
    id: row.id,
    simCompanyId: row.simCompanyId,
    level: row.level,
    title: row.title,
    description: row.description,
    acceptanceCriteria: JSON.parse(row.acceptanceCriteria) as string[],
    branch: row.branch,
  };
}

/** List tickets at or below the given user level (Requirement 3.2, 3.5). */
export async function listForLevel(level: number): Promise<Ticket[]> {
  const rows = await prisma.ticket.findMany({
    where: { level: { lte: level } },
    orderBy: { level: "asc" },
  });
  return rows.map(toPublicTicket);
}

/** A single Public_Ticket_View; 404 on unknown id. */
export async function getPublic(id: string): Promise<Ticket> {
  const row = await prisma.ticket.findUnique({ where: { id } });
  if (!row) throw AppError.notFound(`Ticket "${id}" not found.`);
  return toPublicTicket(row);
}
