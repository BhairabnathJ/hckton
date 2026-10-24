/**
 * events routes (thin): GET /events — a Server-Sent Events stream.
 */
import { Router } from "express";
import { publish, subscribe } from "./service.js";

export const eventsRouter: Router = Router();

// GET /events — open an SSE stream; registers the connection and heartbeats.
eventsRouter.get("/", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  // Initial comment so proxies/clients open the stream immediately.
  res.write(": connected\n\n");

  const unsubscribe = subscribe(res);
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 15_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
});

export { publish };
