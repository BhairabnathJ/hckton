/**
 * SideQuest mock server (api-contract deliverable #3).
 *
 * One command: `npm run mock`. Serves schema-valid, seeded responses for every
 * endpoint in the contract plus the `/events` SSE stream. Requires no DB,
 * Docker, GitHub, or Bedrock (Requirement 5.7).
 *
 * Every handler validates its request against the shared Request_Schema and
 * validates its response against the shared Response_Schema before sending, so
 * the mock can never emit a shape the contract forbids. `hiddenTestRef` is
 * structurally impossible because the shared Ticket schema has no such field.
 */
import express, {
  type Express,
  type Request,
  type Response,
} from "express";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { readFileSync } from "node:fs";
import { z, type ZodType } from "zod";
import {
  // entities / helpers
  makeError,
  type Job,
  type Ticket,
  // endpoint schemas
  usersEndpoints,
  ticketsEndpoints,
  attemptsEndpoints,
  aiEndpoints,
  jobsEndpoints,
  adminEndpoints,
  // sse
  type SseEvent,
} from "@sidequest/shared";
import { buildSeed, type SeedData } from "./seed.js";
import { resolveDemoUser } from "./demoUser.js";
import { createLLMProvider } from "../llm/index.js";

const LEVEL_GATE = 6;

// ---------------------------------------------------------------------------
// Admin tickets reload — server-only ticket-definition parsing (// MOCK)
// ---------------------------------------------------------------------------
// The brightline SimCompany every reloaded ticket is mapped to. In a real
// core-api this is resolved from the ticket's `repo`; the mock pins it.
const BRIGHTLINE_SIMCOMPANY_ID = "simco_brightline";

// Path to the server-only ticket definitions. These live in the hidden repo
// and are NEVER shipped to a client; only mapped, hidden-field-stripped views
// are ever serialized.
const HIDDEN_TICKETS_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../sim-companies/brightline-hidden/tickets.json",
);

/**
 * Server-only schema for a raw ticket definition in
 * `sim-companies/brightline-hidden/tickets.json`.
 *
 * SECURITY (architecture §6): this shape carries `hiddenTestPath`, a
 * server-only reference. It is deliberately defined HERE (inside the API
 * process), not in `@sidequest/shared`, so hidden-test material can never enter
 * the client contract. The mapper below drops `hiddenTestPath` before producing
 * the client-facing `Ticket`.
 */
const rawTicketDefinition = z.object({
  id: z.string(),
  repo: z.string(),
  title: z.string(),
  description: z.string(),
  difficulty: z.string(),
  xpReward: z.number().int().nonnegative(),
  level: z.number().int().positive(),
  acceptanceCriteria: z.array(z.string()).min(1),
  branch: z.string(),
  hiddenTestPath: z.string(), // SERVER-ONLY: never serialized to a client
});

/** Map a raw (server-only) ticket definition to the client-facing Ticket. */
// MOCK: in core-api this mapping + upsert happens against Prisma; here it maps
// to the pinned brightline SimCompany and drops the hidden-test path.
function toClientTicket(raw: z.infer<typeof rawTicketDefinition>): Ticket {
  // `hiddenTestPath` is intentionally not read into the result.
  return {
    id: raw.id,
    simCompanyId: BRIGHTLINE_SIMCOMPANY_ID,
    level: raw.level,
    title: raw.title,
    description: raw.description,
    acceptanceCriteria: raw.acceptanceCriteria,
    branch: raw.branch,
  };
}

// ---------------------------------------------------------------------------
// SSE hub — transport only (architecture §2 events module)
// ---------------------------------------------------------------------------
class SseHub {
  private clients = new Set<Response>();

  add(res: Response): void {
    this.clients.add(res);
    res.on("close", () => this.clients.delete(res));
  }

  publish(event: SseEvent): void {
    const frame = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    for (const res of this.clients) res.write(frame);
  }

  get size(): number {
    return this.clients.size;
  }
}

// ---------------------------------------------------------------------------
// Response validation: parse the body against its schema before sending so the
// mock provably conforms to the contract.
// ---------------------------------------------------------------------------
function send<T>(res: Response, status: number, schema: ZodType<T>, body: T): void {
  const parsed = schema.parse(body);
  res.status(status).json(parsed);
}

/** Validate a request body; on failure send a 400 validation_error and return undefined. */
function parseBody<T>(req: Request, res: Response, schema: ZodType<T>): T | undefined {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res
      .status(400)
      .json(makeError("validation_error", result.error.issues[0]?.message ?? "Invalid request body"));
    return undefined;
  }
  return result.data;
}

export function createServer(seed: SeedData = buildSeed()): {
  app: Express;
  hub: SseHub;
} {
  const app = express();
  app.use(express.json());
  const hub = new SseHub();

  // Mutable in-memory copies so claim/submit/accept are observable in a session.
  const jobs = new Map<string, Job>(seed.jobs.map((j) => [j.id, j]));
  // Mutable in-memory ticket store so POST /admin/tickets/reload is observable
  // in a session without a restart. // MOCK: stands in for the core-api DB.
  const tickets = new Map<string, Ticket>(seed.tickets.map((t) => [t.id, t]));

  // ----- users ------------------------------------------------------------
  app.get("/users/me", (req, res) => {
    const me = resolveDemoUser(req, seed);
    if (!me) {
      res.status(401).json(makeError("unauthorized", "No resolvable current user"));
      return;
    }
    send(res, 200, usersEndpoints.getMeResponse, me);
  });

  app.get("/users/:id", (req, res) => {
    const u = seed.users.find((x) => x.id === req.params.id);
    if (!u) {
      res.status(404).json(makeError("not_found", `User ${req.params.id} not found`));
      return;
    }
    send(res, 200, usersEndpoints.getUserResponse, u);
  });

  app.patch("/users/me", (req, res) => {
    const me = resolveDemoUser(req, seed);
    if (!me) {
      res.status(401).json(makeError("unauthorized", "No resolvable current user"));
      return;
    }
    const body = parseBody(req, res, usersEndpoints.updateOptInRequest);
    if (!body) return;
    me.telemetryOptIn = body.telemetryOptIn; // // MOCK: in-memory mutation
    send(res, 200, usersEndpoints.updateOptInResponse, me);
  });

  // ----- tickets ----------------------------------------------------------
  app.get("/tickets", (req, res) => {
    const me = resolveDemoUser(req, seed);
    const level = me?.level ?? 0;
    // Filter to tickets at or below the current user's level (Requirement 7.5).
    const atOrBelow = [...tickets.values()].filter((t) => t.level <= level);
    send(res, 200, ticketsEndpoints.listTicketsResponse, atOrBelow);
  });

  app.get("/tickets/:id", (req, res) => {
    const t = tickets.get(req.params.id);
    if (!t) {
      res.status(404).json(makeError("not_found", `Ticket ${req.params.id} not found`));
      return;
    }
    send(res, 200, ticketsEndpoints.getTicketResponse, t);
  });

  // ----- attempts ---------------------------------------------------------
  app.post("/attempts", (req, res) => {
    const me = resolveDemoUser(req, seed);
    if (!me) {
      res.status(401).json(makeError("unauthorized", "No resolvable current user"));
      return;
    }
    const body = parseBody(req, res, attemptsEndpoints.startAttemptRequest);
    if (!body) return;
    const ticket = seed.tickets.find((t) => t.id === body.ticketId);
    if (!ticket) {
      res.status(404).json(makeError("not_found", `Ticket ${body.ticketId} not found`));
      return;
    }
    send(res, 201, attemptsEndpoints.startAttemptResponse, {
      id: `attempt_${me.handle}_${ticket.id}`,
      userId: me.id,
      ticketId: ticket.id,
      status: "in_progress",
      prUrl: null,
      testRuns: 0,
      reviewRounds: 0,
      hintsUsed: 0,
    });
  });

  app.post("/attempts/:id/submit", (req, res) => {
    const existing = seed.attempts.find((a) => a.id === req.params.id);
    const body = parseBody(req, res, attemptsEndpoints.submitAttemptRequest);
    if (!body) return;
    if (!existing) {
      res.status(404).json(makeError("not_found", `Attempt ${req.params.id} not found`));
      return;
    }
    send(res, 200, attemptsEndpoints.submitAttemptResponse, {
      ...existing,
      status: "grading",
      prUrl: body.prUrl,
      testRuns: existing.testRuns + 1,
    });
  });

  app.get("/attempts/:id", (req, res) => {
    const a = seed.attempts.find((x) => x.id === req.params.id);
    if (!a) {
      res.status(404).json(makeError("not_found", `Attempt ${req.params.id} not found`));
      return;
    }
    send(res, 200, attemptsEndpoints.getAttemptResponse, a);
  });

  // ----- ai personas ------------------------------------------------------
  // The /ai/* endpoints use the LLMProvider seam. For the offline mock server
  // we default to the MockProvider unless LLM_PROVIDER selects a real backend,
  // so `npm run mock` never needs credentials. Provider construction is lazy so
  // a misconfigured real provider doesn't crash startup.
  let aiProvider: import("../llm/types.js").LLMProvider | undefined;
  const getAiProvider = (): import("../llm/types.js").LLMProvider => {
    if (!aiProvider) {
      aiProvider = createLLMProvider(process.env.LLM_PROVIDER ?? "mock");
    }
    return aiProvider;
  };

  const persona = (name: "pm" | "coach") => async (req: Request, res: Response) => {
    const body = parseBody(req, res, aiEndpoints.askPersonaRequest);
    if (!body) return;
    try {
      const result = await getAiProvider().review({
        persona: name,
        ticketId: body.attemptId ? attemptTicketId(body.attemptId) : "",
        prompt: body.question,
      });
      send(res, 200, aiEndpoints.askPersonaResponse, {
        persona: name,
        question: body.question,
        response: result.text,
      });
    } catch (err) {
      // Never leak credentials; return a generic internal error envelope.
      res.status(500).json(makeError("internal", `AI provider error: ${(err as Error).message}`));
    }
  };
  app.post("/ai/pm", persona("pm"));
  app.post("/ai/coach", persona("coach"));

  /** Map a seeded attemptId to its ticketId so MockProvider can pick a canned review. */
  function attemptTicketId(attemptId: string): string {
    return seed.attempts.find((a) => a.id === attemptId)?.ticketId ?? "";
  }

  // ----- jobs (marketplace) ----------------------------------------------
  app.get("/jobs", (_req, res) => {
    send(res, 200, jobsEndpoints.listJobsResponse, [...jobs.values()]);
  });

  app.post("/jobs", (req, res) => {
    const body = parseBody(req, res, jobsEndpoints.postJobRequest);
    if (!body) return;
    const job: Job = {
      id: `job_${Date.now()}`,
      ...body,
      status: "open",
      claimedByUserId: null,
      claimExpiresAt: null,
      escrowStatus: "funded", // // MOCK
    };
    jobs.set(job.id, job);
    send(res, 201, jobsEndpoints.postJobResponse, job);
  });

  app.post("/jobs/:id/claim", (req, res) => {
    const me = resolveDemoUser(req, seed);
    if (!me) {
      res.status(401).json(makeError("unauthorized", "No resolvable current user"));
      return;
    }
    const job = jobs.get(req.params.id);
    if (!job) {
      res.status(404).json(makeError("not_found", `Job ${req.params.id} not found`));
      return;
    }
    if (me.level < LEVEL_GATE) {
      res.status(403).json(makeError("level_gate", `Claiming requires Level ${LEVEL_GATE}+`));
      return;
    }
    if (job.status !== "open" || job.claimedByUserId) {
      res.status(409).json(makeError("job_already_claimed", "Job already claimed"));
      return;
    }
    job.status = "claimed";
    job.claimedByUserId = me.id;
    job.claimExpiresAt = new Date(Date.now() + job.timeLimitHours * 3600_000).toISOString();
    hub.publish({ type: "job.claimed", job, claimedByUserId: me.id });
    send(res, 200, jobsEndpoints.claimJobResponse, job);
  });

  app.post("/jobs/:id/submit", (req, res) => {
    const job = jobs.get(req.params.id);
    const body = parseBody(req, res, jobsEndpoints.submitJobRequest);
    if (!body) return;
    if (!job) {
      res.status(404).json(makeError("not_found", `Job ${req.params.id} not found`));
      return;
    }
    if (job.status !== "claimed") {
      res.status(409).json(makeError("conflict", "Job is not in a submittable (claimed) state"));
      return;
    }
    job.status = "submitted";
    send(res, 200, jobsEndpoints.submitJobResponse, job);
  });

  app.post("/jobs/:id/accept", (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) {
      res.status(404).json(makeError("not_found", `Job ${req.params.id} not found`));
      return;
    }
    if (job.status !== "submitted") {
      res.status(409).json(makeError("conflict", "Job is not in an acceptable (submitted) state"));
      return;
    }
    job.status = "accepted";
    job.escrowStatus = "released"; // // MOCK: escrow release on accept (architecture §7)
    job.status = "paid"; // // MOCK: payout completes, accepted -> paid
    send(res, 200, jobsEndpoints.acceptJobResponse, job);
  });

  // ----- admin (demo only) ------------------------------------------------
  app.post("/admin/jobs/drop", (_req, res) => {
    const job: Job = {
      id: `job_demo_${Date.now()}`,
      companyId: seed.companies[0]!.id,
      title: "DEMO: Urgent hotfix for checkout totals",
      description: "A freshly dropped demo job for the live marketplace flow.",
      payCents: 50000,
      timeLimitHours: 12,
      minLevel: LEVEL_GATE,
      status: "open",
      claimedByUserId: null,
      claimExpiresAt: null,
      escrowStatus: "funded", // // MOCK
    };
    jobs.set(job.id, job);
    hub.publish({ type: "job.dropped", job });
    send(res, 201, adminEndpoints.dropDemoJobResponse, job);
  });

  // POST /admin/tickets/reload — admin-only; re-read the server-only ticket
  // definitions and upsert any new tickets into the in-memory store without a
  // restart. Returns { added, total }.
  // MOCK: gated on the `X-Demo-User: admin` auth seam and backed by the
  // in-memory ticket store. In core-api this re-reads the file and performs a
  // real prisma.ticket.upsert; the response shape is identical.
  app.post("/admin/tickets/reload", (req, res) => {
    // MOCK: admin resolution via the X-Demo-User header. Only `admin` passes.
    const demoUser = req.header("X-Demo-User")?.trim();
    if (!demoUser) {
      res.status(401).json(makeError("unauthorized", "No resolvable current user"));
      return;
    }
    if (demoUser !== "admin") {
      res.status(403).json(makeError("level_gate", "Admin-only endpoint (X-Demo-User: admin required)"));
      return;
    }

    let defs: z.infer<typeof rawTicketDefinition>[];
    try {
      const parsed: unknown = JSON.parse(readFileSync(HIDDEN_TICKETS_PATH, "utf8"));
      defs = z.array(rawTicketDefinition).parse(parsed);
    } catch (err) {
      res
        .status(500)
        .json(makeError("internal", `Failed to read ticket definitions: ${(err as Error).message}`));
      return;
    }

    let added = 0;
    for (const def of defs) {
      const isNew = !tickets.has(def.id);
      // Upsert: new ids count as added; existing ids are refreshed in place.
      tickets.set(def.id, toClientTicket(def));
      if (isNew) added++;
    }

    send(res, 200, adminEndpoints.reloadTicketsResponse, {
      added,
      total: tickets.size,
    });
  });

  // ----- SSE stream -------------------------------------------------------
  app.get("/events", (req, res) => {
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.flushHeaders();
    res.write(`: connected\n\n`); // comment frame to open the stream
    hub.add(res);
  });

  return { app, hub };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
const PORT = Number(process.env.PORT ?? 4000);

function main() {
  const { app, hub } = createServer();

  // Demo: expire the seeded `claimed` job shortly after startup so the UI can
  // observe a job.claim_expired event without manual steps. // MOCK timer.
  const seed = buildSeed();
  const expiring = seed.jobs.find((j) => j.status === "claimed");
  if (expiring) {
    setTimeout(() => {
      const expired: Job = { ...expiring, status: "expired", claimedByUserId: null, claimExpiresAt: null };
      hub.publish({ type: "job.claim_expired", job: expired });
    }, 15_000);
  }

  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`SideQuest mock server listening on http://localhost:${PORT}`);
    // eslint-disable-next-line no-console
    console.log(`SSE stream:   GET  http://localhost:${PORT}/events`);
    // eslint-disable-next-line no-console
    console.log(`Drop a job:   POST http://localhost:${PORT}/admin/jobs/drop`);
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
