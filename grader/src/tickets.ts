/**
 * Ticket lookup + hidden-test injection.
 *
 * tickets.json and the hidden tests live ONLY in brightline-hidden (server-only,
 * architecture §6). We resolve the ticket's hiddenTestPath and copy the test
 * file(s) into the clone so pytest discovers them, but never emit the hidden
 * path or source into any result or review.
 *
 * `brightline-l1-pagination` is the real ticket id; `BRT-101` is a display alias
 * only and is never used for lookup.
 */
import { readFileSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { resolve, join, basename } from "node:path";
import { BRIGHTLINE_HIDDEN, TICKETS_MANIFEST } from "./config.js";

export interface Ticket {
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

/** Load a ticket by its real id from the manifest; throw a named error if absent. */
export function loadTicket(ticketId: string): Ticket {
  let manifest: Ticket[];
  try {
    manifest = JSON.parse(readFileSync(TICKETS_MANIFEST, "utf8")) as Ticket[];
  } catch (err) {
    throw new Error(`Could not read tickets manifest at ${TICKETS_MANIFEST}: ${(err as Error).message}`);
  }
  const ticket = manifest.find((t) => t.id === ticketId);
  if (!ticket) {
    throw new Error(
      `Ticket "${ticketId}" not found in tickets.json. Known ids: ${manifest.map((t) => t.id).join(", ")}`,
    );
  }
  return ticket;
}

/**
 * Copy the ticket's hidden test file into the clone's tests/ directory so
 * pytest discovers it. Returns the in-clone path (for pytest targeting).
 */
export function copyHiddenTests(ticket: Ticket, cloneDir: string): string {
  const src = resolve(BRIGHTLINE_HIDDEN, ticket.hiddenTestPath);
  if (!existsSync(src)) {
    throw new Error(
      `Hidden test for ticket "${ticket.id}" does not exist on disk (expected under brightline-hidden).`,
    );
  }
  const destDir = join(cloneDir, "tests");
  mkdirSync(destDir, { recursive: true });
  const dest = join(destDir, basename(ticket.hiddenTestPath));
  copyFileSync(src, dest);
  return dest;
}
