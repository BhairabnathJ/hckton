/**
 * events service — the SSE hub transport (architecture §2 events).
 *
 * Owns transport ONLY: it maintains per-subscriber connections and fans
 * published domain events out. It holds no business logic. core-api publishes
 * attempt/progression events here; the downstream marketplace spec reuses the
 * same hub with the `job.*` event names (contract `sseEvent`) unchanged.
 */
import type { Response } from "express";

/** A server-side domain event fanned out to SSE subscribers. */
export interface DomainEvent {
  type: string;
  [key: string]: unknown;
}

const subscribers = new Set<Response>();

/** Register an SSE connection; returns an unsubscribe function. */
export function subscribe(res: Response): () => void {
  subscribers.add(res);
  return () => subscribers.delete(res);
}

/** Fan an event out to every current subscriber. */
export function publish(event: DomainEvent): void {
  const frame = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
  for (const res of subscribers) {
    res.write(frame);
  }
}

export function subscriberCount(): number {
  return subscribers.size;
}
