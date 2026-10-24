import { BaseLLMProvider } from "../base.js";
import {
  LLMConfigError,
  type LLMMessage,
  type LLMCompleteOptions,
} from "../types.js";

const DEFAULT_MODEL = "anthropic/claude-3.5-sonnet";
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Optional LLMProvider: OpenRouter (LLM_PROVIDER=openrouter). Uses the
 * OpenAI-compatible chat-completions HTTP API with OPENROUTER_API_KEY, so no
 * extra SDK dependency is required.
 */
export class OpenRouterProvider extends BaseLLMProvider {
  readonly name = "openrouter";
  private readonly apiKey: string;
  private readonly model: string;

  constructor(opts?: { apiKey?: string; model?: string }) {
    super();
    const apiKey = opts?.apiKey ?? process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new LLMConfigError(
        "OPENROUTER_API_KEY is not set. Set OPENROUTER_API_KEY to use the " +
          "openrouter provider (or select another with LLM_PROVIDER).",
      );
    }
    this.apiKey = apiKey;
    this.model = opts?.model ?? process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;
  }

  async complete(
    messages: LLMMessage[],
    options?: LLMCompleteOptions,
  ): Promise<string> {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "SideQuest",
      },
      body: JSON.stringify({
        model: options?.model ?? this.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        ...(options?.temperature !== undefined
          ? { temperature: options.temperature }
          : {}),
        ...(options?.maxOutputTokens !== undefined
          ? { max_tokens: options.maxOutputTokens }
          : {}),
      }),
    });
    if (!res.ok) {
      // Do not echo headers/credentials; surface status + provider message only.
      const detail = await res.text().catch(() => "");
      throw new Error(`OpenRouter request failed (${res.status}): ${detail.slice(0, 500)}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content ?? "";
  }
}
