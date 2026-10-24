import type { TestRun } from "../../lib/workspace";
import { describeError } from "../../lib/api";
import { cx } from "../ui";

export function PassFailBar({ passed, failed }: { passed: number; failed: number }) {
  const total = passed + failed;
  return (
    <div
      className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-overlay"
      role="img"
      aria-label={`${passed} passed, ${failed} failed`}
    >
      {total > 0 && <span className="bg-pass" style={{ flex: passed }} />}
      {failed > 0 && <span className="bg-err" style={{ flex: failed }} />}
    </div>
  );
}

export function TestConsole({
  run,
  running,
  error,
  open,
  onToggle,
}: {
  run: TestRun | null;
  running: boolean;
  error: unknown;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <section aria-label="Test output" className="flex min-h-0 flex-col border-t border-line bg-surface">
      <div className="flex items-center gap-3 px-3 py-1.5">
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-h-8 items-center gap-1.5 text-[12px] font-semibold tracking-[.06em] text-ink-2 uppercase">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden className={cx("transition-transform duration-150", open ? "rotate-90" : "")}>
            <path d="m9 18 6-6-6-6" />
          </svg>
          Test output
        </button>
        {running && <span className="font-mono text-[12px] text-xp-text">running pytest tests…</span>}
        {!running && run && (
          <span className="flex items-center gap-2 font-mono text-[12px]">
            <span className="font-semibold text-pass-text">{run.passed} passed</span>
            <span className={cx("font-semibold", run.failed ? "text-err-text" : "text-ink-3")}>{run.failed} failed</span>
            <span className="w-24">
              <PassFailBar passed={run.passed} failed={run.failed} />
            </span>
          </span>
        )}
        <span className="ml-auto font-mono text-[11px] text-ink-3">visible tests only</span>
      </div>
      {open && (
        <pre
          aria-live="polite"
          className="m-0 h-[180px] overflow-auto border-t border-line bg-code px-4 py-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-ink"
        >
          {error !== undefined && error !== null
            ? describeError(error)
            : running
              ? "$ pytest tests\n…"
              : run
                ? run.output
                : "Run tests to see pytest output here."}
        </pre>
      )}
    </section>
  );
}
