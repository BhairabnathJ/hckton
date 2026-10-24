/**
 * workspace service (browser-workspace spec).
 *
 * Owns the per-attempt in-browser workspace: a git clone of the ticket's branch
 * from the LOCAL brightline repo into os.tmpdir()/sidequest-workspaces/<attemptId>.
 * All operations are owner-scoped by the caller (routes resolve the user from
 * X-Demo-User). Hidden tests are NEVER copied here — only into the grader's temp
 * copy at grading time (architecture §6 / R3).
 */
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve, sep, relative } from "node:path";
import { readFile, writeFile, readdir, stat, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { User as UserRow } from "@prisma/client";
import { prisma } from "../../db.js";
import { AppError } from "../../http/error.js";
import { REPO_ROOT } from "../../env.js";

/** A node in the workspace file tree (mirrors the shared `workspaceNode`). */
type WorkspaceNode = { path: string; type: "file" | "dir" };

const WORKSPACES_ROOT = join(tmpdir(), "sidequest-workspaces");
const LOCAL_BRIGHTLINE = resolve(REPO_ROOT, "sim-companies/brightline");
const EXCLUDE = new Set([".git", ".venv", "__pycache__"]);
const MAX_FILE_BYTES = 200 * 1024; // 200 KB
const MAX_OUTPUT = 20 * 1024; // 20 KB

/** The on-disk workspace root for an attempt. */
export function workspaceDir(attemptId: string): string {
  return join(WORKSPACES_ROOT, attemptId);
}

/**
 * Resolve the attempt and assert the caller owns it. 404 if unknown, 403
 * `forbidden` if the caller is not the owner.
 */
export async function requireOwnedAttempt(
  attemptId: string,
  user: UserRow,
): Promise<{ id: string; ticketId: string; branch: string }> {
  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: { ticket: true },
  });
  if (!attempt) throw AppError.notFound(`Attempt "${attemptId}" not found.`);
  if (attempt.userId !== user.id) {
    throw AppError.forbidden("You do not own this attempt.");
  }
  return { id: attempt.id, ticketId: attempt.ticketId, branch: attempt.ticket.branch };
}

/** Run git with args, resolving stdout; throws a bounded error on failure. */
function git(args: string[], cwd?: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("git", args, { cwd, env: process.env });
    let out = "";
    let err = "";
    child.stdout?.on("data", (d) => (out += d.toString()));
    child.stderr?.on("data", (d) => (err += d.toString()));
    child.on("close", (code) =>
      code === 0 ? resolvePromise(out) : reject(new Error(`git ${args[0]} failed: ${err.slice(0, 300)}`)),
    );
    child.on("error", reject);
  });
}

/**
 * Create the workspace if missing: git clone the ticket branch from the local
 * brightline repo. Idempotent — a no-op if the workspace already exists.
 */
export async function ensureWorkspace(
  attemptId: string,
  branch: string,
): Promise<void> {
  const dir = workspaceDir(attemptId);
  if (existsSync(join(dir, ".git"))) return; // already cloned
  await mkdir(WORKSPACES_ROOT, { recursive: true });
  if (!existsSync(LOCAL_BRIGHTLINE)) {
    throw AppError.internal("Local brightline repo not found on disk.");
  }
  await git(["clone", "--branch", branch, LOCAL_BRIGHTLINE, dir]);
}

/** Build the workspace file tree, excluding .git/.venv/__pycache__. */
export async function buildTree(attemptId: string): Promise<WorkspaceNode[]> {
  const root = workspaceDir(attemptId);
  if (!existsSync(root)) throw AppError.notFound("Workspace not found; create it first.");
  const nodes: WorkspaceNode[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    // Dirs before files, each alphabetical.
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const e of entries) {
      if (EXCLUDE.has(e.name)) continue;
      const abs = join(dir, e.name);
      const rel = relative(root, abs).split(sep).join("/");
      if (e.isDirectory()) {
        nodes.push({ path: rel, type: "dir" });
        await walk(abs);
      } else {
        nodes.push({ path: rel, type: "file" });
      }
    }
  }
  await walk(root);
  return nodes;
}

/**
 * Resolve a client-supplied relative path safely within the workspace. Rejects
 * absolute paths and any `..` segment, and asserts the resolved path stays under
 * the workspace root (R2).
 */
function safeResolve(attemptId: string, p: string): string {
  if (typeof p !== "string" || p.length === 0) {
    throw AppError.validation("A file path is required.");
  }
  // Reject absolute paths and parent-dir traversal outright.
  if (p.startsWith("/") || p.startsWith("\\")) {
    throw AppError.validation("Absolute paths are not allowed.");
  }
  if (p.split(/[\\/]/).some((seg) => seg === "..")) {
    throw AppError.validation('Path may not contain ".." segments.');
  }
  const root = workspaceDir(attemptId);
  const abs = resolve(root, p);
  if (abs !== root && !abs.startsWith(root + sep)) {
    throw AppError.validation("Path escapes the workspace.");
  }
  return abs;
}

/** Read a workspace file (200 KB cap, text only). */
export async function readWorkspaceFile(
  attemptId: string,
  p: string,
): Promise<{ path: string; content: string }> {
  const abs = safeResolve(attemptId, p);
  if (!existsSync(abs)) throw AppError.notFound(`File "${p}" not found.`);
  const info = await stat(abs);
  if (!info.isFile()) throw AppError.validation(`"${p}" is not a file.`);
  if (info.size > MAX_FILE_BYTES) {
    throw AppError.validation(`File exceeds the ${MAX_FILE_BYTES / 1024}KB limit.`);
  }
  const buf = await readFile(abs);
  if (buf.includes(0)) throw AppError.validation("File is not a text file.");
  return { path: p, content: buf.toString("utf8") };
}

/** Write a workspace file (200 KB cap, text only). */
export async function writeWorkspaceFile(
  attemptId: string,
  p: string,
  content: string,
): Promise<void> {
  const abs = safeResolve(attemptId, p);
  if (typeof content !== "string") throw AppError.validation("content must be a string.");
  if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) {
    throw AppError.validation(`Content exceeds the ${MAX_FILE_BYTES / 1024}KB limit.`);
  }
  if (content.includes("\u0000")) throw AppError.validation("Only text files may be written.");
  const dir = resolve(abs, "..");
  await mkdir(dir, { recursive: true });
  await writeFile(abs, content, "utf8");
}

/**
 * Run ONLY the visible tests in the workspace via the grader's SandboxRunner.
 * Hidden tests are not present, so this reflects what the student can see.
 */
export async function runTests(
  attemptId: string,
): Promise<{ passed: number; failed: number; output: string }> {
  const root = workspaceDir(attemptId);
  if (!existsSync(root)) throw AppError.notFound("Workspace not found; create it first.");

  // Reuse the grader's runner seam + config (subprocess default).
  const { createSandboxRunner } = await import("../../../../../grader/src/runners/index.js");
  const { loadConfig } = await import("../../../../../grader/src/config.js");
  const cfg = loadConfig({ requireGithub: false });
  const runner = createSandboxRunner(cfg.runner);
  const outcome = await runner.run({
    cloneDir: root,
    reportPath: join(root, ".sq-report.json"),
    timeoutMs: 60_000,
    memoryMb: 512,
    cpus: 1,
  });

  const failuresText = outcome.failures
    .map((f) => `- ${f.test}: ${f.message}`)
    .join("\n");
  const output = `${outcome.logExcerpt}\n${failuresText}`.slice(0, MAX_OUTPUT);
  return { passed: outcome.testsPassed, failed: outcome.testsFailed, output };
}
