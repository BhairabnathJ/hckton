/**
 * attempts routes (thin): POST /attempts, POST /attempts/:id/submit, GET /attempts/:id.
 *
 * submit grades inline (Option B synchronous) and responds 202 with the
 * resolved attempt, per the architecture's submit contract.
 */
import { Router } from "express";
import { attemptsEndpoints } from "@sidequest/shared";
import { asyncHandler, parseOrThrow } from "../../http/validate.js";
import { requireUser } from "../users/middleware.js";
import { getById, start, submit, toContractAttempt } from "./service.js";
import { AppError } from "../../http/error.js";

export const attemptsRouter: Router = Router();

// POST /attempts — start an attempt in status in_progress.
attemptsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const me = requireUser(req);
    const body = parseOrThrow(attemptsEndpoints.startAttemptRequest, req.body);
    const attempt = await start(me, body.ticketId);
    res.status(201).json(attemptsEndpoints.startAttemptResponse.parse(toContractAttempt(attempt)));
  }),
);

// POST /attempts/:id/submit — submit a PR; grade inline; respond 202.
attemptsRouter.post(
  "/:id/submit",
  asyncHandler(async (req, res) => {
    const me = requireUser(req);
    const body = parseOrThrow(attemptsEndpoints.submitAttemptRequest, req.body);
    const existing = await getById(req.params.id);
    if (existing.userId !== me.id) {
      throw AppError.notFound(`Attempt "${req.params.id}" not found.`);
    }
    const resolved = await submit(req.params.id, body.prUrl);
    res.status(202).json(attemptsEndpoints.submitAttemptResponse.parse(toContractAttempt(resolved)));
  }),
);

// GET /attempts/:id — the current attempt and its status.
attemptsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const attempt = await getById(req.params.id);
    res.json(attemptsEndpoints.getAttemptResponse.parse(toContractAttempt(attempt)));
  }),
);
