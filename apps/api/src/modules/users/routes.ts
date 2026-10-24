/**
 * users routes (thin): GET /users/me, GET /users/:id, PATCH /users/me.
 *
 * PATCH /users/me (telemetry opt-in) is the only mutating users endpoint; the
 * reads are side-effect free (Requirement 2.7).
 */
import { Router } from "express";
import { usersEndpoints } from "@sidequest/shared";
import { asyncHandler, parseOrThrow } from "../../http/validate.js";
import { requireUser } from "./middleware.js";
import { getById, setTelemetryOptIn, toContractUser } from "./service.js";

export const usersRouter: Router = Router();

// GET /users/me — the current user (resolved from X-Demo-User).
usersRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    const me = requireUser(req);
    res.json(usersEndpoints.getMeResponse.parse(toContractUser(me)));
  }),
);

// GET /users/:id — a user's public profile.
usersRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const row = await getById(req.params.id);
    res.json(usersEndpoints.getUserResponse.parse(toContractUser(row)));
  }),
);

// PATCH /users/me — toggle the telemetry opt-in (the only mutating users route).
usersRouter.patch(
  "/me",
  asyncHandler(async (req, res) => {
    const me = requireUser(req);
    const body = parseOrThrow(usersEndpoints.updateOptInRequest, req.body);
    const updated = await setTelemetryOptIn(me.id, body.telemetryOptIn);
    res.json(usersEndpoints.updateOptInResponse.parse(toContractUser(updated)));
  }),
);
