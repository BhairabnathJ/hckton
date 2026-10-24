/**
 * The senior-engineer AI reviewer (grader spec Requirement 6).
 *
 * Reuses the existing LLMProvider seam (@sidequest/api/llm), selected by
 * LLM_PROVIDER. Builds the fixed reviewer prompt, calls the provider with the
 * PR diff, parses the final verdict line, and falls back to a canned review +
 * test-derived verdict on error/timeout (architecture §9). Never includes
 * credentials in the output.
 */
import { createLLMProvider, type LLMProvider } from "@sidequest/api/llm";
import type { Ticket } from "./tickets.js";
import type { SandboxOutcome, Verdict } from "./types.js";

const SYSTEM_PROMPT = [
  "You are a senior software engineer reviewing a pull request on THIS codebase.",
  "Be specific and ALWAYS reference file:line when you cite code.",
  "Point out bugs, missed edge cases, and style issues that matter for this codebase.",
  "Do NOT write the fix or provide corrected code — guide, don't solve.",
  "End your review with a single final line that is EXACTLY `APPROVE` or `REQUEST_CHANGES`.",
].join(" ");

/** Generous timeout — the configured Gemini model has been observed near ~50s. */
const LLM_TIMEOUT_MS = 90_000;

export interface ReviewInput {
  diff: string;
  ticket: Ticket;
  outcome: SandboxOutcome;
}

export interface ReviewOutput {
  text: string;
  verdict: Verdict;
  provider: string;
  modelVerdictMissing: boolean;
}

/** Derive a verdict from the test outcome when the model doesn't give one. */
function fallbackVerdict(outcome: SandboxOutcome): Verdict {
  return outcome.passed ? "APPROVE" : "REQUEST_CHANGES";
}

/** Parse the final non-empty line as the verdict. */
export function parseVerdict(
  text: string,
  outcome: SandboxOutcome,
): { verdict: Verdict; missing: boolean } {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const last = lines[lines.length - 1] ?? "";
  if (last === "APPROVE" || last === "REQUEST_CHANGES") {
    return { verdict: last, missing: false };
  }
  return { verdict: fallbackVerdict(outcome), missing: true };
}

function buildUserPrompt(input: ReviewInput): string {
  const criteria = input.ticket.acceptanceCriteria.map((c) => `- ${c}`).join("\n");
  const testSummary = input.outcome.passed
    ? "Hidden tests: PASSED."
    : `Hidden tests: FAILED (${input.outcome.testsFailed} failing).`;
  return [
    `Ticket: ${input.ticket.title}`,
    `Description: ${input.ticket.description}`,
    `Acceptance criteria:\n${criteria}`,
    testSummary,
    "",
    "Here is the pull request diff to review:",
    "```diff",
    input.diff.slice(0, 24_000),
    "```",
  ].join("\n");
}

export async function review(
  input: ReviewInput,
  providerOverride?: LLMProvider,
): Promise<ReviewOutput> {
  const provider = providerOverride ?? createLLMProvider();
  const userPrompt = buildUserPrompt(input);

  try {
    const withTimeout = new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error("LLM review timed out")), LLM_TIMEOUT_MS),
    );
    const text = await Promise.race([
      provider.complete(
        [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        { maxOutputTokens: 1200 },
      ),
      withTimeout,
    ]);

    const { verdict, missing } = parseVerdict(text, input.outcome);
    // If the model omitted a verdict line, append the derived one so the posted
    // comment always ends with a valid verdict.
    const finalText = missing ? `${text.trim()}\n\n${verdict}` : text.trim();
    return { text: finalText, verdict, provider: provider.name, modelVerdictMissing: missing };
  } catch (err) {
    // Architecture §9 fallback: canned, clearly-labeled review; grading still completes.
    const verdict = fallbackVerdict(input.outcome);
    const text = [
      "_[Automated fallback review — the AI reviewer was unavailable, so this is derived from the hidden-test outcome.]_",
      "",
      input.outcome.passed
        ? "The hidden tests passed. No blocking issues detected automatically."
        : `The hidden tests failed (${input.outcome.testsFailed} failing). Re-examine the acceptance criteria and the failing cases.`,
      "",
      verdict,
    ].join("\n");
    return { text, verdict, provider: "fallback", modelVerdictMissing: true };
  }
}
