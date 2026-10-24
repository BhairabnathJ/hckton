/**
 * Mock smoke test (Task 4.2):
 *   - start the mock in-process,
 *   - hit each endpoint once asserting a 2xx + schema-valid body,
 *   - assert POST /admin/jobs/drop causes a `job.dropped` event on /events.
 *
 * Exits non-zero on any failure.
 */
import type { AddressInfo } from "node:net";
import {
  user,
  ticket,
  attempt,
  job,
  aiEndpoints,
  errorEnvelope,
} from "@sidequest/shared";
import { createServer } from "./server.js";

let failures = 0;
function ok(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? `: ${detail}` : ""}`);
  }
}

/** Read a response body as a loosely-typed record for assertion convenience. */
async function body(r: globalThis.Response): Promise<any> {
  return (await r.json()) as any;
}

async function main() {
  const { app } = createServer();
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const { port } = server.address() as AddressInfo;
  const base = `http://localhost:${port}`;
  const H = { "X-Demo-User": "grace", "Content-Type": "application/json" };

  try {
    // users
    let r = await fetch(`${base}/users/me`, { headers: H });
    ok("GET /users/me 200 + User", r.status === 200 && !!user.safeParse(await r.json()).success);

    r = await fetch(`${base}/users/user_ada`);
    ok("GET /users/:id 200 + User", r.status === 200 && !!user.safeParse(await r.json()).success);

    r = await fetch(`${base}/users/nope`);
    ok("GET /users/:id unknown 404 + error", r.status === 404 && errorEnvelope.safeParse(await r.json()).success);

    r = await fetch(`${base}/users/me`, { method: "PATCH", headers: H, body: JSON.stringify({ telemetryOptIn: true }) });
    ok("PATCH /users/me 200 + User", r.status === 200 && !!user.safeParse(await r.json()).success);

    // tickets
    r = await fetch(`${base}/tickets`, { headers: H });
    const tickets = await r.json();
    ok("GET /tickets 200 + Ticket[]", r.status === 200 && Array.isArray(tickets) && tickets.every((t: unknown) => ticket.safeParse(t).success));

    r = await fetch(`${base}/tickets/brightline-l1-pagination`);
    ok("GET /tickets/:id 200 + Ticket", r.status === 200 && !!ticket.safeParse(await r.json()).success);

    // attempts
    r = await fetch(`${base}/attempts`, { method: "POST", headers: H, body: JSON.stringify({ ticketId: "brightline-l1-pagination" }) });
    { const b = await body(r); ok("POST /attempts 201 + Attempt(in_progress)", r.status === 201 && attempt.safeParse(b).success && b.status === "in_progress"); }

    r = await fetch(`${base}/attempts/attempt_ada_l1/submit`, { method: "POST", headers: H, body: JSON.stringify({ prUrl: "https://github.com/x/y/pull/1" }) });
    { const b = await body(r); ok("POST /attempts/:id/submit 200 + Attempt(grading)", r.status === 200 && attempt.safeParse(b).success && b.status === "grading"); }

    r = await fetch(`${base}/attempts/attempt_ada_l1/submit`, { method: "POST", headers: H, body: JSON.stringify({ prUrl: "not-a-url" }) });
    ok("POST /attempts/:id/submit invalid prUrl 400", r.status === 400 && errorEnvelope.safeParse(await body(r)).success);

    r = await fetch(`${base}/attempts/attempt_ada_l1`, { headers: H });
    ok("GET /attempts/:id 200 + Attempt", r.status === 200 && !!attempt.safeParse(await body(r)).success);

    // ai
    r = await fetch(`${base}/ai/pm`, { method: "POST", headers: H, body: JSON.stringify({ question: "What is done?" }) });
    ok("POST /ai/pm 200 + response", r.status === 200 && !!aiEndpoints.askPersonaResponse.safeParse(await body(r)).success);

    r = await fetch(`${base}/ai/coach`, { method: "POST", headers: H, body: JSON.stringify({ question: "" }) });
    ok("POST /ai/coach empty question 400", r.status === 400 && errorEnvelope.safeParse(await body(r)).success);

    // jobs
    r = await fetch(`${base}/jobs`);
    const jobsList = await body(r);
    ok("GET /jobs 200 + Job[]", r.status === 200 && Array.isArray(jobsList) && jobsList.every((j: unknown) => job.safeParse(j).success));

    r = await fetch(`${base}/jobs`, { method: "POST", headers: H, body: JSON.stringify({ companyId: "company_northwind", title: "t", description: "d", payCents: 1000, timeLimitHours: 24, minLevel: 6 }) });
    { const b = await body(r); ok("POST /jobs 201 + Job(open)", r.status === 201 && job.safeParse(b).success && b.status === "open"); }

    // level gate: ada (level 3) cannot claim
    r = await fetch(`${base}/jobs/job_search_relevance/claim`, { method: "POST", headers: { "X-Demo-User": "ada" } });
    { const b = await body(r); ok("POST /jobs/:id/claim below gate 403 level_gate", r.status === 403 && errorEnvelope.safeParse(b).success && b.error.code === "level_gate"); }

    // grace (level 7) claims the open job
    r = await fetch(`${base}/jobs/job_search_relevance/claim`, { method: "POST", headers: H });
    { const b = await body(r); ok("POST /jobs/:id/claim 200 + Job(claimed)", r.status === 200 && job.safeParse(b).success && b.status === "claimed" && b.claimedByUserId === "user_grace"); }

    // second claim -> 409
    r = await fetch(`${base}/jobs/job_search_relevance/claim`, { method: "POST", headers: H });
    { const b = await body(r); ok("POST /jobs/:id/claim again 409 job_already_claimed", r.status === 409 && b.error.code === "job_already_claimed"); }

    // submit then accept -> paid + escrow released
    r = await fetch(`${base}/jobs/job_search_relevance/submit`, { method: "POST", headers: H, body: JSON.stringify({ prUrl: "https://github.com/x/y/pull/2" }) });
    { const b = await body(r); ok("POST /jobs/:id/submit 200 + Job(submitted)", r.status === 200 && b.status === "submitted"); }

    r = await fetch(`${base}/jobs/job_search_relevance/accept`, { method: "POST", headers: H });
    { const b = await body(r); ok("POST /jobs/:id/accept 200 + Job(paid, escrow released)", r.status === 200 && b.status === "paid" && b.escrowStatus === "released"); }

    // SSE: subscribe, then drop a demo job, assert job.dropped arrives
    const sseReceived = await (async () => {
      const controller = new AbortController();
      const resp = await fetch(`${base}/events`, { headers: H, signal: controller.signal });
      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      // Trigger a drop after the stream is open.
      const dropResp = await fetch(`${base}/admin/jobs/drop`, { method: "POST" });
      { const b = await body(dropResp); ok("POST /admin/jobs/drop 201 + Job(open)", dropResp.status === 201 && job.safeParse(b).success && b.status === "open"); }

      let buffer = "";
      const deadline = Date.now() + 4000;
      while (Date.now() < deadline) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (buffer.includes("event: job.dropped")) {
          controller.abort();
          return true;
        }
      }
      controller.abort();
      return false;
    })();
    ok("GET /events receives job.dropped after drop", sseReceived);
  } finally {
    server.closeAllConnections?.();
    server.close();
  }

  console.log("");
  if (failures > 0) {
    console.log(`=== SMOKE FAILED (${failures} failure(s)) ===`);
    process.exit(1);
  }
  console.log("=== SMOKE PASSED ===");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
