/**
 * Parse the pytest JSON report (pytest-json-report) into a SandboxOutcome.
 *
 * Failure messages are bounded and sanitized so no hidden-test source is
 * surfaced (architecture §6 / Requirements 3.6, 11.5).
 */
import { readFileSync } from "node:fs";
import type { SandboxOutcome, Failure } from "./types.js";

const MAX_LOG = 4000;
const MAX_MSG = 600;

/** A failed outcome with a bounded log excerpt and zero tests. */
export function failedOutcome(
  reason: string,
  opts: { timedOut: boolean },
): SandboxOutcome {
  return {
    passed: false,
    testsPassed: 0,
    testsFailed: 0,
    failures: [],
    logExcerpt: clip(reason, MAX_LOG),
    timedOut: opts.timedOut,
  };
}

function clip(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + `… [truncated ${s.length - n} chars]`;
}

/**
 * Strip anything that looks like hidden-test source from a message. The hidden
 * tests live under brightline-hidden/tests/<id>/; never echo their paths or
 * raw source lines back to a student-facing field.
 */
function sanitize(msg: string): string {
  return clip(
    msg.replace(/brightline-hidden[^\s]*/g, "[hidden-test]"),
    MAX_MSG,
  );
}

interface PytestJsonTest {
  nodeid?: string;
  outcome?: string;
  call?: { longrepr?: string; crash?: { message?: string } };
}
interface PytestJsonReport {
  summary?: { passed?: number; failed?: number; total?: number; error?: number };
  tests?: PytestJsonTest[];
}

export function parseReport(reportPath: string, rawLog = ""): SandboxOutcome {
  let report: PytestJsonReport;
  try {
    report = JSON.parse(readFileSync(reportPath, "utf8")) as PytestJsonReport;
  } catch (err) {
    return failedOutcome(
      `Could not read/parse pytest JSON report: ${(err as Error).message}. Log: ${rawLog.slice(0, 1000)}`,
      { timedOut: false },
    );
  }

  const summary = report.summary ?? {};
  const testsPassed = summary.passed ?? 0;
  const testsFailed = (summary.failed ?? 0) + (summary.error ?? 0);
  const testsTotal = summary.total ?? testsPassed + testsFailed;

  // Zero tests executed => failed, not a vacuous pass (Req 4.6).
  if (testsTotal === 0) {
    return failedOutcome(
      `No tests were executed. Log: ${rawLog.slice(0, 1000)}`,
      { timedOut: false },
    );
  }

  const failures: Failure[] = (report.tests ?? [])
    .filter((t) => t.outcome === "failed" || t.outcome === "error")
    .map((t) => ({
      test: t.nodeid ?? "(unknown test)",
      message: sanitize(t.call?.crash?.message ?? t.call?.longrepr ?? "(no message)"),
    }));

  const passed = testsFailed === 0 && testsPassed === testsTotal && testsTotal > 0;

  return {
    passed,
    testsPassed,
    testsFailed,
    failures,
    logExcerpt: clip(rawLog, MAX_LOG),
    timedOut: false,
  };
}
