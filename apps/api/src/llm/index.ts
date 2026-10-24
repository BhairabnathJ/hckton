/**
 * The LLMProvider seam (architecture §1/§2 ai-personas, §7).
 *
 * Default implementation is Gemini (official Google Gen AI SDK). Bedrock and
 * OpenRouter are optional, selected by LLM_PROVIDER. MockProvider returns canned
 * per-ticket reviews for offline demos.
 */
export * from "./types.js";
export { personaSystemPrompt } from "./base.js";
export { GeminiProvider } from "./providers/gemini.js";
export { BedrockProvider } from "./providers/bedrock.js";
export { OpenRouterProvider } from "./providers/openrouter.js";
export { MockProvider } from "./providers/mock.js";
export { createLLMProvider, type ProviderName } from "./factory.js";
