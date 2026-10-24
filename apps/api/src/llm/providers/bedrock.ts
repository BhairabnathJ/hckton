import {
  BedrockRuntimeClient,
  ConverseCommand,
  type Message,
} from "@aws-sdk/client-bedrock-runtime";
import { BaseLLMProvider } from "../base.js";
import {
  LLMConfigError,
  type LLMMessage,
  type LLMCompleteOptions,
} from "../types.js";

const DEFAULT_MODEL = "anthropic.claude-3-5-sonnet-20240620-v1:0";

/**
 * Optional LLMProvider: Amazon Bedrock (LLM_PROVIDER=bedrock) via the
 * bedrock-runtime Converse API. Credentials/region come from the standard AWS
 * env chain (AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY).
 */
export class BedrockProvider extends BaseLLMProvider {
  readonly name = "bedrock";
  private readonly client: BedrockRuntimeClient;
  private readonly model: string;

  constructor(opts?: { region?: string; model?: string }) {
    super();
    const region = opts?.region ?? process.env.AWS_REGION;
    if (!region) {
      throw new LLMConfigError(
        "AWS_REGION is not set. Set AWS_REGION (and AWS credentials) to use the " +
          "bedrock provider (or select another with LLM_PROVIDER).",
      );
    }
    this.client = new BedrockRuntimeClient({ region });
    this.model = opts?.model ?? process.env.BEDROCK_MODEL_ID ?? DEFAULT_MODEL;
  }

  async complete(
    messages: LLMMessage[],
    options?: LLMCompleteOptions,
  ): Promise<string> {
    const system = messages
      .filter((m) => m.role === "system")
      .map((m) => ({ text: m.content }));

    const convo: Message[] = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: [{ text: m.content }],
      }));

    const res = await this.client.send(
      new ConverseCommand({
        modelId: options?.model ?? this.model,
        messages: convo,
        ...(system.length ? { system } : {}),
        inferenceConfig: {
          ...(options?.temperature !== undefined
            ? { temperature: options.temperature }
            : {}),
          ...(options?.maxOutputTokens !== undefined
            ? { maxTokens: options.maxOutputTokens }
            : {}),
        },
      }),
    );

    const blocks = res.output?.message?.content ?? [];
    return blocks.map((b) => ("text" in b ? b.text : "")).join("");
  }
}
