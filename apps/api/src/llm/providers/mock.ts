import { BaseLLMProvider, personaSystemPrompt } from "../base.js";
import type {
  LLMMessage,
  ReviewRequest,
  ReviewResult,
} from "../types.js";

/**
 * Optional LLMProvider: MockProvider (LLM_PROVIDER=mock). Returns canned,
 * clearly-labeled reviews per ticket so the AI review flow demos fully offline
 * with no network, no credentials, and deterministic output. This also backs
 * the architecture's "Bedrock latency/outage" fallback (a canned review).
 */

/** Canned per-ticket reviews, keyed by ticketId then persona. */
const CANNED: Record<string, Record<string, string>> = {
  "brightline-l1-pagination": {
    pm: "[MOCK review] From a product view: pagination must never drop or duplicate a shipment across pages — that erodes trust in the list. Confirm page 1 and page 2 don't overlap and nothing is skipped at the boundary.",
    coach: "[MOCK review] Nice scope. The bug is a classic off-by-one in the offset/limit math. Write a test that fetches page 1 and page 2 and asserts the id sets are disjoint and contiguous, then fix the slice. Smallest change wins.",
  },
  "brightline-l2-eta-timezone": {
    pm: "[MOCK review] Drivers in non-UTC zones are seeing ETAs off by whole hours — that's a visible correctness bug for customers tracking shipments. Make sure UTC and non-UTC drivers differ only by the true offset.",
    coach: "[MOCK review] The timezone conversion is being dropped — a local time is treated as UTC. Reproduce with a non-UTC driver fixture first, assert the corrected ETA, then restore the tz-aware conversion. Watch DST edge cases.",
  },
  "brightline-l3-route-eta": {
    pm: "[MOCK review] This is a new capability: GET /routes/{id}/eta. Define 'done' as a correct ETA from distance and average speed, plus a clean 404 for unknown routes.",
    coach: "[MOCK review] Good feature slice. Add the endpoint, compute eta = distance / average_speed, and return 404 for unknown ids. Add one happy-path test and one unknown-id test before wiring the route.",
  },
};

export class MockProvider extends BaseLLMProvider {
  readonly name = "mock";

  async complete(messages: LLMMessage[]): Promise<string> {
    // Echo a deterministic, clearly-labeled response for generic completions.
    const user = messages.filter((m) => m.role !== "system").map((m) => m.content).join(" ");
    return `[MOCK LLM] ${user.slice(0, 280)}`;
  }

  override async review(request: ReviewRequest): Promise<ReviewResult> {
    const byPersona = CANNED[request.ticketId];
    const canned =
      byPersona?.[request.persona] ??
      `[MOCK review] (${request.persona}) ${personaSystemPrompt(request.persona).slice(0, 80)}… No canned review for ticket "${request.ticketId}"; returning a generic offline review.`;
    return { text: canned, provider: this.name };
  }
}
