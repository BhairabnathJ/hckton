import type {
  LLMProvider,
  LLMMessage,
  LLMCompleteOptions,
  ReviewRequest,
  ReviewResult,
} from "./types.js";

/** Build the persona system prompt for a review (the review-prompt contract). */
export function personaSystemPrompt(persona: string): string {
  switch (persona) {
    case "pm":
      return (
        "You are a pragmatic product manager reviewing a junior engineer's work on a " +
        "simulated company codebase. Frame feedback around the user-facing acceptance " +
        "criteria and what 'done' means for the customer. Be concise and concrete."
      );
    case "coach":
      return (
        "You are a senior engineering coach reviewing a junior engineer's pull request " +
        "on a simulated company codebase. Give specific, encouraging, actionable " +
        "guidance: reproduce before fixing, smallest change that passes, edge cases. " +
        "Never reveal hidden test contents. Be concise."
      );
    default:
      return (
        `You are a helpful reviewer with the persona "${persona}". Give concise, ` +
        "actionable feedback and never reveal hidden test contents."
      );
  }
}

/**
 * Shared base: implements `review()` on top of each provider's `complete()`,
 * so concrete providers only implement `complete()` and `name`.
 */
export abstract class BaseLLMProvider implements LLMProvider {
  abstract readonly name: string;
  abstract complete(
    messages: LLMMessage[],
    options?: LLMCompleteOptions,
  ): Promise<string>;

  async review(request: ReviewRequest): Promise<ReviewResult> {
    const messages: LLMMessage[] = [
      { role: "system", content: personaSystemPrompt(request.persona) },
      { role: "user", content: request.prompt },
    ];
    const text = await this.complete(messages);
    return { text, provider: this.name };
  }
}

/** Collapse messages into a single prompt for providers without a roles API. */
export function flattenMessages(messages: LLMMessage[]): {
  system: string;
  user: string;
} {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const user = messages
    .filter((m) => m.role !== "system")
    .map((m) => (m.role === "assistant" ? `Assistant: ${m.content}` : m.content))
    .join("\n\n");
  return { system, user };
}
