/**
 * Environment resolution + startup credential checks (architecture §6).
 *
 * Credentials are read ONLY from the environment and are never logged or
 * returned in a response. A missing credential for the SELECTED provider throws
 * an error that names the missing variable without printing any value.
 *
 * `.env` is operator-managed — this module READS it (a tiny loader, no runtime
 * dependency) but never creates or edits it. `DATABASE_URL` is defaulted in
 * code when absent so SQLite works out of the box.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
// apps/api/src -> repo root is three levels up.
export const REPO_ROOT = resolve(here, "../../..");

/** Load KEY=VALUE lines from .env into process.env without overriding set vars. */
export function loadDotenv(): void {
  const file = resolve(REPO_ROOT, ".env");
  if (!existsSync(file)) return;
  const text = readFileSync(file, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

export interface Env {
  port: number;
  databaseUrl: string;
  llmProvider: string;
  graderRunner: string;
}

/** The default on-disk SQLite database, relative to apps/api (matches the
 * `prisma db push` default, which resolves `file:./dev.db` next to schema.prisma). */
const DEFAULT_DATABASE_URL = `file:${resolve(here, "../prisma/dev.db")}`;

/**
 * Load env, applying defaults. Call once at process start BEFORE constructing
 * the PrismaClient so DATABASE_URL is present.
 */
export function loadEnv(): Env {
  loadDotenv();

  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = DEFAULT_DATABASE_URL;
  }

  return {
    port: Number(process.env.PORT ?? 4000),
    databaseUrl: process.env.DATABASE_URL,
    llmProvider: (process.env.LLM_PROVIDER ?? "gemini").trim().toLowerCase(),
    graderRunner: (process.env.GRADER_RUNNER ?? "subprocess").trim().toLowerCase(),
  };
}

/** Thrown when a required credential is missing; names the var, never the value. */
export class MissingCredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissingCredentialError";
  }
}

/**
 * Verify the credentials the selected providers require are present. Names the
 * missing variable without printing any secret (§6). Called at server start.
 *
 * - The LLM reviewer provider (LLM_PROVIDER) needs its key.
 * - Grading a real PR needs GITHUB_TOKEN; the grader also checks this, but we
 *   surface it early with a clear message.
 */
export function assertCredentials(env: Env, opts?: { requireGithub?: boolean }): void {
  const requireGithub = opts?.requireGithub ?? false;

  switch (env.llmProvider) {
    case "gemini":
      if (!process.env.GEMINI_API_KEY) {
        throw new MissingCredentialError(
          "GEMINI_API_KEY is not set. Set GEMINI_API_KEY to use the gemini reviewer " +
            "(or select another with LLM_PROVIDER).",
        );
      }
      break;
    case "bedrock":
      if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
        throw new MissingCredentialError(
          "AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY are not set for the bedrock reviewer.",
        );
      }
      break;
    case "openrouter":
      if (!process.env.OPENROUTER_API_KEY) {
        throw new MissingCredentialError(
          "OPENROUTER_API_KEY is not set for the openrouter reviewer.",
        );
      }
      break;
    // "mock" needs nothing.
  }

  if (requireGithub && !process.env.GITHUB_TOKEN) {
    throw new MissingCredentialError(
      "GITHUB_TOKEN is not set. Set GITHUB_TOKEN (repo scope) in .env to grade a PR.",
    );
  }
}
