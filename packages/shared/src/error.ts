import { z } from "zod";
import { errorCode, type ErrorCode } from "./enums.js";

/**
 * The canonical error envelope for every non-2xx response.
 *
 * Shape is exactly `{ error: { code, message } }` per /docs/architecture.md.
 * `code` is a stable machine identifier (never a free-form string); `message`
 * is human-readable and carries no secret material (architecture §6).
 */
export const errorEnvelope = z.object({
  error: z.object({
    code: errorCode,
    message: z.string(),
  }),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelope>;

/** Helper to construct a well-typed error envelope body. */
export function makeError(code: ErrorCode, message: string): ErrorEnvelope {
  return { error: { code, message } };
}
