/**
 * Browser-workspace client (.kiro/specs/browser-workspace).
 *
 * The workspace endpoints and the enriched Attempt fields are not in
 * @sidequest/shared yet, so their schemas live here, matching the spec:
 *   POST /attempts/:id/workspace            → { files: [{ path, type }] }
 *   GET  /attempts/:id/workspace/files      → same
 *   GET  /attempts/:id/workspace/file?path= → { path, content }
 *   PUT  /attempts/:id/workspace/file       → { ok }
 *   POST /attempts/:id/workspace/run-tests  → { passed, failed, output }
 *   POST /attempts/:id/workspace/submit     → 202, then poll GET /attempts/:id
 */
import { z } from "zod";
import { gradedAttempt, request, type GradedAttempt } from "./api";

// ---------------------------------------------------------------------------
// Contract (local until it lands in @sidequest/shared)
// ---------------------------------------------------------------------------

export const workspaceFile = z.object({ path: z.string(), type: z.enum(["file", "dir"]) });
export const workspaceTree = z.object({ files: z.array(workspaceFile) });
export const fileContent = z.object({ path: z.string(), content: z.string() });
export const saveResult = z.object({ ok: z.boolean() });
export const testRun = z.object({
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  output: z.string(),
});

export type WorkspaceFile = z.infer<typeof workspaceFile>;
export type TestRun = z.infer<typeof testRun>;
export type { GradedAttempt };

const base = (id: string) => `/attempts/${encodeURIComponent(id)}`;

export const workspaceApi = {
  open: (id: string) => request("POST", `${base(id)}/workspace`, workspaceTree),
  files: (id: string) => request("GET", `${base(id)}/workspace/files`, workspaceTree),
  read: (id: string, path: string) =>
    request("GET", `${base(id)}/workspace/file?path=${encodeURIComponent(path)}`, fileContent),
  write: (id: string, path: string, content: string) =>
    request("PUT", `${base(id)}/workspace/file`, saveResult, { body: { path, content } }),
  runTests: (id: string) => request("POST", `${base(id)}/workspace/run-tests`, testRun),
  submit: (id: string) => request("POST", `${base(id)}/workspace/submit`, null).then(() => undefined),
  attempt: (id: string) => request("GET", base(id), gradedAttempt),
};
