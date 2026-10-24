/**
 * Contract-integrity checks (Task 4.1):
 *   1. Every Response_Schema .parse()s its seed value (seed is contract-valid).
 *   2. Hidden-test-leak guard: the shared schema source and the generated
 *      openapi.yaml contain no `hiddenTestRef` (architecture §6 / Requirement 7.3).
 *
 * Exits non-zero on any failure.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  user,
  company,
  simCompany,
  ticket,
  attempt,
  job,
  usersEndpoints,
  ticketsEndpoints,
  attemptsEndpoints,
  jobsEndpoints,
  adminEndpoints,
} from "@sidequest/shared";
import { buildSeed } from "./seed.js";

const here = dirname(fileURLToPath(import.meta.url));
let failures = 0;

function check(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failures++;
    console.log(`  FAIL  ${name}: ${(err as Error).message}`);
  }
}

console.log("[1] Seed values validate against their schemas");
const seed = buildSeed();

check("users validate", () => seed.users.forEach((u) => user.parse(u)));
check("companies validate", () => seed.companies.forEach((c) => company.parse(c)));
check("simCompanies validate", () => seed.simCompanies.forEach((s) => simCompany.parse(s)));
check("tickets validate", () => seed.tickets.forEach((t) => ticket.parse(t)));
check("attempts validate", () => seed.attempts.forEach((a) => attempt.parse(a)));
check("jobs validate", () => seed.jobs.forEach((j) => job.parse(j)));

check("list/get response schemas accept seed", () => {
  usersEndpoints.getMeResponse.parse(seed.users[0]);
  ticketsEndpoints.listTicketsResponse.parse(seed.tickets);
  ticketsEndpoints.getTicketResponse.parse(seed.tickets[0]);
  attemptsEndpoints.getAttemptResponse.parse(seed.attempts[0]);
  jobsEndpoints.listJobsResponse.parse(seed.jobs);
  adminEndpoints.dropDemoJobResponse.parse(seed.jobs[0]);
});

console.log("\n[2] Hidden-test-leak guard (no 'hiddenTestRef')");

check("shared schema source has no hiddenTestRef", () => {
  // Scan the shared entity/endpoint source files.
  const sharedSrc = resolve(here, "../../../../packages/shared/src");
  const files = [
    "entities/ticket.ts",
    "index.ts",
  ];
  for (const f of files) {
    const text = readFileSync(resolve(sharedSrc, f), "utf8");
    // The word may appear only in a comment that *explains* the omission;
    // fail only if it appears as an object key / schema field.
    if (/hiddenTestRef\s*:/.test(text)) {
      throw new Error(`hiddenTestRef field present in packages/shared/src/${f}`);
    }
  }
});

check("openapi.yaml has no hiddenTestRef", () => {
  const yaml = readFileSync(resolve(here, "../../openapi.yaml"), "utf8");
  if (yaml.includes("hiddenTestRef")) {
    throw new Error("hiddenTestRef present in openapi.yaml");
  }
});

console.log("");
if (failures > 0) {
  console.log(`=== CHECK FAILED (${failures} failure(s)) ===`);
  process.exit(1);
}
console.log("=== CHECK PASSED ===");
