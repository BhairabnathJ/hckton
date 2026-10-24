import { useEffect, useState, type FormEvent } from "react";
import type { Ticket } from "@sidequest/shared";
import { ApiError, api, type GradedAttempt } from "../../lib/api";
import { PR_URL, attemptStatusView } from "../../lib/format";
import { Markdown } from "../../lib/markdown";
import { Button, Card, ErrorState, Pill, SectionLabel, cx } from "../ui";
import { PassFailBar } from "./TestConsole";

type StepState = "done" | "active" | "pending" | "warn";
const dot: Record<StepState, string> = { done: "bg-pass", active: "bg-xp animate-pulse", pending: "bg-line-2", warn: "bg-warn" };

export function GradingTimeline({ attempt }: { attempt: GradedAttempt }) {
  const grading = attempt.status === "grading";
  const passed = attempt.status === "passed";
  const changes = attempt.status === "changes_requested";
  const submitted = grading || passed || changes || attempt.testRuns > 0;
  const steps: Array<{ label: string; sub: string; state: StepState }> = [
    { label: "Submitted", sub: attempt.prUrl ?? (submitted ? "from your workspace" : "not yet"), state: submitted ? "done" : "pending" },
    {
      label: "Hidden tests + AI review",
      sub: grading ? "running in the sandbox…" : `${attempt.testRuns} run${attempt.testRuns === 1 ? "" : "s"} so far`,
      state: grading ? "active" : submitted ? "done" : "pending",
    },
    {
      label: passed ? "Passed" : changes ? "Changes requested" : "Result",
      sub: passed ? "XP awarded" : changes ? "fix the code and submit again" : "passed or changes requested",
      state: passed ? "done" : changes ? "warn" : "pending",
    },
  ];
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <h2 className="m-0 text-[15px] font-semibold">Grading</h2>
        <span className="ml-auto">
          <Pill tone={attemptStatusView[attempt.status].tone}>{attemptStatusView[attempt.status].label}</Pill>
        </span>
      </div>
      <ol className="m-0 mt-4 flex list-none flex-col gap-3 p-0">
        {steps.map((s) => (
          <li key={s.label} className="flex gap-3">
            <span className={cx("mt-1.5 size-2.5 shrink-0 rounded-full", dot[s.state])} aria-hidden />
            <span className="min-w-0">
              <span className={cx("block text-sm font-medium", s.state === "pending" && "text-ink-3")}>{s.label}</span>
              <span className="block truncate font-mono text-[12px] text-ink-3">{s.sub}</span>
            </span>
          </li>
        ))}
      </ol>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-[12px]">
        {(
          [
            ["Test runs", attempt.testRuns],
            ["Review rounds", attempt.reviewRounds],
            ["Hints used", attempt.hintsUsed],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="rounded-xl bg-tint p-2.5">
            <dt className="text-ink-3">{k}</dt>
            <dd className="m-0 font-mono text-lg font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export function HiddenTestResults({ attempt }: { attempt: GradedAttempt }) {
  if (attempt.testsPassed == null && attempt.testsFailed == null) return null;
  const passed = attempt.testsPassed ?? 0;
  const failed = attempt.testsFailed ?? 0;
  const failures = attempt.failures ?? [];
  return (
    <Card className="p-5">
      <div className="flex items-baseline gap-2">
        <h2 className="m-0 text-[15px] font-semibold">Hidden tests</h2>
        <span className="ml-auto font-mono text-[13px]">
          <span className="font-semibold text-pass-text">{passed}</span>
          <span className="text-ink-3"> / {passed + failed} passed</span>
        </span>
      </div>
      <div className="mt-3">
        <PassFailBar passed={passed} failed={failed} />
      </div>
      {failures.length > 0 && (
        <ul className="m-0 mt-4 flex list-none flex-col gap-2 p-0">
          {failures.map((f) => (
            <li key={f.name} className="rounded-control border border-err/30 bg-err-soft px-3 py-2.5">
              <div className="font-mono text-[12.5px] font-semibold text-err-text">{f.name}</div>
              <pre className="m-0 mt-1 font-mono text-[12px] whitespace-pre-wrap text-ink-2">{f.message}</pre>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function AiReview({ attempt }: { attempt: GradedAttempt }) {
  if (!attempt.reviewBody && !attempt.verdict) return null;
  const approve = attempt.verdict === "APPROVE";
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <h2 className="m-0 text-[15px] font-semibold">AI review</h2>
        {attempt.verdict && (
          <span className="ml-auto">
            <Pill tone={approve ? "pass" : "warn"}>{approve ? "Approved" : "Changes requested"}</Pill>
          </span>
        )}
      </div>
      {attempt.reviewBody && (
        <div className="mt-3">
          <Markdown source={attempt.reviewBody} />
        </div>
      )}
      {(attempt.prUrl || attempt.reviewCommentUrl) && (
        <div className="mt-4 flex flex-wrap gap-3 text-[13px] font-semibold">
          {attempt.prUrl && (
            <a href={attempt.prUrl} target="_blank" rel="noreferrer">
              View PR on GitHub ↗
            </a>
          )}
          {attempt.reviewCommentUrl && (
            <a href={attempt.reviewCommentUrl} target="_blank" rel="noreferrer">
              View review comment ↗
            </a>
          )}
        </div>
      )}
    </Card>
  );
}

/** The original PR-URL submit path, kept as a collapsed fallback. */
export function AdvancedPrSubmit({
  ticket,
  attempt,
  onSubmitted,
}: {
  ticket: Ticket;
  attempt: GradedAttempt;
  onSubmitted: (a: GradedAttempt) => void;
}) {
  const [prUrl, setPrUrl] = useState(attempt.prUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  useEffect(() => {
    if (attempt.prUrl) setPrUrl(attempt.prUrl);
  }, [attempt.prUrl]);

  const invalid = prUrl.length > 0 && !PR_URL.test(prUrl.trim());
  const locked = attempt.status === "grading" || attempt.status === "passed" || attempt.status === "abandoned";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (invalid || !prUrl.trim()) return;
    setBusy(true);
    setError(undefined);
    try {
      onSubmitted(await api.submitAttempt(attempt.id, prUrl.trim()));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="group rounded-card border border-line bg-surface">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-[13px] font-semibold text-ink-2 hover:text-ink">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden className="transition-transform duration-150 group-open:rotate-90">
          <path d="m9 18 6-6-6-6" />
        </svg>
        Advanced: submit a GitHub PR instead
      </summary>
      <form onSubmit={submit} noValidate className="border-t border-line p-4">
        <label htmlFor="pr-url" className="mb-1.5 block text-[13px] font-semibold">
          Pull request URL
        </label>
        <input
          id="pr-url"
          value={prUrl}
          onChange={(e) => setPrUrl(e.target.value)}
          disabled={locked}
          aria-invalid={invalid}
          aria-describedby="pr-help"
          placeholder="https://github.com/org/repo/pull/12"
          className={cx(
            "min-h-11 w-full rounded-control border bg-code px-3 font-mono text-[12.5px] text-ink",
            invalid ? "border-err ring-3 ring-err-soft" : "border-line",
          )}
        />
        <p id="pr-help" className={cx("m-0 mt-1.5 text-[12.5px]", invalid ? "text-err-text" : "text-ink-3")}>
          {invalid ? "That isn't a pull request URL. It should look like github.com/org/repo/pull/12." : `Open a PR from ${ticket.branch} into main.`}
        </p>
        {error !== undefined && (
          <div className="mt-3">
            <ErrorState error={error} title={error instanceof ApiError && error.status === 400 ? "Check the PR URL" : "Submit failed"} />
          </div>
        )}
        <Button type="submit" variant="secondary" className="mt-3 w-full" disabled={locked || busy || invalid || !prUrl.trim()}>
          {busy ? "Submitting…" : "Submit PR"}
        </Button>
      </form>
    </details>
  );
}

export { SectionLabel };
