import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { EscrowBadge } from "../components/JobCard";
import { Button, Card, EmptyState, ErrorState, LinkButton, Pill, SectionLabel, Skeleton, cx } from "../components/ui";
import { api } from "../lib/api";
import { useDemoUser } from "../lib/demoUser";
import { useJobEvents } from "../lib/events";
import { PR_URL, countdown, dollars, jobStatusView } from "../lib/format";
import { useAsync } from "../lib/useAsync";

const ORDER = ["claimed", "submitted", "accepted", "paid"] as const;

export function ActiveJob() {
  const { id = "" } = useParams();
  const { me, handle } = useDemoUser();
  // The contract has no GET /jobs/{id}; read the list and pick this job.
  const jobs = useAsync(() => api.jobs(), [handle]);
  const job = jobs.data?.find((j) => j.id === id);
  const [now, setNow] = useState(() => Date.now());
  const [prUrl, setPrUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useJobEvents((ev) => {
    if (ev.job.id === id) jobs.setData((list = []) => list.map((j) => (j.id === id ? ev.job : j)));
  });

  if (jobs.loading && !jobs.data) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6">
        <Skeleton className="h-28 rounded-card" />
        <Skeleton className="mt-6 h-[420px] rounded-card" />
      </div>
    );
  }
  if (jobs.error !== undefined) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <ErrorState error={jobs.error} onRetry={jobs.reload} />
      </div>
    );
  }
  if (!job || !me) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <Card>
          <EmptyState
            title="Job not found"
            body={`There's no job with id ${id}. It may have been removed.`}
            action={
              <LinkButton to="/jobs" variant="secondary" className="mt-2">
                Back to paid jobs
              </LinkButton>
            }
          />
        </Card>
      </div>
    );
  }

  const mine = job.claimedByUserId === me.id;
  const expiresAt = job.claimExpiresAt ? new Date(job.claimExpiresAt).getTime() : null;
  const left = expiresAt ? expiresAt - now : null;
  const pct = left !== null ? Math.max(0, Math.min(100, (left / (job.timeLimitHours * 3600_000)) * 100)) : 0;
  const low = left !== null && left < 30 * 60_000;
  const step = ORDER.indexOf(job.status as (typeof ORDER)[number]);
  const invalid = prUrl.length > 0 && !PR_URL.test(prUrl.trim());

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (invalid || !prUrl.trim()) return;
    setBusy(true);
    setError(undefined);
    try {
      const updated = await api.submitJob(job.id, prUrl.trim());
      jobs.setData((list = []) => list.map((j) => (j.id === updated.id ? updated : j)));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pb-28">
      <div className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-8 gap-y-4 px-4 py-5 sm:px-6">
          <div className="min-w-0 flex-[999_1_360px]">
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-3">
              <Link to="/jobs">Paid jobs</Link>
              <span aria-hidden>/</span>
              <span className="font-mono">{job.id}</span>
              <Pill tone={jobStatusView[job.status].tone}>{mine && job.status === "claimed" ? "Claimed by you" : jobStatusView[job.status].label}</Pill>
            </div>
            <h1 className="m-0 mt-2 text-[24px] leading-tight font-semibold tracking-tight">{job.title}</h1>
            <div className="mt-1 font-mono text-[13px] text-ink-2">{job.companyId}</div>
          </div>
          <div className="flex items-center gap-6">
            <div>
              <div className="text-[11.5px] font-semibold tracking-[.06em] text-ink-3 uppercase">
                {job.status === "claimed" ? "Time left" : "Timer"}
              </div>
              <div
                role="timer"
                className={cx("font-mono text-[30px] font-bold tabular-nums", job.status !== "claimed" ? "text-ink-3" : low ? "text-err-text" : "text-ink")}
              >
                {left !== null ? countdown(left) : `${job.timeLimitHours}:00:00`}
              </div>
              <div className="mt-1 h-1.5 w-44 overflow-hidden rounded-full bg-overlay">
                <div className={cx("h-full rounded-full", low ? "bg-err" : "bg-xp")} style={{ width: `${pct}%` }} />
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-[32px] font-bold tracking-tight text-cash">{dollars(job.payCents)}</div>
              <EscrowBadge job={job} />
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-[1200px] flex-wrap items-start gap-6 px-4 py-6 sm:px-6">
        <Card className="min-w-0 flex-[1_1_480px] p-6">
          <SectionLabel>The brief</SectionLabel>
          <p className="m-0 whitespace-pre-line">{job.description}</p>
          <dl className="mt-6 grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-3">
            {[
              ["Time limit", `${job.timeLimitHours} hrs`],
              ["Min level", `L${job.minLevel}`],
              ["Escrow", job.escrowStatus],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-tint p-3">
                <dt className="text-ink-3">{k}</dt>
                <dd className="m-0 font-mono font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-4">
          <Card className="p-5">
            <SectionLabel>Progress</SectionLabel>
            <ol className="m-0 flex list-none gap-2 p-0">
              {ORDER.map((s, i) => (
                <li key={s} className="flex-1">
                  <div className={cx("h-1.5 rounded-full", i <= step ? (s === "paid" ? "bg-cash-bright" : "bg-pass") : "bg-overlay")} />
                  <div className={cx("mt-1.5 text-[12px] font-medium capitalize", i <= step ? "text-ink" : "text-ink-3")}>{s}</div>
                </li>
              ))}
            </ol>
          </Card>

          <Card className="p-5">
            {job.status === "claimed" && mine ? (
              <form onSubmit={submit} noValidate>
                <label htmlFor="job-pr" className="mb-1.5 block text-[13px] font-semibold">
                  Pull request URL
                </label>
                <input
                  id="job-pr"
                  value={prUrl}
                  onChange={(e) => setPrUrl(e.target.value)}
                  aria-invalid={invalid}
                  placeholder="https://github.com/org/repo/pull/64"
                  className={cx(
                    "min-h-11 w-full rounded-control border bg-code px-3 font-mono text-[12.5px]",
                    invalid ? "border-err ring-3 ring-err-soft" : "border-line",
                  )}
                />
                <p className={cx("m-0 mt-1.5 text-[12.5px]", invalid ? "text-err-text" : "text-ink-3")}>
                  {invalid ? "That isn't a pull request URL." : "The company reviews it and releases escrow when they accept."}
                </p>
                {error !== undefined && (
                  <div className="mt-3">
                    <ErrorState error={error} title="Submit failed" />
                  </div>
                )}
                <Button type="submit" variant="money" size="lg" className="mt-4 w-full" disabled={busy || invalid || !prUrl.trim()}>
                  {busy ? "Submitting…" : "Submit work for review"}
                </Button>
              </form>
            ) : (
              <div>
                <div className="font-semibold">
                  {job.status === "submitted"
                    ? "Submitted. Waiting on the company's review."
                    : job.status === "accepted" || job.status === "paid"
                      ? `Accepted. ${dollars(job.payCents)} ${job.escrowStatus === "released" ? "released from escrow" : "on its way"}.`
                      : job.status === "expired"
                        ? "This claim expired and the job was refunded."
                        : job.status === "open"
                          ? "This job is open. Claim it from the job board."
                          : "Another student claimed this job."}
                </div>
                <LinkButton to="/jobs" variant="secondary" className="mt-4">
                  {job.status === "accepted" || job.status === "paid" ? "Find another job" : "Back to paid jobs"}
                </LinkButton>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
