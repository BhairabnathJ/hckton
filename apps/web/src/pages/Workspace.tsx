import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Attempt, Ticket } from "@sidequest/shared";
import { Button, Card, ErrorState, LevelTag, Pill, SectionLabel, Skeleton, cx } from "../components/ui";
import { ApiError, api, describeError } from "../lib/api";
import { useDemoUser } from "../lib/demoUser";
import { PR_URL, attemptStatusView } from "../lib/format";
import { useAsync } from "../lib/useAsync";

const POLL_MS = 2500;
const attemptKey = (handle: string, ticketId: string) => `sq.attempt.${handle}.${ticketId}`;

function readAttemptId(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeAttemptId(key: string, id: string | null): void {
  try {
    if (id) localStorage.setItem(key, id);
    else localStorage.removeItem(key);
  } catch {
    // storage unavailable
  }
}

export function Workspace() {
  const { id = "" } = useParams();
  const { handle } = useDemoUser();
  const ticket = useAsync(() => api.ticket(id), [id]);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6">
      <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-2 text-[13px] text-ink-3">
        <Link to="/home">Home</Link>
        <span aria-hidden>/</span>
        <span className="font-mono">{id}</span>
      </nav>
      {ticket.error !== undefined && <ErrorState error={ticket.error} onRetry={ticket.reload} title="Couldn't load this ticket" />}
      {ticket.loading && !ticket.data && (
        <div className="flex flex-wrap gap-6">
          <Skeleton className="h-[480px] flex-[1_1_480px]" />
          <Skeleton className="h-[480px] flex-[1_1_420px]" />
        </div>
      )}
      {ticket.data && handle && <WorkspaceBody key={`${handle}:${ticket.data.id}`} ticket={ticket.data} handle={handle} />}
    </div>
  );
}

function WorkspaceBody({ ticket, handle }: { ticket: Ticket; handle: string }) {
  const key = attemptKey(handle, ticket.id);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [loadingAttempt, setLoadingAttempt] = useState(true);
  const [tab, setTab] = useState<"sub" | "pm" | "coach">("sub");
  const [checks, setChecks] = useState<Record<number, boolean>>({});

  // Restore the attempt for this user + ticket, if one was started before.
  useEffect(() => {
    const saved = readAttemptId(key);
    if (!saved) {
      setLoadingAttempt(false);
      return;
    }
    api
      .attempt(saved)
      .then(setAttempt)
      .catch(() => writeAttemptId(key, null))
      .finally(() => setLoadingAttempt(false));
  }, [key]);

  // Poll while grading.
  useEffect(() => {
    if (attempt?.status !== "grading") return;
    const t = setInterval(() => {
      api.attempt(attempt.id).then(setAttempt).catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [attempt?.id, attempt?.status]);

  const onAttempt = (a: Attempt) => {
    writeAttemptId(key, a.id);
    setAttempt(a);
  };

  const commands = [
    `git fetch origin && git checkout ${ticket.branch}`,
    "pip install -r requirements.txt",
    "pytest tests",
  ];

  return (
    <div className="flex flex-wrap items-start gap-6">
      {/* Ticket */}
      <Card className="min-w-0 flex-[1_1_480px] p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-line bg-tint px-2 py-0.5 font-mono text-xs font-semibold">{ticket.id}</span>
          <LevelTag level={ticket.level} />
          {attempt && <Pill tone={attemptStatusView[attempt.status].tone}>{attemptStatusView[attempt.status].label}</Pill>}
        </div>
        <h1 className="m-0 mt-3 text-[24px] leading-tight font-semibold tracking-tight">{ticket.title}</h1>
        <p className="mt-3 whitespace-pre-line text-ink-2">{ticket.description}</p>

        <div className="mt-6">
          <SectionLabel>Acceptance criteria</SectionLabel>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {ticket.acceptanceCriteria.map((c, i) => {
              const done = attempt?.status === "passed" || !!checks[i];
              return (
                <li key={i}>
                  <label
                    className={cx(
                      "flex cursor-pointer items-start gap-3 rounded-xl border border-line px-3.5 py-3",
                      done ? "bg-pass-soft" : "bg-surface",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={done}
                      onChange={() => setChecks((s) => ({ ...s, [i]: !s[i] }))}
                      className="mt-0.5 size-4 accent-pass"
                    />
                    <span>{c}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="mt-6">
          <SectionLabel>Get set up</SectionLabel>
          <div className="flex flex-col gap-2">
            {commands.map((cmd) => (
              <CopyLine key={cmd} text={cmd} />
            ))}
          </div>
          <p className="m-0 mt-2 text-[12.5px] text-ink-3">
            Your branch is <span className="font-mono">{ticket.branch}</span>. Hidden tests run on the server only.
          </p>
        </div>
      </Card>

      {/* Right panel */}
      <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-0 lg:sticky lg:top-20">
        <div role="tablist" aria-label="Workspace" className="flex gap-1 border-b border-line">
          {(
            [
              ["sub", "Submission"],
              ["pm", "Ask PM"],
              ["coach", "Ask Coach"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              role="tab"
              type="button"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cx(
                "-mb-px min-h-11 border-b-2 px-3 text-sm font-semibold",
                tab === k ? "border-xp text-ink" : "border-transparent text-ink-3 hover:text-ink",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="pt-4">
          {tab === "sub" && (
            <SubmissionPanel ticket={ticket} attempt={attempt} loading={loadingAttempt} onAttempt={onAttempt} />
          )}
          {tab !== "sub" && (
            <PersonaChat
              key={tab}
              persona={tab}
              attemptId={attempt?.id}
              onAnswered={() => attempt && api.attempt(attempt.id).then(setAttempt).catch(() => undefined)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function CopyLine({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-control border border-line bg-code px-3 py-2">
      <code className="min-w-0 flex-1 truncate font-mono text-[12.5px]">{text}</code>
      <button
        type="button"
        className={cx("text-xs font-semibold", copied ? "text-pass-text" : "text-xp-text")}
        onClick={() => {
          void navigator.clipboard?.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function SubmissionPanel({
  ticket,
  attempt,
  loading,
  onAttempt,
}: {
  ticket: Ticket;
  attempt: Attempt | null;
  loading: boolean;
  onAttempt: (a: Attempt) => void;
}) {
  const { me, refreshMe } = useDemoUser();
  const navigate = useNavigate();
  const [prUrl, setPrUrl] = useState(attempt?.prUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const before = useRef(me ? { xp: me.xp, level: me.level } : null);

  useEffect(() => {
    if (attempt?.prUrl) setPrUrl(attempt.prUrl);
  }, [attempt?.prUrl]);

  if (loading) return <Skeleton className="h-64" />;

  if (!attempt) {
    return (
      <Card className="p-6">
        <h2 className="m-0 text-[17px] font-semibold">Ready to start?</h2>
        <p className="m-0 mt-1.5 text-[13.5px] text-ink-2">
          Starting an attempt tracks your test runs, review rounds and hints for <span className="font-mono">{ticket.id}</span>.
        </p>
        {error !== undefined && (
          <div className="mt-3">
            <ErrorState error={error} title="Couldn't start the attempt" />
          </div>
        )}
        <Button
          className="mt-4"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(undefined);
            try {
              onAttempt(await api.startAttempt(ticket.id));
            } catch (err) {
              setError(err);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Starting…" : "Start attempt"}
        </Button>
      </Card>
    );
  }

  const invalid = prUrl.length > 0 && !PR_URL.test(prUrl.trim());
  const grading = attempt.status === "grading";
  const passed = attempt.status === "passed";
  const canSubmit = !grading && !passed && attempt.status !== "abandoned";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (invalid || !prUrl.trim()) return;
    setBusy(true);
    setError(undefined);
    if (me) before.current = { xp: me.xp, level: me.level };
    try {
      onAttempt(await api.submitAttempt(attempt.id, prUrl.trim()));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const claim = async () => {
    const after = await refreshMe().catch(() => null);
    navigate("/level-up", {
      state: { ticketId: ticket.id, from: before.current, to: after ? { xp: after.xp, level: after.level } : null },
    });
  };

  const steps: Array<{ label: string; sub: string; state: "done" | "active" | "pending" | "warn" }> = [
    { label: "Submitted", sub: attempt.prUrl ?? "waiting for a PR URL", state: attempt.prUrl ? "done" : "pending" },
    {
      label: "Hidden tests + AI review",
      sub: grading ? "running in the sandbox…" : `${attempt.testRuns} run${attempt.testRuns === 1 ? "" : "s"} so far`,
      state: grading ? "active" : attempt.testRuns > 0 ? "done" : "pending",
    },
    {
      label: passed ? "Passed" : attempt.status === "changes_requested" ? "Changes requested" : "Result",
      sub: passed ? "XP awarded" : attempt.status === "changes_requested" ? "fix, push to the same branch, re-submit" : "passed or changes requested",
      state: passed ? "done" : attempt.status === "changes_requested" ? "warn" : "pending",
    },
  ];
  const dot = { done: "bg-pass", active: "bg-xp animate-pulse", pending: "bg-line-2", warn: "bg-warn" };

  return (
    <div className="flex flex-col gap-4">
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
          {[
            ["Test runs", attempt.testRuns],
            ["Review rounds", attempt.reviewRounds],
            ["Hints used", attempt.hintsUsed],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-tint p-2.5">
              <dt className="text-ink-3">{k}</dt>
              <dd className="m-0 font-mono text-lg font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        {attempt.hintsUsed === 0 && !passed && (
          <p className="m-0 mt-3 text-[12.5px] text-ink-3">No hints yet, so the +25 clean-solve bonus is still on the table.</p>
        )}
      </Card>

      {passed ? (
        <Card className="border-pass p-5">
          <h2 className="m-0 text-[16px] font-semibold text-pass-text">Passed. Nice work.</h2>
          <p className="m-0 mt-1 text-[13.5px] text-ink-2">Hidden tests and review both cleared. Your XP has been awarded.</p>
          <Button className="mt-4 bg-pass hover:bg-pass-text" onClick={claim}>
            See your XP
          </Button>
        </Card>
      ) : (
        <Card className="p-5">
          <form onSubmit={submit} noValidate>
            <label htmlFor="pr-url" className="mb-1.5 block text-[13px] font-semibold">
              Pull request URL
            </label>
            <input
              id="pr-url"
              value={prUrl}
              onChange={(e) => setPrUrl(e.target.value)}
              disabled={!canSubmit}
              aria-invalid={invalid}
              aria-describedby="pr-help"
              placeholder="https://github.com/org/repo/pull/12"
              className={cx(
                "min-h-11 w-full rounded-control border bg-code px-3 font-mono text-[12.5px] text-ink",
                invalid ? "border-err ring-3 ring-err-soft" : "border-line",
              )}
            />
            <p id="pr-help" className={cx("m-0 mt-1.5 text-[12.5px]", invalid ? "text-err-text" : "text-ink-3")}>
              {invalid
                ? "That isn't a pull request URL. It should look like github.com/org/repo/pull/12."
                : attempt.status === "changes_requested"
                  ? "Push your fix to the same branch, then re-submit. The same PR URL is fine."
                  : `Open a PR from ${ticket.branch} into main.`}
            </p>
            {error !== undefined && (
              <div className="mt-3">
                <ErrorState error={error} title={error instanceof ApiError && error.status === 400 ? "Check the PR URL" : "Submit failed"} />
              </div>
            )}
            <Button type="submit" className="mt-4 w-full" disabled={!canSubmit || busy || invalid || !prUrl.trim()}>
              {grading ? "Grading…" : busy ? "Submitting…" : attempt.status === "changes_requested" ? "Re-submit" : "Submit"}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}

interface ChatLine {
  mine: boolean;
  text: string;
  error?: boolean;
}

function PersonaChat({
  persona,
  attemptId,
  onAnswered,
}: {
  persona: "pm" | "coach";
  attemptId?: string;
  onAnswered: () => void;
}) {
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const isCoach = persona === "coach";

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const q = draft.trim();
    if (!q || busy) return;
    setDraft("");
    setLines((l) => [...l, { mine: true, text: q }]);
    setBusy(true);
    try {
      const res = await api.ask(persona, q, attemptId);
      setLines((l) => [...l, { mine: false, text: res.response }]);
      onAnswered();
    } catch (err) {
      setLines((l) => [...l, { mine: false, text: describeError(err), error: true }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex min-h-[460px] flex-col overflow-hidden">
      <div className="border-b border-line px-4 py-3">
        <div className="text-[13.5px] font-semibold">{isCoach ? "Engineering Coach" : "Product Manager"}</div>
        <div className="text-[12px] text-ink-3">
          {isCoach ? "Explains concepts and points you to files. Won't write the fix." : "Answers questions about requirements. Free to ask."}
        </div>
      </div>
      {isCoach && (
        <div className="mx-4 mt-3 rounded-xl border border-warn bg-warn-soft px-3.5 py-2.5 text-[13px]">
          <strong className="font-semibold">Asking Coach counts as a hint.</strong>{" "}
          <span className="text-ink-2">Any hint forfeits the +25 clean-solve bonus on this ticket.</span>
        </div>
      )}
      <div className="flex flex-1 flex-col gap-3 p-4" aria-live="polite">
        {lines.length === 0 && (
          <p className="m-auto max-w-[280px] text-center text-[13px] text-ink-3">
            {isCoach ? "Stuck? Ask Coach where to look." : "Ask about expected behaviour, edge cases or scope."}
          </p>
        )}
        {lines.map((l, i) => (
          <div
            key={i}
            className={cx(
              "max-w-[86%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-[13.5px]",
              l.mine
                ? "self-end rounded-br-sm bg-xp text-white"
                : l.error
                  ? "self-start rounded-bl-sm border border-err/40 bg-err-soft text-err-text"
                  : "self-start rounded-bl-sm border border-line bg-tint",
            )}
          >
            {l.text}
          </div>
        ))}
        {busy && <div className="self-start text-[12.5px] text-ink-3">Writing…</div>}
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-line p-3">
        <label htmlFor={`q-${persona}`} className="sr-only">
          Ask {isCoach ? "Coach" : "the PM"}
        </label>
        <input
          id={`q-${persona}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={isCoach ? "Ask Coach for a hint…" : "Ask about requirements…"}
          className="min-h-11 min-w-0 flex-1 rounded-control border border-line bg-tint px-3 text-[13px]"
        />
        <Button type="submit" variant={isCoach ? "warn" : "primary"} disabled={busy || !draft.trim()}>
          {isCoach ? "Use hint" : "Send"}
        </Button>
      </form>
    </Card>
  );
}
