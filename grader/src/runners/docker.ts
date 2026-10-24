import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { SandboxRunner, RunSpec } from "./types.js";
import type { SandboxOutcome } from "../types.js";
import { parseReport, failedOutcome } from "../report.js";

/**
 * DockerRunner — runs pytest in a disposable python:3.12-slim container under
 * the architecture §6 limits: --network none, 512MB, 1 CPU, read-only root with
 * a writable /tmp, non-root where possible, 60s kill+reap. Container removal is
 * guaranteed via --rm plus an explicit `docker rm -f` on timeout/error.
 */
export class DockerRunner implements SandboxRunner {
  readonly name = "docker" as const;

  async run(spec: RunSpec): Promise<SandboxOutcome> {
    const containerName = `grader-${randomUUID().slice(0, 8)}`;
    // Report is written to the bind-mounted clone dir (visible to the host)
    // under /work, which we mount read-write only for the report file dir.
    // Root fs is read-only; /tmp is a tmpfs; /work holds code + report.
    const args = [
      "run",
      "--rm",
      "--name",
      containerName,
      "--network",
      "none",
      "--memory",
      `${spec.memoryMb}m`,
      "--cpus",
      String(spec.cpus),
      "--read-only",
      "--tmpfs",
      "/tmp",
      "-v",
      `${spec.cloneDir}:/work`,
      "-w",
      "/work",
      "python:3.12-slim",
      "sh",
      "-c",
      "pip install -q --no-cache-dir pytest pytest-json-report fastapi httpx sqlalchemy >/tmp/pip.log 2>&1; " +
        "pytest -q --json-report --json-report-file=/work/.grader-report.json /work",
    ];

    const { timedOut, stdout, stderr } = await this.exec("docker", args, spec.timeoutMs, containerName);

    if (timedOut) {
      return failedOutcome(
        `Run exceeded the ${Math.round(spec.timeoutMs / 1000)}s sandbox timeout and the container was terminated.`,
        { timedOut: true },
      );
    }
    if (!existsSync(spec.reportPath)) {
      return failedOutcome(
        `pytest produced no JSON report inside the container. stderr: ${stderr.slice(0, 500)}`,
        { timedOut: false },
      );
    }
    return parseReport(spec.reportPath, stdout + "\n" + stderr);
  }

  private exec(
    cmd: string,
    args: string[],
    timeoutMs: number,
    containerName: string,
  ): Promise<{ timedOut: boolean; stdout: string; stderr: string }> {
    return new Promise((resolvePromise) => {
      const child = spawn(cmd, args, { env: process.env });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      child.stdout?.on("data", (d) => (stdout += d.toString()));
      child.stderr?.on("data", (d) => (stderr += d.toString()));

      const timer = setTimeout(() => {
        timedOut = true;
        // Kill + reap the container explicitly (idempotent).
        spawn("docker", ["rm", "-f", containerName], { stdio: "ignore" });
        child.kill("SIGKILL");
      }, timeoutMs);

      child.on("close", () => {
        clearTimeout(timer);
        resolvePromise({ timedOut, stdout, stderr });
      });
      child.on("error", (err) => {
        clearTimeout(timer);
        resolvePromise({ timedOut, stdout, stderr: stderr + String(err) });
      });
    });
  }
}
