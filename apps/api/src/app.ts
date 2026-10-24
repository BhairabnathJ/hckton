/**
 * The core-api Express app (architecture §1).
 *
 * Mounts every feature module's thin router and the single canonical error
 * middleware. Routes that need a current user are mounted behind the
 * `currentUser` middleware (// MOCK X-Demo-User resolution). The error
 * middleware is mounted LAST so thrown AppErrors/zod errors become the
 * canonical `{ error: { code, message } }` envelope.
 */
import express, { type Express } from "express";
import { errorMiddleware } from "./http/error.js";
import { currentUser } from "./modules/users/middleware.js";
import { usersRouter } from "./modules/users/routes.js";
import { ticketsRouter } from "./modules/tickets/routes.js";
import { attemptsRouter } from "./modules/attempts/routes.js";
import { aiRouter } from "./modules/ai-personas/routes.js";
import { eventsRouter } from "./modules/events/routes.js";
import { adminRouter } from "./modules/admin/routes.js";

export function createApp(): Express {
  const app = express();
  app.use(express.json());

  // Health check (no auth).
  app.get("/health", (_req, res) => res.json({ ok: true }));

  // SSE stream (no current-user requirement — it is a transport).
  app.use("/events", eventsRouter);

  // Authed feature routers (current user resolved from X-Demo-User, // MOCK).
  app.use("/users", currentUser, usersRouter);
  app.use("/tickets", currentUser, ticketsRouter);
  app.use("/attempts", currentUser, attemptsRouter);
  app.use("/ai", currentUser, aiRouter);
  app.use("/admin", currentUser, adminRouter);

  // Canonical error envelope — mounted last.
  app.use(errorMiddleware);
  return app;
}
