/**
 * marketplace routes (thin): GET /jobs, POST /jobs/:id/claim,
 * POST /jobs/:id/submit, POST /jobs/:id/accept.
 *
 * Routes stay thin — HTTP + zod parsing only; all logic is in service.ts
 * (structure steering). Every response is parsed through the shared contract.
 * These routers are mounted behind the `currentUser` middleware in app.ts.
 */
import { Router } from "express";
import { jobsEndpoints } from "@sidequest/shared";
import { asyncHandler, parseOrThrow } from "../../http/validate.js";
import { requireUser, requireCompany } from "../users/middleware.js";
import * as marketplace from "./service.js";

export const jobsRouter: Router = Router();

// GET /jobs — list all jobs.
jobsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const jobs = await marketplace.list();
    res.json(jobsEndpoints.listJobsResponse.parse(jobs.map(marketplace.toContractJob)));
  }),
);

// POST /jobs — post a job. Company-only (403 forbidden otherwise).
jobsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    requireCompany(req);
    const body = parseOrThrow(jobsEndpoints.postJobRequest, req.body);
    const job = await marketplace.post(body);
    res.status(201).json(jobsEndpoints.postJobResponse.parse(marketplace.toContractJob(job)));
  }),
);

// POST /jobs/:id/claim — FCFS, Level 6 gated; 409 if already claimed.
jobsRouter.post(
  "/:id/claim",
  asyncHandler(async (req, res) => {
    const me = requireUser(req);
    const claimed = await marketplace.claim(req.params.id, me.id);
    res.json(jobsEndpoints.claimJobResponse.parse(marketplace.toContractJob(claimed)));
  }),
);

// POST /jobs/:id/submit — record the PR on a claimed job.
jobsRouter.post(
  "/:id/submit",
  asyncHandler(async (req, res) => {
    const me = requireUser(req);
    const body = parseOrThrow(jobsEndpoints.submitJobRequest, req.body);
    const submitted = await marketplace.submit(req.params.id, me.id, body.prUrl);
    res.json(jobsEndpoints.submitJobResponse.parse(marketplace.toContractJob(submitted)));
  }),
);

// POST /jobs/:id/accept — accept; // MOCK escrow release + payout. Company-only.
jobsRouter.post(
  "/:id/accept",
  asyncHandler(async (req, res) => {
    requireCompany(req);
    const accepted = await marketplace.accept(req.params.id);
    res.json(jobsEndpoints.acceptJobResponse.parse(marketplace.toContractJob(accepted)));
  }),
);
