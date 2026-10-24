import { GoogleGenAI } from "@google/genai";
import { BaseLLMProvider, flattenMessages } from "../base.js";
import {
  LLMConfigError,
  type LLMMessage,
  type LLMCompleteOptions,
} from "../types.js";

const DEFAULT_MODEL = "gemini-3.8-flash";

/**
 * Default LLMProvider: Google Gemini via the official Google Gen AI SDK
 * (@google/genai), using the Gemini Developer API with GEMINI_API_KEY.
 */
export class GeminiProvider extends BaseLLMProvider {
  readonly name = "gemini";
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(opts?: { apiKey?: string; model?: string }) {
    super();
    const apiKey = opts?.apiKey ?? process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // Name the missing variable without printing any value (architecture §6).
      throw new LLMConfigError(
        "GEMINI_API_KEY is not set. Set GEMINI_API_KEY to use the gemini provider " +
          "(or select another with LLM_PROVIDER).",
      );
    }
    this.client = new GoogleGenAI({ apiKey });
    this.model = opts?.model ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
  }

  async complete(
    messages: LLMMessage[],
    options?: LLMCompleteOptions,
  ): Promise<string> {
    const { system, user } = flattenMessages(messages);
    const response = await this.client.models.generateContent({
      model: options?.model ?? this.model,
      contents: user,
      config: {
        ...(system ? { systemInstruction: system } : {}),
        ...(options?.temperature !== undefined
          ? { temperature: options.temperature }
          : {}),
        ...(options?.maxOutputTokens !== undefined
          ? { maxOutputTokens: options.maxOutputTokens }
          : {}),
      },
    });
    return response.text ?? "";
  }
}
