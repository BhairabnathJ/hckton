/**
 * zod request validation helper (Requirement 1.4).
 *
 * `safeParse`s a value against a schema and throws an AppError
 * (`validation_error`, 400) on failure, so the error middleware produces the
 * canonical envelope and no state change occurs.
 */
import type { ZodType } from "zod";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import { AppError, summarizeZod } from "./error.js";

export function parseOrThrow<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError("validation_error", 400, summarizeZod(result.error));
  }
  return result.data;
}

/** Wrap an async route handler so thrown errors reach the error middleware. */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
