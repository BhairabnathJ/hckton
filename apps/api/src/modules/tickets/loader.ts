/**
 * Hidden ticket-definition loader + upsert (server-only).
 *
 * Reads sim-companies/brightline-hidden/tickets.json — the server-only source
 * of ticket definitions and hidden-test references (architecture §6) — and
 * upserts each into the Ticket table under the Brightline SimCompany. The
 * `hiddenTestPath` becomes the server-only `hiddenTestRef`; it is stored but
 * NEVER serialized to a client. Used by both the seed and POST
 * /admin/tickets/reload.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../../db.js";
import { REPO_ROOT } from "../../env.js";

export const BRIGHTLINE_HIDDEN = resolve(REPO_ROOT, "sim-companies/brightline-hidden");
export const TICKETS_MANIFEST = resolve(BRIGHTLINE_HIDDEN, "tickets.json");

export const BRIGHTLINE_SIMCOMPANY = {
  id: "simco_brightline",
  name: "Brightline Logistics",
  repoTemplateUrl: "https://github.com/sidequest/sim-companies-brightline",
};

interface HiddenTicketDef {
  id: string;
  repo: string;
  title: string;
  description: string;
  difficulty: string;
  xpReward: number;
  level: number;
  acceptanceCriteria: string[];
  branch: string;
  hiddenTestPath: string;
}

export function readTicketManifest(): HiddenTicketDef[] {
  return JSON.parse(readFileSync(TICKETS_MANIFEST, "utf8")) as HiddenTicketDef[];
}

/** Ensure the Brightline SimCompany exists, then upsert every ticket def. */
export async function reloadTickets(): Promise<{
  simCompanyId: string;
  count: number;
  added: number;
  total: number;
}> {
  await prisma.simCompany.upsert({
    where: { id: BRIGHTLINE_SIMCOMPANY.id },
    create: BRIGHTLINE_SIMCOMPANY,
    update: { name: BRIGHTLINE_SIMCOMPANY.name, repoTemplateUrl: BRIGHTLINE_SIMCOMPANY.repoTemplateUrl },
  });

  const defs = readTicketManifest();
  let added = 0;
  for (const def of defs) {
    const data = {
      simCompanyId: BRIGHTLINE_SIMCOMPANY.id,
      repo: def.repo,
      level: def.level,
      title: def.title,
      description: def.description,
      acceptanceCriteria: JSON.stringify(def.acceptanceCriteria),
      branch: def.branch,
      difficulty: def.difficulty,
      xpReward: def.xpReward,
      hiddenTestRef: def.hiddenTestPath, // SERVER-ONLY (§6)
    };
    // Track newly-created tickets (ids not seen before) so the reload endpoint
    // can report `added` vs `total` per the shared contract.
    const existing = await prisma.ticket.findUnique({ where: { id: def.id } });
    if (!existing) added++;
    await prisma.ticket.upsert({
      where: { id: def.id },
      create: { id: def.id, ...data },
      update: data,
    });
  }
  const total = await prisma.ticket.count();
  return { simCompanyId: BRIGHTLINE_SIMCOMPANY.id, count: defs.length, added, total };
}
