/**
 * @sidequest/shared — the single source of truth for the SideQuest API
 * contract: zod schemas + inferred TypeScript types shared by apps/api and
 * apps/web. Conforms to the reconciled /docs/architecture.md (change log
 * 2026-10-24).
 */

// Enums + error envelope
export * from "./enums.js";
export * from "./error.js";

// Entities
export * from "./entities/user.js";
export * from "./entities/company.js";
export * from "./entities/simCompany.js";
export * from "./entities/ticket.js";
export * from "./entities/attempt.js";
export * from "./entities/hintLog.js";
export * from "./entities/telemetryEvent.js";
export * from "./entities/job.js";

// Endpoint request/response schemas
export * as usersEndpoints from "./endpoints/users.js";
export * as ticketsEndpoints from "./endpoints/tickets.js";
export * as attemptsEndpoints from "./endpoints/attempts.js";
export * as aiEndpoints from "./endpoints/ai.js";
export * as jobsEndpoints from "./endpoints/jobs.js";
export * as adminEndpoints from "./endpoints/admin.js";

// SSE events
export * from "./events.js";
