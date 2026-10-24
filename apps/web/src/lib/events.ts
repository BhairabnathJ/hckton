import { useEffect, useRef } from "react";
import { sseEvent, type SseEvent } from "@sidequest/shared";
import { API_URL } from "./api";

const NAMED = ["job.dropped", "job.claimed", "job.claim_expired"] as const;

/**
 * Subscribe to GET /events (Server-Sent Events). Only contract events
 * (job.dropped, job.claimed, job.claim_expired) are passed to the handler;
 * EventSource can't send X-Demo-User, which /events doesn't require.
 */
export function useJobEvents(onEvent: (event: SseEvent) => void): void {
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const source = new EventSource(`${API_URL}/events`);
    const dispatch = (msg: MessageEvent) => {
      try {
        const parsed = sseEvent.safeParse(JSON.parse(msg.data));
        if (parsed.success) handler.current(parsed.data);
      } catch {
        // ignore non-JSON frames
      }
    };
    for (const name of NAMED) source.addEventListener(name, dispatch);
    source.onmessage = dispatch;
    return () => source.close();
  }, []);
}
