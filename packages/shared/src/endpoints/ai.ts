import { z } from "zod";
import { hintPersona } from "../enums.js";

/**
 * POST /ai/pm and POST /ai/coach share this shape. The response aligns with the
 * HintLog entity fields (persona, question, response).
 */
export const askPersonaRequest = z.object({
  question: z.string().min(1),
  attemptId: z.string().optional(),
});

export const askPersonaResponse = z.object({
  persona: hintPersona,
  question: z.string(),
  response: z.string(),
});

export type AskPersonaRequest = z.infer<typeof askPersonaRequest>;
export type AskPersonaResponse = z.infer<typeof askPersonaResponse>;
