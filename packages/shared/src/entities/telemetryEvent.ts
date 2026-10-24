import { z } from "zod";

/** TelemetryEvent entity — an opt-in product event. */
export const telemetryEvent = z.object({
  id: z.string(),
  userId: z.string(),
  type: z.string(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime(),
});

export type TelemetryEvent = z.infer<typeof telemetryEvent>;
