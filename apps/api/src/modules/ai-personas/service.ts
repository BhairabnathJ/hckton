/**
 * ai-personas service (architecture §2 ai-personas).
 *
 * Two personas over the existing LLMProvider seam:
 *   - PM    : answers using ONLY the ticket + repo context; clarifies
 *             requirements and acceptance criteria; never gives solution code.
 *   - Coach : gives nudges only, never a solution; every coach message tied to
 *             an attempt is logged to HintLog and increments the attempt's
 *             hintsUsed (Requirement 6.4).
 *
 * Never emits hidden-test content, a reference solution, or hiddenTestRef.
 */
import type { HintPersona } from "@sidequest/shared";
import { createLLMProvider, type LLMMessage } from "../../llm/index.js";
import { prisma } from "../../db.js";

const PM_SYSTEM = [
  "You are a pragmatic product manager for a simulated company codebase.",
  "A junior engineer is asking you to clarify a ticket.",
  "Answer using ONLY the ticket and repository context you are given.",
  "Clarify requirements, scope, and what 'done' means against the acceptance criteria.",
  "Do NOT provide solution code, diffs, file-by-file instructions, or a step-by-step fix.",
  "If asked for the solution, redirect to the requirements. Be concise and concrete.",
].join(" ");

const COACH_SYSTEM = [
  "You are a senior engineering coach for a junior engineer on a simulated codebase.",
  "Give NUDGES ONLY: a direction to investigate, a question to ask, an edge case to consider.",
  "Never provide solution code, diffs, or a complete fix — guide, do not solve.",
  "Never reveal or reference hidden test contents. Be brief and encouraging.",
].join(" ");

interface TicketContext {
  title: string;
  description: string;
  acceptanceCriteria: string[];
}

/** Load bounded, PUBLIC ticket context for the prompt (never hidden-test refs). */
async function loadTicketContext(attemptId?: string): Promise<TicketContext | null> {
  if (!attemptId) return null;
  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: { ticket: true },
  });
  if (!attempt) return null;
  return {
    title: attempt.ticket.title,
    description: attempt.ticket.description,
    acceptanceCriteria: JSON.parse(attempt.ticket.acceptanceCriteria) as string[],
  };
}

function buildUserPrompt(question: string, ctx: TicketContext | null): string {
  const parts: string[] = [];
  if (ctx) {
    parts.push(`Ticket: ${ctx.title}`);
    parts.push(`Description: ${ctx.description}`);
    parts.push(`Acceptance criteria:\n${ctx.acceptanceCriteria.map((c) => `- ${c}`).join("\n")}`);
    parts.push("");
  }
  parts.push(`Question: ${question}`);
  return parts.join("\n");
}

export interface AskResult {
  persona: HintPersona;
  question: string;
  response: string;
}

/** Ask a persona. For `coach` with an attemptId, logs a HintLog + bumps hintsUsed. */
export async function ask(
  persona: HintPersona,
  question: string,
  attemptId: string | undefined,
): Promise<AskResult> {
  const ctx = await loadTicketContext(attemptId);
  const system = persona === "pm" ? PM_SYSTEM : COACH_SYSTEM;

  const messages: LLMMessage[] = [
    { role: "system", content: system },
    { role: "user", content: buildUserPrompt(question, ctx) },
  ];

  let response: string;
  try {
    const provider = createLLMProvider();
    response = await provider.complete(messages, { maxOutputTokens: 600 });
    if (!response.trim()) response = fallback(persona);
  } catch {
    // Architecture §9 fallback: a labeled response so a hint never blocks the loop.
    response = fallback(persona);
  }

  // Coach messages tied to an attempt are logged and count as a hint used.
  if (persona === "coach" && attemptId) {
    await prisma.$transaction([
      prisma.hintLog.create({
        data: { attemptId, persona: "coach", question, response },
      }),
      prisma.attempt.update({
        where: { id: attemptId },
        data: { hintsUsed: { increment: 1 } },
      }),
    ]);
  }

  return { persona, question, response };
}

function fallback(persona: HintPersona): string {
  return persona === "pm"
    ? "_[Automated fallback — the assistant was unavailable.]_ Re-read the acceptance criteria and confirm the exact input/output expected before changing code."
    : "_[Automated fallback — the assistant was unavailable.]_ Try to reproduce the failure first, then make the smallest change that could satisfy the acceptance criteria.";
}
