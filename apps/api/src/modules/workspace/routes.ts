/**
 * workspace routes (thin) — the in-browser editor surface for an attempt.
 *
 * Mounted at /attempts/:id/workspace behind `currentUser`. Every handler is
 * owner-scoped via requireOwnedAttempt (404 unknown / 403 forbidden). Routes
 * stay thin; all logic is in service.ts. This is ADDITIVE — the PR-URL submit
 * flow at /attempts/:id/submit is untouched.
 */
import { Router } from "express";
import { workspaceEndpoints } from "@sidequest/shared";
import { asyncHandler, parseOrThrow } from "../../http/validate.js";
import { requireUser } from "../users/middleware.js";
import { attemptsEndpoints } from "@sidequest/shared";
import { submitWorkspace } from "../attempts/service.js";
import { toContractAttempt } from "../attempts/service.js";
import * as ws from "./service.js";

// mergeParams so the parent ":id" (attempt id) is visible here.
export const workspaceRouter: Router = Router({ mergeParams: true });

// POST /attempts/:id/workspace — create (idempotent) and return the tree.
workspaceRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const me = requireUser(req);
    const attempt = await ws.requireOwnedAttempt(req.params.id, me);
    await ws.ensureWorkspace(attempt.id, attempt.branch);
    const files = await ws.buildTree(attempt.id);
    res.json(workspaceEndpoints.workspaceTree.parse({ files }));
  }),
);

// GET /attempts/:id/workspace/files — the tree.
workspaceRouter.get(
  "/files",
  asyncHandler(async (req, res) => {
    const me = requireUser(req);
    const attempt = await ws.requireOwnedAttempt(req.params.id, me);
    const files = await ws.buildTree(attempt.id);
    res.json(workspaceEndpoints.workspaceTree.parse({ files }));
  }),
);

// GET /attempts/:id/workspace/file?path=… — read one file.
workspaceRouter.get(
  "/file",
  asyncHandler(async (req, res) => {
    const me = requireUser(req);
    const attempt = await ws.requireOwnedAttempt(req.params.id, me);
    const path = typeof req.query.path === "string" ? req.query.path : "";
    const result = await ws.readWorkspaceFile(attempt.id, path);
    res.json(workspaceEndpoints.fileContent.parse(result));
  }),
);

// PUT /attempts/:id/workspace/file — write one file.
workspaceRouter.put(
  "/file",
  asyncHandler(async (req, res) => {
    const me = requireUser(req);
    const attempt = await ws.requireOwnedAttempt(req.params.id, me);
    const body = parseOrThrow(workspaceEndpoints.writeFileRequest, req.body);
    await ws.writeWorkspaceFile(attempt.id, body.path, body.content);
    res.json(workspaceEndpoints.writeFileResponse.parse({ ok: true }));
  }),
);

// POST /attempts/:id/workspace/run-tests — visible tests only.
workspaceRouter.post(
  "/run-tests",
  asyncHandler(async (req, res) => {
    const me = requireUser(req);
    const attempt = await ws.requireOwnedAttempt(req.params.id, me);
    const result = await ws.runTests(attempt.id);
    res.json(workspaceEndpoints.runTestsResponse.parse(result));
  }),
);

// POST /attempts/:id/workspace/submit — grade the workspace; respond 202.
workspaceRouter.post(
  "/submit",
  asyncHandler(async (req, res) => {
    const me = requireUser(req);
    const attempt = await ws.requireOwnedAttempt(req.params.id, me);
    // Ensure the workspace exists before grading.
    await ws.ensureWorkspace(attempt.id, attempt.branch);
    const resolved = await submitWorkspace(attempt.id, ws.workspaceDir(attempt.id), me.handle);
    res.status(202).json(attemptsEndpoints.getAttemptResponse.parse(toContractAttempt(resolved)));
  }),
);
