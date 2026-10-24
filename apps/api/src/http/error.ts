/**
 * Canonical error handling (architecture §6, Requirement 1.3).
 *
 * Every non-2xx response is `{ error: { code, message } }` with a stable
 * machine-readable `code` from the shared `errorCode` enum. Messages carry no
 * secret material.
 */
import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { type ErrorCode, makeError } from "@sidequest/shared";

/** A typed application error that maps to an HTTP status + error code. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }

  static notFound(message = "Not found"): AppError {
    return new AppError("not_found", 404, message);
  }
  static unauthorized(message = "Unauthorized"): AppError {
    return new AppError("unauthorized", 401, message);
  }
  static levelGate(message = "Level requirement not met"): AppError {
    return new AppError("level_gate", 403, message);
  }
  static forbidden(message = "Forbidden"): AppError {
    return new AppError("forbidden", 403, message);
  }
  static conflict(message = "Conflict"): AppError {
    return new AppError("conflict", 409, message);
  }
  static validation(message = "Invalid request"): AppError {
    return new AppError("validation_error", 400, message);
  }
  static internal(message = "Internal error"): AppError {
    return new AppError("internal", 500, message);
  }
}

/** Express error middleware — the single place that writes the error envelope. */
export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (res.headersSent) return;

  if (err instanceof AppError) {
    res.status(err.status).json(makeError(err.code, err.message));
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json(makeError("validation_error", summarizeZod(err)));
    return;
  }
  // Unknown fault: never leak internals or secrets.
  res.status(500).json(makeError("internal", "An unexpected error occurred."));
}

/** A compact, secret-free summary of a zod failure for the error message. */
export function summarizeZod(err: ZodError): string {
  return err.issues
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}
