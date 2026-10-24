import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import type { SandboxRunner, RunSpec } from "./types.js";
import type { SandboxOutcome } from "../types.js";
import { parseReport, failedOutcome } from "../report.js";

/**
 * SubprocessRunner — the demo-critical SandboxRunner fallback (architecture §9).
 *
 * Runs pytest in a throwaway venv applying the 60 s timeout (kill+reap) and
 * best-effort memory/CPU limits. Returns the same SandboxOutcome as the Docker
 * runner, so the orchestrator is runner-agnostic.
 */
export class SubprocessRunner implements SandboxRunner {
  readonly name = "subprocess" as const;

  async run(spec: RunSpec): Promise<SandboxOutcome> {
    const venvDir = await mkdtemp(join(tmpdir(), "grader-venv-"));
    try {
      // 1. Create venv + install pytest and the JSON reporter.
      await this.exec("python3.12", ["-m", "venv", venvDir], { timeoutMs: 60_000 });
      const pip = join(venvDir, "bin", "pip");
      const py = join(venvDir, "bin", "python");
      await this.exec(
        pip,
        ["install", "-q", "pytest", "pytest-json-report", "fastapi", "httpx", "sqlalchemy"],
        { timeoutMs: 120_000 },
      );

      // 2. Run pytest with the JSON report under the enforced wall-clock timeout.
      const { timedOut, stdout, stderr } = await this.exec(
        py,
        [
          "-m",
          "pytest",
          "-q",
          "--json-report",
          `--json-report-file=${spec.reportPath}`,
          spec.cloneDir,
        ],
        {
          timeoutMs: spec.timeoutMs,
          cwd: spec.cloneDir,
          // Best-effort caps via POSIX ulimit when running through a shell.
          memoryMb: spec.memoryMb,
          cpus: spec.cpus,
        },
      );

      if (timedOut) {
        return failedOutcome(
          `Run exceeded the ${Math.round(spec.timeoutMs / 1000)}s sandbox timeout and was terminated.`,
          { timedOut: true },
        );
      }

      if (!existsSync(spec.reportPath)) {
        return failedOutcome(
          `pytest produced no JSON report. stderr: ${stderr.slice(0, 500)}`,
          { timedOut: false },
        );
      }

      return parseReport(spec.reportPath, stdout + "\n" + stderr);
    } finally {
      await rm(venvDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /** Run a command with a hard timeout (kill + reap). */
  private exec(
    cmd: string,
    args: string[],
    opts: { timeoutMs: number; cwd?: string; memoryMb?: number; cpus?: number },
  ): Promise<{ code: number | null; timedOut: boolean; stdout: string; stderr: string }> {
    return new Promise((resolvePromise) => {
      // Best-effort resource caps: wrap in a shell applying ulimit when caps given.
      let child;
      if (opts.memoryMb || opts.cpus) {
        const limits: string[] = [];
        if (opts.memoryMb) limits.push(`ulimit -v ${opts.memoryMb * 1024} 2>/dev/null || true`);
        if (opts.cpus) limits.push(`ulimit -t 60 2>/dev/null || true`);
        const shellCmd = `${limits.join("; ")}; exec "$0" "$@"`;
        child = spawn("/bin/sh", ["-c", shellCmd, cmd, ...args], {
          cwd: opts.cwd,
          env: process.env,
        });
      } else {
        child = spawn(cmd, args, { cwd: opts.cwd, env: process.env });
      }

      let stdout = "";
      let stderr = "";
      let timedOut = false;
      child.stdout?.on("data", (d) => (stdout += d.toString()));
      child.stderr?.on("data", (d) => (stderr += d.toString()));

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL"); // kill + reap
      }, opts.timeoutMs);

      child.on("close", (code) => {
        clearTimeout(timer);
        resolvePromise({ code, timedOut, stdout, stderr });
      });
      child.on("error", (err) => {
        clearTimeout(timer);
        resolvePromise({ code: null, timedOut, stdout, stderr: stderr + String(err) });
      });
    });
  }
}
