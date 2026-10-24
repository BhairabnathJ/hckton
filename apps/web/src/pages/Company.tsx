import { useMemo, useState, type FormEvent } from "react";
import type { Job } from "@sidequest/shared";
import { JobCard } from "../components/JobCard";
import { Button, Card, EmptyState, ErrorState, MockTag, Skeleton, Toast } from "../components/ui";
import { api, describeError } from "../lib/api";
import { useDemoUser } from "../lib/demoUser";
import { useJobEvents } from "../lib/events";
import { LEVEL_GATE, dollars } from "../lib/format";
import { useAsync } from "../lib/useAsync";

const DEFAULT_COMPANY = import.meta.env.VITE_DEMO_COMPANY_ID ?? "company_northwind";
const FEE_RATE = 0.1; // MOCK: platform fee shown in the escrow summary

export function Company() {
  const { handle } = useDemoUser();
  const jobs = useAsync(() => api.jobs(), [handle]);
  const [toast, setToast] = useState<{ text: string; tone: "cash" | "err" } | null>(null);
  const companies = useMemo(
    () => [...new Set([DEFAULT_COMPANY, ...(jobs.data ?? []).map((j) => j.companyId)])],
    [jobs.data],
  );
  const [companyId, setCompanyId] = useState(DEFAULT_COMPANY);

  const upsert = (job: Job) =>
    jobs.setData((list = []) => (list.some((j) => j.id === job.id) ? list.map((j) => (j.id === job.id ? job : j)) : [job, ...list]));
  useJobEvents((ev) => upsert(ev.job));

  const posted = (jobs.data ?? []).filter((j) => j.companyId === companyId);

  return (
    <div className="mx-auto max-w-[1300px] px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex-1">
          <h1 className="m-0 text-[28px] font-semibold tracking-tight">Company</h1>
          <p className="m-0 mt-1 text-ink-2">Post paid jobs for Level {LEVEL_GATE}+ students and accept their work.</p>
        </div>
        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          Posting as
          <select
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            className="min-h-10 rounded-control border border-line bg-surface px-2.5 font-mono text-[13px] text-ink"
          >
            {companies.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-6 flex flex-wrap items-start gap-6">
        <PostJobForm
          companyId={companyId}
          onPosted={(job) => {
            upsert(job);
            setToast({ text: `Posted "${job.title}". It's live on the board.`, tone: "cash" });
          }}
        />

        <Card className="min-w-0 flex-[999_1_560px] overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line px-5 py-4">
            <h2 className="m-0 text-[17px] font-semibold">Posted jobs</h2>
            <span className="font-mono text-[12px] text-ink-3">live via /events</span>
          </div>
          <div className="flex flex-col gap-3 p-4">
            {jobs.loading && !jobs.data && Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-32 rounded-card" />)}
            {jobs.error !== undefined && <ErrorState error={jobs.error} onRetry={jobs.reload} title="Couldn't load jobs" />}
            {jobs.data && posted.length === 0 && (
              <EmptyState title="No jobs posted yet" body="Post your first job and Level 6 students get notified the moment it drops." />
            )}
            {posted.map((j) => (
              <JobCard key={j.id} job={j}>
                {j.status === "submitted" && (
                  <AcceptButton
                    job={j}
                    onDone={(updated) => {
                      upsert(updated);
                      setToast({ text: `Accepted. ${dollars(updated.payCents)} released from escrow.`, tone: "cash" });
                    }}
                    onError={(err) => setToast({ text: describeError(err), tone: "err" })}
                  />
                )}
              </JobCard>
            ))}
          </div>
        </Card>
      </div>

      {toast && (
        <Toast tone={toast.tone} onClose={() => setToast(null)}>
          {toast.text}
        </Toast>
      )}
    </div>
  );
}

function AcceptButton({ job, onDone, onError }: { job: Job; onDone: (j: Job) => void; onError: (e: unknown) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="money"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          onDone(await api.acceptJob(job.id));
        } catch (err) {
          onError(err);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Releasing…" : `Accept and release ${dollars(job.payCents)}`}
    </Button>
  );
}

const field = "min-h-11 w-full rounded-control border border-line bg-surface px-3 text-sm text-ink";

function PostJobForm({ companyId, onPosted }: { companyId: string; onPosted: (job: Job) => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pay, setPay] = useState("40");
  const [hours, setHours] = useState("3");
  const [minLevel, setMinLevel] = useState(String(LEVEL_GATE));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();

  const payCents = Math.round(Number(pay) * 100);
  const payOk = Number.isFinite(payCents) && payCents > 0;
  const fee = Math.round(payCents * FEE_RATE);
  const ready = title.trim() && description.trim() && payOk && Number(hours) > 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(undefined);
    try {
      const job = await api.postJob({
        companyId,
        title: title.trim(),
        description: description.trim(),
        payCents,
        timeLimitHours: Math.round(Number(hours)),
        minLevel: Number(minLevel),
      });
      onPosted(job);
      setTitle("");
      setDescription("");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="min-w-0 flex-[1_1_380px] p-6">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <h2 className="m-0 text-[17px] font-semibold">Post a job</h2>
        <div>
          <label htmlFor="j-title" className="mb-1.5 block text-[13px] font-semibold">
            Title
          </label>
          <input id="j-title" className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Clean and dedupe our customer CSV" />
        </div>
        <div>
          <label htmlFor="j-desc" className="mb-1.5 block text-[13px] font-semibold">
            Description
          </label>
          <textarea
            id="j-desc"
            rows={4}
            className={`${field} py-2.5 leading-normal`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What needs doing, and what 'done' looks like."
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="j-pay" className="mb-1.5 block text-[13px] font-semibold">
              Pay ($)
            </label>
            <input id="j-pay" inputMode="decimal" className={`${field} font-mono font-semibold text-cash`} value={pay} onChange={(e) => setPay(e.target.value)} />
          </div>
          <div>
            <label htmlFor="j-hours" className="mb-1.5 block text-[13px] font-semibold">
              Time limit
            </label>
            <select id="j-hours" className={field} value={hours} onChange={(e) => setHours(e.target.value)}>
              {[2, 3, 4, 6, 24, 48].map((h) => (
                <option key={h} value={h}>
                  {h} hrs
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="j-lv" className="mb-1.5 block text-[13px] font-semibold">
              Min level
            </label>
            <select id="j-lv" className={field} value={minLevel} onChange={(e) => setMinLevel(e.target.value)}>
              {[6, 7, 8, 9, 10].map((l) => (
                <option key={l} value={l}>
                  L{l}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2.5 rounded-xl border border-cash-line bg-cash-soft px-3.5 py-3 text-[13px]">
          <span className="flex-1">
            Escrow: <strong className="font-mono">{payOk ? dollars(payCents) : "—"}</strong>
            {payOk && (
              <>
                {" "}
                + <span className="font-mono">{dollars(fee)}</span> fee
              </>
            )}
            . Released when you accept the PR.
          </span>
          <MockTag />
        </div>
        {error !== undefined && <ErrorState error={error} title="Couldn't post the job" />}
        <Button type="submit" variant="money" size="lg" disabled={busy || !ready}>
          {busy ? "Posting…" : payOk ? `Fund ${dollars(payCents + fee)} and post` : "Fund and post"}
        </Button>
      </form>
    </Card>
  );
}
