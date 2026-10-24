/**
 * Typed client for the SideQuest API (apps/api/openapi.yaml).
 *
 * Every request carries the // MOCK X-Demo-User header chosen in the header
 * switcher. Non-2xx responses are decoded from the canonical
 * `{ error: { code, message } }` envelope into an ApiError.
 */
import { z, type ZodType } from "zod";
import {
  errorEnvelope,
  user,
  ticket,
  attempt,
  job,
  usersEndpoints,
  ticketsEndpoints,
  jobsEndpoints,
  aiEndpoints,
  adminEndpoints,
  type ErrorCode,
  type User,
  type Ticket,
  type Job,
} from "@sidequest/shared";

type PostJobRequest = jobsEndpoints.PostJobRequest;
type AskPersonaResponse = aiEndpoints.AskPersonaResponse;
type ReloadTicketsResponse = adminEndpoints.ReloadTicketsResponse;

export const API_URL = (import.meta.env.VITE_API_URL ?? "/api").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: ErrorCode | "network" | "unknown",
    message: string,
  ) {
    super(message);
  }
}

// MOCK: the handle sent as X-Demo-User. Set by DemoUserProvider.
let currentHandle: string | null = null;
export function setDemoHandle(handle: string | null): void {
  currentHandle = handle;
}

interface RequestOptions {
  body?: unknown;
  /** Override the X-Demo-User handle for this request only. */
  as?: string;
}

/**
 * Attempt + grading results (browser-workspace spec R5). Not in
 * @sidequest/shared yet; the shared `attempt` schema would strip these keys.
 * All optional/nullable so a freshly started attempt still validates.
 */
export const gradedAttempt = attempt.extend({
  testsPassed: z.number().int().nonnegative().nullable().optional(),
  testsFailed: z.number().int().nonnegative().nullable().optional(),
  failures: z.array(z.object({ name: z.string(), message: z.string() })).nullable().optional(),
  verdict: z.enum(["APPROVE", "REQUEST_CHANGES"]).nullable().optional(),
  reviewBody: z.string().nullable().optional(),
  reviewCommentUrl: z.string().nullable().optional(),
});
export type GradedAttempt = z.infer<typeof gradedAttempt>;

export async function request<T>(
  method: string,
  path: string,
  schema: ZodType<T> | null,
  opts: RequestOptions = {},
): Promise<T> {
  const handle = opts.as ?? currentHandle;
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (handle) headers["X-Demo-User"] = handle;

  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new ApiError(0, "network", `Can't reach the API at ${API_URL}. Is it running?`);
  }

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    const env = errorEnvelope.safeParse(data);
    if (env.success) throw new ApiError(res.status, env.data.error.code, env.data.error.message);
    throw new ApiError(res.status, "unknown", `${method} ${path} failed with ${res.status}`);
  }

  if (!schema) return data as T;
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    // Keep the UI usable if the server drifts from the contract, but say so.
    console.warn(`[api] ${method} ${path} response does not match the contract`, parsed.error.issues);
    return data as T;
  }
  return parsed.data;
}

export const api = {
  me: (as?: string) => request<User>("GET", "/users/me", usersEndpoints.getMeResponse, { as }),
  user: (id: string) => request<User>("GET", `/users/${encodeURIComponent(id)}`, user),
  setTelemetryOptIn: (telemetryOptIn: boolean) =>
    request<User>("PATCH", "/users/me", usersEndpoints.updateOptInResponse, { body: { telemetryOptIn } }),

  tickets: () => request<Ticket[]>("GET", "/tickets", ticketsEndpoints.listTicketsResponse),
  ticket: (id: string) => request<Ticket>("GET", `/tickets/${encodeURIComponent(id)}`, ticket),

  startAttempt: (ticketId: string) => request<GradedAttempt>("POST", "/attempts", gradedAttempt, { body: { ticketId } }),
  attempt: (id: string) => request<GradedAttempt>("GET", `/attempts/${encodeURIComponent(id)}`, gradedAttempt),
  submitAttempt: (id: string, prUrl: string) =>
    request<GradedAttempt>("POST", `/attempts/${encodeURIComponent(id)}/submit`, gradedAttempt, { body: { prUrl } }),

  ask: (persona: "pm" | "coach", question: string, attemptId?: string) =>
    request<AskPersonaResponse>("POST", `/ai/${persona}`, aiEndpoints.askPersonaResponse, {
      body: attemptId ? { question, attemptId } : { question },
    }),

  jobs: () => request<Job[]>("GET", "/jobs", jobsEndpoints.listJobsResponse),
  postJob: (body: PostJobRequest) => request<Job>("POST", "/jobs", job, { body }),
  claimJob: (id: string) => request<Job>("POST", `/jobs/${encodeURIComponent(id)}/claim`, job),
  submitJob: (id: string, prUrl: string) =>
    request<Job>("POST", `/jobs/${encodeURIComponent(id)}/submit`, job, { body: { prUrl } }),
  acceptJob: (id: string) => request<Job>("POST", `/jobs/${encodeURIComponent(id)}/accept`, job),

  // DEMO ONLY, company role
  dropDemoJob: () => request<Job>("POST", "/admin/jobs/drop-demo", adminEndpoints.dropDemoJobResponse),
  reloadTickets: () =>
    request<ReloadTicketsResponse>("POST", "/admin/tickets/reload", adminEndpoints.reloadTicketsResponse),
};

/** Human copy for the error codes the UI expects (architecture error table). */
export function describeError(err: unknown): string {
  if (!(err instanceof ApiError)) return "Something went wrong.";
  switch (err.code) {
    case "job_already_claimed":
      return "Someone claimed this job first. Keep an eye out for the next drop.";
    case "forbidden":
      return "Only the company account can do that.";
    case "conflict":
      return err.message || "That job isn't in the right state for this action.";
    case "level_gate":
      return "Paid jobs unlock at Level 6. Keep solving tickets to get there.";
    case "validation_error":
      return err.message || "That input isn't valid.";
    case "unauthorized":
      return "This demo user isn't known to the API. Pick another one in the header.";
    case "not_found":
      return err.message || "Not found.";
    default:
      if (err.status === 502) return "The grader couldn't reach GitHub (502). Try again in a moment.";
      return err.message;
  }
}
