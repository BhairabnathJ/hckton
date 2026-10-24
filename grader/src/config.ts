/**
 * Grader configuration — env resolution and paths.
 *
 * Credentials are read ONLY from the environment (architecture §6) and are
 * never logged or returned. A tiny .env loader avoids a runtime dependency.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
// grader/src -> repo root is two levels up.
export const REPO_ROOT = resolve(here, "../..");

/** Minimal .env loader: loads KEY=VALUE lines into process.env if not already set. */
export function loadDotenv(): void {
  for (const file of [resolve(REPO_ROOT, ".env"), resolve(REPO_ROOT, "grader/.env")]) {
    if (!existsSync(file)) continue;
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
}

/** The server-only Brightline hidden repo (tickets.json + hidden tests). */
export const BRIGHTLINE_HIDDEN = resolve(REPO_ROOT, "sim-companies/brightline-hidden");
export const TICKETS_MANIFEST = resolve(BRIGHTLINE_HIDDEN, "tickets.json");

export type RunnerKind = "subprocess" | "docker";

export interface GraderConfig {
  githubToken: string;
  runner: RunnerKind;
  llmProvider: string;
}

/** Error whose message names a missing env var without printing any secret. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/**
 * Resolve required config. `requireGithub` is false for flows that don't touch
 * GitHub (e.g. a local runner contract test).
 */
export function loadConfig(opts?: { requireGithub?: boolean }): GraderConfig {
  loadDotenv();
  const requireGithub = opts?.requireGithub ?? true;

  const githubToken = process.env.GITHUB_TOKEN ?? "";
  if (requireGithub && !githubToken) {
    throw new ConfigError(
      "GITHUB_TOKEN is not set. Set GITHUB_TOKEN (repo scope) in .env to grade a PR.",
    );
  }

  const runnerRaw = (process.env.GRADER_RUNNER ?? "subprocess").trim().toLowerCase();
  if (runnerRaw !== "subprocess" && runnerRaw !== "docker") {
    throw new ConfigError(
      `Unknown GRADER_RUNNER "${runnerRaw}". Expected "subprocess" or "docker".`,
    );
  }

  return {
    githubToken,
    runner: runnerRaw as RunnerKind,
    llmProvider: (process.env.LLM_PROVIDER ?? "gemini").trim().toLowerCase(),
  };
}
