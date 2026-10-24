import { z } from "zod";

/**
 * browser-workspace endpoints — the in-browser editor surface for an attempt.
 *
 * All paths are owner-scoped (resolved from X-Demo-User) and additive to the
 * existing PR-URL submit flow. No hidden-test material is ever exposed here.
 */

/** A node in the workspace file tree. */
export const workspaceNode = z.object({
  path: z.string(),
  type: z.enum(["file", "dir"]),
});

/** POST /attempts/:id/workspace  and  GET /attempts/:id/workspace/files */
export const workspaceTree = z.object({
  files: z.array(workspaceNode),
});

/** GET /attempts/:id/workspace/file?path=… */
export const fileContent = z.object({
  path: z.string(),
  content: z.string(),
});

/** PUT /attempts/:id/workspace/file */
export const writeFileRequest = z.object({
  path: z.string(),
  content: z.string(),
});
export const writeFileResponse = z.object({ ok: z.literal(true) });

/** POST /attempts/:id/workspace/run-tests — visible tests only. */
export const runTestsResponse = z.object({
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  output: z.string(),
});

export type WorkspaceNode = z.infer<typeof workspaceNode>;
export type WorkspaceTree = z.infer<typeof workspaceTree>;
export type FileContent = z.infer<typeof fileContent>;
export type WriteFileRequest = z.infer<typeof writeFileRequest>;
export type RunTestsResponse = z.infer<typeof runTestsResponse>;
