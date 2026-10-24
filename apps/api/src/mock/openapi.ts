/**
 * Generates apps/api/openapi.yaml from the @sidequest/shared zod schemas.
 *
 * Component schemas are produced with Zod 4's native z.toJSONSchema(..., {
 * target: "openapi-3.0" }), so the OpenAPI components are *derived from* the
 * single source of truth and cannot drift from the runtime validators
 * (Requirement 4.6). No response schema contains `hiddenTestRef` because the
 * shared Ticket schema has no such field (Requirement 4.3 / architecture §6).
 */
import { z } from "zod";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { stringify } from "yaml";
import * as S from "@sidequest/shared";

type JsonSchema = Record<string, unknown>;

/** Convert a zod schema to an OpenAPI-3.0-compatible JSON schema object. */
function toSchema(schema: z.ZodType): JsonSchema {
  return z.toJSONSchema(schema, { target: "openapi-3.0" }) as JsonSchema;
}

function ref(name: string): JsonSchema {
  return { $ref: `#/components/schemas/${name}` };
}

// ---------------------------------------------------------------------------
// Component schemas (entities, error envelope, endpoint bodies, SSE payloads)
// ---------------------------------------------------------------------------
const componentSchemas: Record<string, JsonSchema> = {
  // Error envelope
  ErrorEnvelope: toSchema(S.errorEnvelope),

  // Entities
  User: toSchema(S.user),
  Company: toSchema(S.company),
  SimCompany: toSchema(S.simCompany),
  Ticket: toSchema(S.ticket),
  Attempt: toSchema(S.attempt),
  HintLog: toSchema(S.hintLog),
  TelemetryEvent: toSchema(S.telemetryEvent),
  Job: toSchema(S.job),

  // Endpoint request/response bodies
  UpdateOptInRequest: toSchema(S.usersEndpoints.updateOptInRequest),
  StartAttemptRequest: toSchema(S.attemptsEndpoints.startAttemptRequest),
  SubmitAttemptRequest: toSchema(S.attemptsEndpoints.submitAttemptRequest),
  AskPersonaRequest: toSchema(S.aiEndpoints.askPersonaRequest),
  AskPersonaResponse: toSchema(S.aiEndpoints.askPersonaResponse),
  PostJobRequest: toSchema(S.jobsEndpoints.postJobRequest),
  SubmitJobRequest: toSchema(S.jobsEndpoints.submitJobRequest),

  // SSE payloads
  JobDroppedPayload: toSchema(S.jobDroppedPayload),
  JobClaimedPayload: toSchema(S.jobClaimedPayload),
  JobClaimExpiredPayload: toSchema(S.jobClaimExpiredPayload),
};

// Reusable error responses
const errorResponse = (description: string): JsonSchema => ({
  description,
  content: { "application/json": { schema: ref("ErrorEnvelope") } },
});

const demoUserHeader: JsonSchema = {
  name: "X-Demo-User",
  in: "header",
  required: false,
  description:
    "MOCK: resolves the current user. Production replaces this seam with real " +
    "auth middleware (session/JWT/OAuth) per architecture §7.",
  schema: { type: "string" },
};

/**
 * MOCK security scheme: the X-Demo-User header stands in for real auth. Declared
 * as an apiKey header so the contract documents the current-user seam; the
 * production replacement swaps this for a real scheme behind the same seam.
 */
const securitySchemes: Record<string, JsonSchema> = {
  DemoUser: {
    type: "apiKey",
    in: "header",
    name: "X-Demo-User",
    description:
      "MOCK auth seam (architecture §7). Production replaces this with real " +
      "session/JWT/OAuth auth.",
  },
};

/** Operations that require a resolved current user carry this requirement. */
const authSecurity = [{ DemoUser: [] as string[] }];

const idParam: JsonSchema = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string" },
};

const jsonBody = (schemaName: string): JsonSchema => ({
  required: true,
  content: { "application/json": { schema: ref(schemaName) } },
});

const jsonResponse = (description: string, schema: JsonSchema): JsonSchema => ({
  description,
  content: { "application/json": { schema } },
});

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const paths: Record<string, JsonSchema> = {
  "/users/me": {
    get: {
      tags: ["users"],
      summary: "Get the current user",
      parameters: [demoUserHeader],
      responses: {
        "200": jsonResponse("The current user", ref("User")),
        "401": errorResponse("No resolvable current user (unauthorized)"),
      },
    },
    patch: {
      tags: ["users"],
      summary: "Update the current user's telemetry opt-in",
      parameters: [demoUserHeader],
      requestBody: jsonBody("UpdateOptInRequest"),
      responses: {
        "200": jsonResponse("The updated user", ref("User")),
        "400": errorResponse("Validation error"),
        "401": errorResponse("Unauthorized"),
      },
    },
  },
  "/users/{id}": {
    get: {
      tags: ["users"],
      summary: "Get a user's public profile",
      parameters: [idParam],
      responses: {
        "200": jsonResponse("The user's public profile", ref("User")),
        "404": errorResponse("User not found"),
      },
    },
  },
  "/tickets": {
    get: {
      tags: ["tickets"],
      summary: "List tickets filtered to the current user's level",
      parameters: [demoUserHeader],
      responses: {
        "200": jsonResponse("Tickets at or below the user's level", {
          type: "array",
          items: ref("Ticket"),
        }),
      },
    },
  },
  "/tickets/{id}": {
    get: {
      tags: ["tickets"],
      summary: "Get a single ticket (public view, no hidden-test reference)",
      parameters: [idParam],
      responses: {
        "200": jsonResponse("The ticket", ref("Ticket")),
        "404": errorResponse("Ticket not found"),
      },
    },
  },
  "/attempts": {
    post: {
      tags: ["attempts"],
      summary: "Start an attempt on a ticket",
      parameters: [demoUserHeader],
      requestBody: jsonBody("StartAttemptRequest"),
      responses: {
        "201": jsonResponse("The new attempt (status in_progress)", ref("Attempt")),
        "400": errorResponse("Validation error"),
        "404": errorResponse("Ticket not found"),
      },
    },
  },
  "/attempts/{id}/submit": {
    post: {
      tags: ["attempts"],
      summary: "Submit a PR for an attempt",
      parameters: [idParam, demoUserHeader],
      requestBody: jsonBody("SubmitAttemptRequest"),
      responses: {
        "200": jsonResponse("The updated attempt (status grading)", ref("Attempt")),
        "400": errorResponse("Validation error (missing/invalid prUrl)"),
        "404": errorResponse("Attempt not found"),
      },
    },
  },
  "/attempts/{id}": {
    get: {
      tags: ["attempts"],
      summary: "Get an attempt and its status",
      parameters: [idParam, demoUserHeader],
      responses: {
        "200": jsonResponse("The attempt", ref("Attempt")),
        "404": errorResponse("Attempt not found"),
      },
    },
  },
  "/ai/pm": {
    post: {
      tags: ["ai"],
      summary: "Ask the PM persona",
      parameters: [demoUserHeader],
      requestBody: jsonBody("AskPersonaRequest"),
      responses: {
        "200": jsonResponse("The PM persona's response", ref("AskPersonaResponse")),
        "400": errorResponse("Validation error (empty question)"),
      },
    },
  },
  "/ai/coach": {
    post: {
      tags: ["ai"],
      summary: "Ask the coach persona",
      parameters: [demoUserHeader],
      requestBody: jsonBody("AskPersonaRequest"),
      responses: {
        "200": jsonResponse("The coach persona's response", ref("AskPersonaResponse")),
        "400": errorResponse("Validation error (empty question)"),
      },
    },
  },
  "/jobs": {
    get: {
      tags: ["jobs"],
      summary: "List marketplace jobs",
      responses: {
        "200": jsonResponse("All jobs", { type: "array", items: ref("Job") }),
      },
    },
    post: {
      tags: ["jobs"],
      summary: "Post a job",
      parameters: [demoUserHeader],
      requestBody: jsonBody("PostJobRequest"),
      responses: {
        "201": jsonResponse("The created job (status open)", ref("Job")),
        "400": errorResponse("Validation error"),
      },
    },
  },
  "/jobs/{id}/claim": {
    post: {
      tags: ["jobs"],
      summary: "Claim a job (first-come-first-serve, Level 6 gated)",
      parameters: [idParam, demoUserHeader],
      responses: {
        "200": jsonResponse("The claimed job", ref("Job")),
        "403": errorResponse("Below the Level 6 gate (level_gate)"),
        "404": errorResponse("Job not found"),
        "409": errorResponse("Job already claimed (job_already_claimed)"),
      },
    },
  },
  "/jobs/{id}/submit": {
    post: {
      tags: ["jobs"],
      summary: "Submit a PR for a claimed job",
      parameters: [idParam, demoUserHeader],
      requestBody: jsonBody("SubmitJobRequest"),
      responses: {
        "200": jsonResponse("The updated job (status submitted)", ref("Job")),
        "400": errorResponse("Validation error"),
        "404": errorResponse("Job not found"),
        "409": errorResponse("Job not in a submittable state (conflict)"),
      },
    },
  },
  "/jobs/{id}/accept": {
    post: {
      tags: ["jobs"],
      summary: "Accept a submission (MOCK escrow release + payout)",
      parameters: [idParam, demoUserHeader],
      responses: {
        "200": jsonResponse("The accepted job (status paid, escrow released)", ref("Job")),
        "404": errorResponse("Job not found"),
        "409": errorResponse("Job not in an acceptable state (conflict)"),
      },
    },
  },
  "/admin/jobs/drop": {
    post: {
      tags: ["admin"],
      summary: "DEMO ONLY: drop a demo job and emit job.dropped on /events",
      responses: {
        "201": jsonResponse("The dropped job (status open)", ref("Job")),
      },
    },
  },
  "/events": {
    get: {
      tags: ["events"],
      summary: "Server-Sent Events stream of marketplace events",
      description:
        "text/event-stream emitting named events `job.dropped`, `job.claimed`, " +
        "and `job.claim_expired`. Each event's `data` is the corresponding " +
        "payload schema.",
      parameters: [demoUserHeader],
      responses: {
        "200": {
          description: "An SSE stream (text/event-stream)",
          content: {
            "text/event-stream": {
              schema: {
                oneOf: [
                  ref("JobDroppedPayload"),
                  ref("JobClaimedPayload"),
                  ref("JobClaimExpiredPayload"),
                ],
              },
            },
          },
        },
      },
    },
  },
};

/**
 * Attach a `security` requirement to every operation: operations that resolve a
 * current user (they declare the X-Demo-User header param) require the DemoUser
 * scheme; all others declare `security: []` (explicitly public).
 */
function withSecurity(
  allPaths: Record<string, JsonSchema>,
): Record<string, JsonSchema> {
  const methods = ["get", "post", "patch", "put", "delete"];
  for (const pathItem of Object.values(allPaths)) {
    for (const method of methods) {
      const op = (pathItem as Record<string, JsonSchema>)[method];
      if (!op) continue;
      const params = (op.parameters as JsonSchema[] | undefined) ?? [];
      const usesDemoUser = params.some(
        (p) => (p as JsonSchema).name === "X-Demo-User",
      );
      op.security = usesDemoUser ? authSecurity : [];
    }
  }
  return allPaths;
}

const openapi = {
  openapi: "3.0.3",
  info: {
    title: "SideQuest API",
    version: "0.0.0",
    description:
      "The SideQuest API contract (build-plan spec #1, api-contract). " +
      "Component schemas are generated from the @sidequest/shared zod schemas. " +
      "MOCKS: X-Demo-User auth and Job.escrowStatus/payout (architecture §7).",
  },
  servers: [{ url: "http://localhost:4000", description: "Local mock server" }],
  tags: [
    { name: "users" },
    { name: "tickets" },
    { name: "attempts" },
    { name: "ai" },
    { name: "jobs" },
    { name: "admin" },
    { name: "events" },
  ],
  paths: withSecurity(paths),
  components: { schemas: componentSchemas, securitySchemes },
};

const outPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../openapi.yaml",
);

export function buildOpenApiDocument() {
  return openapi;
}

function main() {
  const yaml = stringify(openapi);
  writeFileSync(outPath, yaml, "utf8");
  // eslint-disable-next-line no-console
  console.log(`Wrote ${outPath}`);
}

// Run when executed directly.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
