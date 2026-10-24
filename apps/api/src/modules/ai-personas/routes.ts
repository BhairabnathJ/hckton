/**
 * ai-personas routes (thin): POST /ai/pm, POST /ai/coach.
 */
import { Router } from "express";
import { aiEndpoints } from "@sidequest/shared";
import { asyncHandler, parseOrThrow } from "../../http/validate.js";
import { ask } from "./service.js";

export const aiRouter: Router = Router();

aiRouter.post(
  "/pm",
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(aiEndpoints.askPersonaRequest, req.body);
    const result = await ask("pm", body.question, body.attemptId);
    res.json(aiEndpoints.askPersonaResponse.parse(result));
  }),
);

aiRouter.post(
  "/coach",
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(aiEndpoints.askPersonaRequest, req.body);
    const result = await ask("coach", body.question, body.attemptId);
    res.json(aiEndpoints.askPersonaResponse.parse(result));
  }),
);
