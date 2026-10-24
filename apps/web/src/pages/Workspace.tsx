import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Ticket } from "@sidequest/shared";
import { LevelUpCelebration, type XpSnapshot } from "../components/LevelUpCelebration";
import { Button, ErrorState, LevelTag, LinkButton, Pill, SectionLabel, Skeleton, cx } from "../components/ui";
import { FileTree } from "../components/workspace/FileTree";
import { PersonaChat } from "../components/workspace/PersonaChat";
import { AdvancedPrSubmit, AiReview, GradingTimeline, HiddenTestResults } from "../components/workspace/ReviewPanel";
import { TestConsole } from "../components/workspace/TestConsole";
import { api, describeError, type GradedAttempt } from "../lib/api";
import { useDemoUser } from "../lib/demoUser";
import { attemptStatusView } from "../lib/format";
import { useAsync } from "../lib/useAsync";
import { workspaceApi, type TestRun, type WorkspaceFile } from "../lib/workspace";

const CodeEditor = lazy(() => import("../components/workspace/CodeEditor"));

const POLL_MS = 2500;
const AUTOSAVE_MS = 1500;
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
  // Wait for the demo handle, or the request goes out without X-Demo-User (401).
  const ticket = useAsync(() => (handle ? api.ticket(id) : new Promise<never>(() => undefined)), [id, handle]);

  if (ticket.error !== undefined) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <ErrorState error={ticket.error} onRetry={ticket.reload} title="Couldn't load this ticket" />
      </div>
    );
  }
  if (!ticket.data || !handle) {
    return (
      <div className="flex h-[calc(100vh-57px)] gap-4 p-4">
        <Skeleton className="w-[320px]" />
        <Skeleton className="flex-1" />
      </div>
    );
  }
  return <WorkspaceBody key={`${handle}:${ticket.data.id}`} ticket={ticket.data} handle={handle} />;
}

interface Buffer {
  content: string;
  saved: string;
}

function WorkspaceBody({ ticket, handle }: { ticket: Ticket; handle: string }) {
  const { me, refreshMe } = useDemoUser();
  const key = attemptKey(handle, ticket.id);

  const [attempt, setAttempt] = useState<GradedAttempt | null>(null);
  const [attemptLoading, setAttemptLoading] = useState(true);
  const [startError, setStartError] = useState<unknown>();
  const [starting, setStarting] = useState(false);

  const [files, setFiles] = useState<WorkspaceFile[] | null>(null);
  const [treeError, setTreeError] = useState<unknown>();
  const [buffers, setBuffers] = useState<Record<string, Buffer>>({});
  const buffersRef = useRef(buffers);
  buffersRef.current = buffers;
  const [tabs, setTabs] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState<unknown>();
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const [testRun, setTestRun] = useState<TestRun | null>(null);
  const [running, setRunning] = useState(false);
  const [testError, setTestError] = useState<unknown>();
  const [consoleOpen, setConsoleOpen] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>();
  const [rightTab, setRightTab] = useState<"review" | "pm" | "coach">("review");
  const [ticketOpen, setTicketOpen] = useState(true);
  const [checks, setChecks] = useState<Record<number, boolean>>({});
  const before = useRef<XpSnapshot | null>(null);
  const [celebrate, setCelebrate] = useState<{ from: XpSnapshot; to: XpSnapshot } | null>(null);

  const dirty = new Set(Object.entries(buffers).filter(([, b]) => b.content !== b.saved).map(([p]) => p));
  const grading = attempt?.status === "grading";
  const locked = grading || attempt?.status === "passed";

  // ---- attempt ----------------------------------------------------------
  const onAttempt = useCallback(
    (a: GradedAttempt) => {
      writeAttemptId(key, a.id);
      setAttempt(a);
    },
    [key],
  );

  useEffect(() => {
    const saved = readAttemptId(key);
    if (!saved) {
      setAttemptLoading(false);
      return;
    }
    workspaceApi
      .attempt(saved)
      .then(setAttempt)
      .catch(() => writeAttemptId(key, null))
      .finally(() => setAttemptLoading(false));
  }, [key]);

  // Poll GET /attempts/:id while grading (both submit paths).
  useEffect(() => {
    if (!attempt || attempt.status !== "grading") return;
    const t = setInterval(() => {
      workspaceApi.attempt(attempt.id).then(setAttempt).catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [attempt?.id, attempt?.status]);

  // Level-up animation when a submission from this session passes.
  const prevStatus = useRef(attempt?.status);
  useEffect(() => {
    const was = prevStatus.current;
    prevStatus.current = attempt?.status;
    if (was !== "grading" || attempt?.status !== "passed" || !before.current) return;
    const from = before.current;
    void refreshMe()
      .catch(() => null)
      .then((after) => {
        setCelebrate({ from, to: after ? { xp: after.xp, level: after.level } : from });
      });
  }, [attempt?.status, refreshMe]);

  const startAttempt = async () => {
    setStarting(true);
    setStartError(undefined);
    try {
      onAttempt(await api.startAttempt(ticket.id));
    } catch (err) {
      setStartError(err);
    } finally {
      setStarting(false);
    }
  };

  // ---- files ------------------------------------------------------------
  const openFile = useCallback(
    async (path: string) => {
      if (!attempt) return;
      setTabs((t) => (t.includes(path) ? t : [...t, path]));
      setActive(path);
      if (buffersRef.current[path]) return;
      try {
        const f = await workspaceApi.read(attempt.id, path);
        setBuffers((b) => (b[path] ? b : { ...b, [path]: { content: f.content, saved: f.content } }));
      } catch (err) {
        setSaveError(err);
      }
    },
    [attempt],
  );

  // Create/open the workspace once there is an attempt.
  useEffect(() => {
    if (!attempt?.id) return;
    let cancelled = false;
    setTreeError(undefined);
    workspaceApi
      .open(attempt.id)
      .then(({ files: list }) => {
        if (cancelled) return;
        setFiles(list);
        const py = list.filter((f) => f.type === "file" && f.path.endsWith(".py") && !f.path.startsWith("tests/"));
        const first = py.find((f) => !f.path.endsWith("__init__.py") && f.path.includes("shipment")) ?? py.find((f) => !f.path.endsWith("__init__.py")) ?? py[0];
        if (first) void openFile(first.path);
      })
      .catch((err) => !cancelled && setTreeError(err));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt?.id]);

  const save = useCallback(
    async (path: string) => {
      if (!attempt) return;
      clearTimeout(timers.current.get(path));
      timers.current.delete(path);
      const buf = buffersRef.current[path];
      if (!buf || buf.content === buf.saved) return;
      const content = buf.content;
      setSaving((s) => new Set(s).add(path));
      try {
        await workspaceApi.write(attempt.id, path, content);
        setBuffers((b) => (b[path] ? { ...b, [path]: { ...b[path]!, saved: content } } : b));
        setSaveError(undefined);
      } catch (err) {
        setSaveError(err);
      } finally {
        setSaving((s) => {
          const next = new Set(s);
          next.delete(path);
          return next;
        });
      }
    },
    [attempt],
  );

  const saveAll = useCallback(async () => {
    await Promise.all(Object.keys(buffersRef.current).map((p) => save(p)));
  }, [save]);

  const edit = (path: string, content: string) => {
    setBuffers((b) => ({ ...b, [path]: { content, saved: b[path]?.saved ?? "" } }));
    clearTimeout(timers.current.get(path));
    timers.current.set(
      path,
      setTimeout(() => void save(path), AUTOSAVE_MS),
    );
  };

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => clearTimeout(t));
  }, []);

  // Cmd/Ctrl+S anywhere on the page saves the active file (Monaco handles it too).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (active) void save(active);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, save]);

  const closeTab = (path: string) => {
    void save(path);
    setTabs((t) => {
      const next = t.filter((p) => p !== path);
      if (active === path) setActive(next[next.length - 1] ?? null);
      return next;
    });
  };

  // ---- actions ----------------------------------------------------------
  const runTests = async () => {
    if (!attempt) return;
    setRunning(true);
    setTestError(undefined);
    setConsoleOpen(true);
    try {
      await saveAll();
      setTestRun(await workspaceApi.runTests(attempt.id));
    } catch (err) {
      setTestError(err);
    } finally {
      setRunning(false);
    }
  };

  const submit = async () => {
    if (!attempt) return;
    setSubmitting(true);
    setSubmitError(undefined);
    setRightTab("review");
    if (me) before.current = { xp: me.xp, level: me.level };
    try {
      await saveAll();
      await workspaceApi.submit(attempt.id); // 202 Accepted
      setAttempt((a) => (a ? { ...a, status: "grading" } : a));
    } catch (err) {
      setSubmitError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const onPrSubmitted = (a: GradedAttempt) => {
    if (me) before.current = { xp: me.xp, level: me.level };
    onAttempt(a);
  };

  const activeBuf = active ? buffers[active] : undefined;
  const saveLabel = active
    ? saving.has(active)
      ? "Saving…"
      : dirty.has(active)
        ? "Unsaved"
        : activeBuf
          ? "Saved"
          : ""
    : "";

  // ---- layout -----------------------------------------------------------
  return (
    <div className="flex flex-col lg:h-[calc(100vh-57px)] lg:flex-row">
      {/* Ticket (collapsible) */}
      <aside
        className={cx(
          "shrink-0 border-b border-line bg-surface lg:overflow-y-auto lg:border-r lg:border-b-0",
          ticketOpen ? "lg:w-[320px]" : "lg:w-11",
        )}
      >
        <div className={cx("flex items-center gap-2 px-4 py-3", !ticketOpen && "lg:flex-col lg:px-1.5")}>
          <button
            type="button"
            onClick={() => setTicketOpen((o) => !o)}
            aria-expanded={ticketOpen}
            aria-label={ticketOpen ? "Collapse ticket" : "Expand ticket"}
            className="grid size-8 shrink-0 place-items-center rounded-control text-ink-2 hover:bg-tint"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className={cx("transition-transform duration-150", !ticketOpen && "rotate-180")}>
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          {ticketOpen && (
            <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-ink-3">
              <Link to="/home">Home</Link>
              <span aria-hidden>/</span>
              <span className="truncate font-mono">{ticket.id}</span>
            </nav>
          )}
        </div>
        {ticketOpen && (
          <div className="px-5 pb-6">
            <div className="flex flex-wrap items-center gap-2">
              <LevelTag level={ticket.level} />
              {attempt && <Pill tone={attemptStatusView[attempt.status].tone}>{attemptStatusView[attempt.status].label}</Pill>}
            </div>
            <h1 className="m-0 mt-3 text-[20px] leading-tight font-semibold tracking-tight">{ticket.title}</h1>
            <p className="mt-3 text-[13.5px] whitespace-pre-line text-ink-2">{ticket.description}</p>
            <div className="mt-5">
              <SectionLabel>Acceptance criteria</SectionLabel>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {ticket.acceptanceCriteria.map((c, i) => {
                  const done = attempt?.status === "passed" || !!checks[i];
                  return (
                    <li key={i}>
                      <label className={cx("flex cursor-pointer items-start gap-2.5 rounded-xl border border-line px-3 py-2.5 text-[13px]", done ? "bg-pass-soft" : "bg-surface")}>
                        <input type="checkbox" checked={done} onChange={() => setChecks((s) => ({ ...s, [i]: !s[i] }))} className="mt-0.5 size-4 accent-pass" />
                        <span>{c}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
            <p className="m-0 mt-4 text-[12px] text-ink-3">
              Branch <span className="font-mono">{ticket.branch}</span>. Hidden tests run on the server only.
            </p>
          </div>
        )}
      </aside>

      {/* Editor */}
      <section className="flex min-h-[640px] min-w-0 flex-1 flex-col bg-surface lg:min-h-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
          <span className="min-w-0 truncate font-mono text-[12.5px] text-ink-2">{active ?? "No file open"}</span>
          {saveLabel && (
            <span className={cx("font-mono text-[11.5px]", saveLabel === "Unsaved" ? "text-warn-text" : "text-ink-3")}>· {saveLabel}</span>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" size="sm" onClick={runTests} disabled={!attempt || !files || running || grading}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M7 4v16l13-8z" />
              </svg>
              {running ? "Running…" : "Run tests"}
            </Button>
            <Button size="sm" onClick={submit} disabled={!attempt || !files || submitting || locked}>
              {grading ? "Grading…" : submitting ? "Submitting…" : attempt?.status === "passed" ? "Passed" : "Submit for review"}
            </Button>
          </div>
        </div>
        {(saveError !== undefined || submitError !== undefined) && (
          <div role="alert" className="border-b border-err/30 bg-err-soft px-4 py-2 text-[12.5px] text-err-text">
            {describeError(submitError ?? saveError)}
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          <div className="w-52 shrink-0 border-r border-line bg-tint/60">
            <div className="px-3 pt-2.5 pb-1 text-[11px] font-semibold tracking-[.06em] text-ink-3 uppercase">Explorer</div>
            {files && <FileTree files={files} activePath={active} dirty={dirty} onOpen={openFile} />}
            {!files && attempt && !treeError && (
              <div className="flex flex-col gap-2 p-3">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-4" />
                ))}
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            {tabs.length > 0 && (
              <div role="tablist" aria-label="Open files" className="flex overflow-x-auto border-b border-line bg-tint/60">
                {tabs.map((p) => {
                  const on = p === active;
                  const name = p.split("/").pop();
                  return (
                    <div key={p} className={cx("group flex shrink-0 items-center border-r border-line", on ? "bg-surface" : "hover:bg-surface/70")}>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={on}
                        title={p}
                        onClick={() => setActive(p)}
                        className={cx("flex min-h-9 items-center gap-2 pr-1 pl-3 font-mono text-[12.5px]", on ? "text-ink" : "text-ink-3")}
                      >
                        {name}
                        {dirty.has(p) && <span aria-label="unsaved changes" className="size-2 rounded-full bg-ink-2" />}
                      </button>
                      <button
                        type="button"
                        aria-label={`Close ${name}`}
                        onClick={() => closeTab(p)}
                        className="mr-1 grid size-6 place-items-center rounded text-ink-3 hover:bg-overlay hover:text-ink"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
                          <path d="M18 6 6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="relative min-h-0 flex-1">
              {attemptLoading && <Skeleton className="absolute inset-4" />}
              {!attemptLoading && !attempt && (
                <div className="grid h-full place-items-center p-6">
                  <div className="max-w-sm text-center">
                    <h2 className="m-0 text-[17px] font-semibold">Open your workspace</h2>
                    <p className="m-0 mt-1.5 text-[13.5px] text-ink-2">
                      Starting an attempt clones <span className="font-mono">{ticket.branch}</span> into a private workspace you can edit and test right here.
                    </p>
                    {startError !== undefined && (
                      <div className="mt-3 text-left">
                        <ErrorState error={startError} title="Couldn't start the attempt" />
                      </div>
                    )}
                    <Button className="mt-4" onClick={startAttempt} disabled={starting}>
                      {starting ? "Starting…" : "Start attempt"}
                    </Button>
                  </div>
                </div>
              )}
              {treeError !== undefined && (
                <div className="p-4">
                  <ErrorState error={treeError} title="Couldn't open the workspace" onRetry={() => attempt && workspaceApi.open(attempt.id).then((r) => { setFiles(r.files); setTreeError(undefined); }).catch(setTreeError)} />
                </div>
              )}
              {attempt && active && activeBuf && (
                <Suspense fallback={<div className="p-4 font-mono text-[12.5px] text-ink-3">Loading editor…</div>}>
                  <CodeEditor path={active} value={activeBuf.content} onChange={(v) => edit(active, v)} onSave={() => void save(active)} readOnly={locked} />
                </Suspense>
              )}
              {attempt && active && !activeBuf && <div className="p-4 font-mono text-[12.5px] text-ink-3">Opening {active}…</div>}
              {attempt && files && !active && (
                <div className="grid h-full place-items-center text-[13px] text-ink-3">Pick a file from the explorer.</div>
              )}
            </div>
          </div>
        </div>

        <TestConsole run={testRun} running={running} error={testError} open={consoleOpen} onToggle={() => setConsoleOpen((o) => !o)} />
      </section>

      {/* Review / personas */}
      <aside className="flex shrink-0 flex-col border-t border-line bg-tint lg:w-[380px] lg:border-t-0 lg:border-l">
        <div role="tablist" aria-label="Review and help" className="flex gap-1 border-b border-line bg-surface px-3">
          {(
            [
              ["review", "Review"],
              ["pm", "Ask PM"],
              ["coach", "Ask Coach"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              role="tab"
              type="button"
              aria-selected={rightTab === k}
              onClick={() => setRightTab(k)}
              className={cx("-mb-px min-h-11 border-b-2 px-3 text-sm font-semibold", rightTab === k ? "border-xp text-ink" : "border-transparent text-ink-3 hover:text-ink")}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-4 p-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          {rightTab === "review" &&
            (attempt ? (
              <>
                <GradingTimeline attempt={attempt} />
                {!grading && <HiddenTestResults attempt={attempt} />}
                {!grading && <AiReview attempt={attempt} />}
                {attempt.status === "passed" && (
                  <LinkButton
                    to="/level-up"
                    state={{ ticketId: ticket.id, from: celebrate?.from ?? null, to: celebrate?.to ?? null }}
                    variant="secondary"
                  >
                    See your XP
                  </LinkButton>
                )}
                <AdvancedPrSubmit ticket={ticket} attempt={attempt} onSubmitted={onPrSubmitted} />
              </>
            ) : (
              <p className="m-0 text-[13px] text-ink-3">Start an attempt to see grading, hidden-test results and the AI review here.</p>
            ))}
          {rightTab !== "review" && (
            <PersonaChat
              key={rightTab}
              persona={rightTab}
              attemptId={attempt?.id}
              onAnswered={() => attempt && workspaceApi.attempt(attempt.id).then(setAttempt).catch(() => undefined)}
            />
          )}
        </div>
      </aside>

      {celebrate && (
        <div role="dialog" aria-modal="true" aria-label="Ticket passed" className="fixed inset-0 z-50 grid place-items-center bg-ink/30 px-4">
          <LevelUpCelebration
            from={celebrate.from}
            to={celebrate.to}
            ticketId={ticket.id}
            actions={
              <>
                <LinkButton to="/home" className="flex-1">
                  Next ticket
                </LinkButton>
                <Button variant="secondary" onClick={() => setCelebrate(null)}>
                  Back to code
                </Button>
              </>
            }
          />
        </div>
      )}
    </div>
  );
}
