import type { SandboxOutcome } from "../types.js";

/** What the sandbox needs to run one grade. */
export interface RunSpec {
  /** Dir containing student code + injected hidden tests. */
  cloneDir: string;
  /** Absolute path where the JSON report should be read from after the run. */
  reportPath: string;
  /** Wall-clock timeout in ms (60_000). */
  timeoutMs: number;
  /** Memory cap in MB (512). */
  memoryMb: number;
  /** CPU count (1). */
  cpus: number;
}

/**
 * The sandbox seam (architecture §7). Implementations: SubprocessRunner
 * (default in the demo-critical scope) and DockerRunner (cuttable).
 *
 * `run` resolves with a SandboxOutcome for test pass/fail (it does NOT throw on
 * test failure); it throws only on infrastructure errors (e.g. the runtime
 * could not start at all).
 */
export interface SandboxRunner {
  readonly name: "subprocess" | "docker";
  run(spec: RunSpec): Promise<SandboxOutcome>;
}
