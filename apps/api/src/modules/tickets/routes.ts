/**
 * tickets routes (thin): GET /tickets (level-filtered), GET /tickets/:id.
 */
import { Router } from "express";
import { ticketsEndpoints } from "@sidequest/shared";
import { asyncHandler } from "../../http/validate.js";
import { requireUser } from "../users/middleware.js";
import { getPublic, listForLevel } from "./service.js";

export const ticketsRouter: Router = Router();

// GET /tickets — tickets filtered to the current user's level.
ticketsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const me = requireUser(req);
    const list = await listForLevel(me.level);
    res.json(ticketsEndpoints.listTicketsResponse.parse(list));
  }),
);

// GET /tickets/:id — a single public ticket view (no hiddenTestRef).
ticketsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const ticket = await getPublic(req.params.id);
    res.json(ticketsEndpoints.getTicketResponse.parse(ticket));
  }),
);
