/**
 * The LLMProvider seam (architecture §1, §2 ai-personas, §7).
 *
 * A single interface behind which every LLM backend sits. The `ai-personas`
 * module (downstream core-api spec) calls this seam to generate persona
 * responses and AI code reviews; the mock server's /ai/* endpoints use it too.
 * Swapping providers is an env-var choice (LLM_PROVIDER) — no calling code
 * changes.
 *
 * Credentials are read ONLY from environment variables (architecture §6) and
 * are never logged or returned in responses.
 */

/** A single chat turn. */
export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Options for a completion request. */
export interface LLMCompleteOptions {
  /** Optional per-call model override; otherwise the provider default is used. */
  model?: string;
  /** Sampling temperature (0..1). Provider applies a sensible default if omitted. */
  temperature?: number;
  /** Optional cap on output tokens. */
  maxOutputTokens?: number;
}

/** A persona review request (used by ai-personas for code review). */
export interface ReviewRequest {
  /** The persona voice, e.g. "pm" or "coach". */
  persona: string;
  /** The ticket id the review is for (lets MockProvider pick a canned review). */
  ticketId: string;
  /** The question or the diff/context the persona should respond to. */
  prompt: string;
}

/** A persona review result. */
export interface ReviewResult {
  /** The persona's free-text response. */
  text: string;
  /** Which provider produced this (for observability; never a secret). */
  provider: string;
}

/**
 * The provider seam. Implementations: GeminiProvider (default), BedrockProvider,
 * OpenRouterProvider, MockProvider.
 */
export interface LLMProvider {
  /** Stable provider name, e.g. "gemini" | "bedrock" | "openrouter" | "mock". */
  readonly name: string;

  /** Low-level completion: given messages, return the assistant's text. */
  complete(messages: LLMMessage[], options?: LLMCompleteOptions): Promise<string>;

  /** High-level persona review built on top of `complete`. */
  review(request: ReviewRequest): Promise<ReviewResult>;
}

/** Thrown when a provider is selected but its required env config is missing. */
export class LLMConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LLMConfigError";
  }
}
