import { spawnSync } from "node:child_process";
import type { SandboxRunner } from "./types.js";
import { SubprocessRunner } from "./subprocess.js";
import { DockerRunner } from "./docker.js";
import type { RunnerKind } from "../config.js";

export type { SandboxRunner, RunSpec } from "./types.js";

/** Is a Docker daemon reachable? */
function dockerAvailable(): boolean {
  try {
    const r = spawnSync("docker", ["info"], { stdio: "ignore", timeout: 10_000 });
    return r.status === 0;
  } catch {
    return false;
  }
}

/**
 * Select the SandboxRunner by GRADER_RUNNER. `subprocess` is the default in the
 * demo-critical scope. `docker` is used when selected and reachable; if Docker
 * is unreachable it falls back to subprocess (architecture §9) so no calling
 * code changes.
 */
export function createSandboxRunner(kind: RunnerKind): SandboxRunner {
  if (kind === "docker") {
    if (dockerAvailable()) return new DockerRunner();
    console.warn("GRADER_RUNNER=docker but no Docker daemon reachable; falling back to subprocess.");
    return new SubprocessRunner();
  }
  return new SubprocessRunner();
}
