import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Job } from "@sidequest/shared";
import { JobCard } from "../components/JobCard";
import { Button, Card, EmptyState, ErrorState, LinkButton, MockTag, Skeleton, Toast, cx } from "../components/ui";
import { ApiError, api, describeError } from "../lib/api";
import { useDemoUser } from "../lib/demoUser";
import { useJobEvents } from "../lib/events";
import { LEVEL_GATE, dollars, isCompany, visibleJobs } from "../lib/format";
import { useAsync } from "../lib/useAsync";

type Filter = "all" | "open" | "mine";

export function JobBoard() {
  const { me, handle } = useDemoUser();
  const navigate = useNavigate();
  const jobs = useAsync(() => api.jobs(), [handle]);
  const [filter, setFilter] = useState<Filter>("all");
  const [fresh, setFresh] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: "cash" | "err" | "warn" | "claim" } | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);

  const upsert = (job: Job) =>
    jobs.setData((list = []) => (list.some((j) => j.id === job.id) ? list.map((j) => (j.id === job.id ? job : j)) : [job, ...list]));

  useJobEvents((ev) => {
    upsert(ev.job);
    if (ev.type === "job.dropped") {
      setFresh(ev.job.id);
      setToast({ text: `New job dropped: ${ev.job.title} · ${dollars(ev.job.payCents)}`, tone: "cash" });
    } else if (ev.type === "job.claimed" && ev.claimedByUserId !== me?.id) {
      setToast({ text: `"${ev.job.title}" was just claimed.`, tone: "claim" });
    }
  });

  if (!me) return null;
  const company = isCompany(me);
  const gated = !company && me.level < LEVEL_GATE;

  const claim = async (job: Job) => {
    setClaiming(job.id);
    try {
      const claimed = await api.claimJob(job.id);
      upsert(claimed);
      navigate(`/jobs/${encodeURIComponent(claimed.id)}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "job_already_claimed") void jobs.reload();
      setToast({ text: describeError(err), tone: err instanceof ApiError && err.code === "level_gate" ? "warn" : "err" });
    } finally {
      setClaiming(null);
    }
  };

  const drop = async () => {
    setDropping(true);
    try {
      const job = await api.dropDemoJob();
      upsert(job);
      setFresh(job.id);
    } catch (err) {
      setToast({ text: describeError(err), tone: "err" });
    } finally {
      setDropping(false);
    }
  };

  const list = visibleJobs(jobs.data ?? [], me).filter((j) =>
    filter === "open" ? j.status === "open" : filter === "mine" ? j.claimedByUserId === me.id : true,
  );
  const sorted = [...list].sort((a, b) => Number(b.id === fresh) - Number(a.id === fresh) || Number(b.status === "open") - Number(a.status === "open"));

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-[999_1_420px]">
          <h1 className="m-0 text-[28px] font-semibold tracking-tight">Paid jobs</h1>
          <p className="m-0 mt-1 max-w-2xl text-ink-2">
            Real tasks from real companies. The first qualified student to claim a job gets it. Every job is funded into escrow
            before it drops.
          </p>
        </div>
        <div role="group" aria-label="Filters" className="flex flex-wrap gap-2">
          {(
            [
              ["all", "All"],
              ["open", "Open"],
              ["mine", "Mine"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={filter === k}
              onClick={() => setFilter(k)}
              className={cx(
                "min-h-9 rounded-full border px-3.5 text-[13px]",
                filter === k ? "border-xp bg-xp-soft font-semibold text-xp-text" : "border-line bg-surface text-ink-2 hover:bg-tint",
              )}
            >
              {label}
            </button>
          ))}
          {company && (
          <button
            type="button"
            onClick={drop}
            disabled={dropping}
            className="min-h-9 rounded-control border border-dashed border-warn px-3 font-mono text-xs font-medium text-warn-text hover:bg-warn-soft"
          >
            {dropping ? "Dropping…" : "DEMO · drop a job"}
          </button>
          )}
        </div>
      </div>

      {gated && (
        <Card className="mt-5 flex flex-wrap items-center gap-4 border-xp-line bg-xp-soft p-5">
          <span className="grid size-11 place-items-center rounded-xl bg-surface text-xp-text">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          </span>
          <div className="min-w-0 flex-[999_1_300px]">
            <div className="font-semibold">Reach Level {LEVEL_GATE} to claim paid work</div>
            <div className="text-[13px] text-ink-2">
              You're Level {me.level}. You can browse, but claiming returns <span className="font-mono">403 level_gate</span> until
              Level {LEVEL_GATE}.
            </div>
          </div>
          <LinkButton to="/home" variant="secondary">
            Keep levelling up
          </LinkButton>
        </Card>
      )}

      <div className="mt-6 flex flex-col gap-4">
        {jobs.loading && !jobs.data && Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-36 rounded-card" />)}
        {jobs.error !== undefined && <ErrorState error={jobs.error} onRetry={jobs.reload} title="Couldn't load jobs" />}
        {jobs.data && sorted.length === 0 && (
          <Card>
            <EmptyState
              title={filter === "mine" ? "You haven't claimed a job yet" : "No jobs right now"}
              body="New jobs drop throughout the day. This page updates live when one lands."
            />
          </Card>
        )}
        {sorted.map((j) => {
          const mine = j.claimedByUserId === me.id;
          return (
            <JobCard key={j.id} job={j} fresh={j.id === fresh}>
              {j.status === "open" && !company && (
                <Button
                  variant="money"
                  size="lg"
                  disabled={gated || claiming !== null}
                  onClick={() => claim(j)}
                  className="min-w-[180px]"
                >
                  {claiming === j.id ? "Claiming…" : gated ? `Unlocks at L${LEVEL_GATE}` : `Claim for ${dollars(j.payCents)}`}
                </Button>
              )}
              {mine && j.status !== "open" && (
                <LinkButton to={`/jobs/${encodeURIComponent(j.id)}`} variant="secondary">
                  Open workspace
                </LinkButton>
              )}
            </JobCard>
          );
        })}
      </div>
      <p className="mt-6 text-[12.5px] text-ink-3">
        Live via <span className="font-mono">GET /events</span>. Escrow and payouts are <MockTag />.
      </p>

      {toast && (
        <Toast tone={toast.tone} onClose={() => setToast(null)}>
          {toast.text}
        </Toast>
      )}
    </div>
  );
}
