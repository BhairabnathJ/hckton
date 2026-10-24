import { z } from "zod";
import { hintPersona } from "../enums.js";

/** HintLog entity — one AI hint exchange within an attempt (architecture §3, C3). */
export const hintLog = z.object({
  id: z.string(),
  attemptId: z.string(),
  persona: hintPersona,
  question: z.string(),
  response: z.string(),
});

export type HintLog = z.infer<typeof hintLog>;
