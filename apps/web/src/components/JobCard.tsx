import type { Job } from "@sidequest/shared";
import { dollars, jobStatusView } from "../lib/format";
import { Card, MockTag, Pill, cx } from "./ui";

export function EscrowBadge({ job }: { job: Job }) {
  const label = { funded: "Funded", released: "Released", refunded: "Refunded" }[job.escrowStatus];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-cash-line bg-cash-soft px-2.5 py-0.5 text-xs font-semibold text-cash">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
      {label} · escrow <MockTag />
    </span>
  );
}

export function JobCard({ job, fresh, children }: { job: Job; fresh?: boolean; children?: React.ReactNode }) {
  const view = jobStatusView[job.status];
  const muted = job.status === "expired" || (job.status !== "open" && !children);
  return (
    <Card className={cx("flex flex-wrap items-center gap-x-6 gap-y-3 p-5", fresh && "sq-pop border-cash-bright ring-4 ring-cash-soft")}>
      <div className="min-w-0 flex-[999_1_320px]">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={view.tone}>{view.label}</Pill>
          {fresh && <span className="text-xs font-bold tracking-wider text-cash uppercase">Just dropped</span>}
          <span className="font-mono text-[11.5px] text-ink-3">{job.id}</span>
        </div>
        <h3 className={cx("m-0 mt-2 text-[16.5px] font-semibold", muted && "text-ink-2")}>{job.title}</h3>
        <p className="m-0 mt-1 line-clamp-2 text-[13.5px] text-ink-2">{job.description}</p>
        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-3">
          <span className="font-mono">{job.timeLimitHours} hr limit</span>
          <span aria-hidden>·</span>
          <span className="font-mono">L{job.minLevel}+</span>
          <span aria-hidden>·</span>
          <span className="font-mono">{job.companyId}</span>
          <EscrowBadge job={job} />
        </div>
      </div>
      <div className="flex flex-[0_0_auto] flex-col items-end gap-2">
        <span className={cx("font-mono text-[28px] font-bold tracking-tight", muted ? "text-ink-3" : "text-cash")}>
          {dollars(job.payCents)}
        </span>
        {children}
      </div>
    </Card>
  );
}
