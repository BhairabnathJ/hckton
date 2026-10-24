/**
 * LLM provider test call.
 *
 * Selects a provider (LLM_PROVIDER, or auto-detects one whose credentials are
 * present, else falls back to mock) and performs a real `complete` + `review`
 * call, printing the output. Never prints credential values.
 *
 *   npm run llm:test                 # uses LLM_PROVIDER or auto-detect
 *   LLM_PROVIDER=gemini npm run llm:test
 *   LLM_PROVIDER=mock   npm run llm:test   # always works offline
 */
import { createLLMProvider, type ProviderName } from "./index.js";

/** Pick a provider: explicit env wins; else the first with creds; else mock. */
function pickProvider(): ProviderName {
  const explicit = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (explicit) return explicit as ProviderName;
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.AWS_REGION && process.env.AWS_ACCESS_KEY_ID) return "bedrock";
  if (process.env.OPENROUTER_API_KEY) return "openrouter";
  return "mock";
}

async function main() {
  const name = pickProvider();
  console.log(`Selected provider: ${name}`);

  const provider = createLLMProvider(name);

  console.log("\n[1] complete() — generic prompt");
  const completion = await provider.complete([
    { role: "system", content: "You are a terse assistant." },
    { role: "user", content: "Reply with exactly: SideQuest LLM OK" },
  ]);
  console.log(`  -> ${completion.trim().slice(0, 300)}`);

  console.log("\n[2] review() — coach persona on the L1 pagination ticket");
  const review = await provider.review({
    persona: "coach",
    ticketId: "brightline-l1-pagination",
    prompt:
      "Here is my diff fixing the shipments pagination. Anything I'm missing?",
  });
  console.log(`  provider: ${review.provider}`);
  console.log(`  -> ${review.text.trim().slice(0, 500)}`);

  if (!completion.trim() && name !== "mock") {
    console.error("\n=== LLM TEST FAILED: empty completion from provider ===");
    process.exit(1);
  }
  console.log("\n=== LLM TEST PASSED ===");
}

main().catch((err) => {
  console.error(`\n=== LLM TEST FAILED: ${(err as Error).message} ===`);
  process.exit(1);
});
