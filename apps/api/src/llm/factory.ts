import type { LLMProvider } from "./types.js";
import { LLMConfigError } from "./types.js";
import { GeminiProvider } from "./providers/gemini.js";
import { BedrockProvider } from "./providers/bedrock.js";
import { OpenRouterProvider } from "./providers/openrouter.js";
import { MockProvider } from "./providers/mock.js";

export type ProviderName = "gemini" | "bedrock" | "openrouter" | "mock";

const KNOWN: ProviderName[] = ["gemini", "bedrock", "openrouter", "mock"];

/**
 * Select the LLMProvider implementation from the LLM_PROVIDER env var.
 * Defaults to "gemini". Throws LLMConfigError on an unknown value or when the
 * selected provider is missing its required configuration.
 */
export function createLLMProvider(name?: string): LLMProvider {
  const selected = (name ?? process.env.LLM_PROVIDER ?? "gemini").trim().toLowerCase();

  if (!KNOWN.includes(selected as ProviderName)) {
    throw new LLMConfigError(
      `Unknown LLM_PROVIDER "${selected}". Expected one of: ${KNOWN.join(", ")}.`,
    );
  }

  switch (selected as ProviderName) {
    case "gemini":
      return new GeminiProvider();
    case "bedrock":
      return new BedrockProvider();
    case "openrouter":
      return new OpenRouterProvider();
    case "mock":
      return new MockProvider();
    default:
      // Unreachable given the guard above.
      throw new LLMConfigError(`Unhandled LLM provider "${selected}".`);
  }
}
