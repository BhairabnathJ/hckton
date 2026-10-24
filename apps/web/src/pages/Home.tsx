import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, EmptyState, ErrorState, LevelTag, LinkButton, SkeletonList, XpBar, cx } from "../components/ui";
import { api } from "../lib/api";
import { useDemoUser } from "../lib/demoUser";
import { LEVEL_GATE } from "../lib/format";
import { useAsync } from "../lib/useAsync";

export function Home() {
  const { me, handle } = useDemoUser();
  const tickets = useAsync(() => api.tickets(), [handle]);
  const [level, setLevel] = useState<number | "all">("all");

  const levels = useMemo(() => [...new Set((tickets.data ?? []).map((t) => t.level))].sort((a, b) => a - b), [tickets.data]);
  const shown = (tickets.data ?? []).filter((t) => level === "all" || t.level === level);

  if (!me) return null;
  const paid = me.level >= LEVEL_GATE;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-wrap gap-6 px-4 py-6 sm:px-6">
      <aside className="flex flex-[1_1_300px] flex-col gap-4 lg:max-w-[340px]">
        <Card className="p-5">
          <p className="m-0 text-[13px] text-ink-3">{me.school}</p>
          <h1 className="m-0 mt-0.5 text-[22px] font-semibold tracking-tight">Hi, {me.name.split(" ")[0]}</h1>
          <XpBar xp={me.xp} level={me.level} className="mt-4" />
          <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
            <div className="rounded-xl bg-tint p-3">
              <dt className="text-ink-3">Rating</dt>
              <dd className="m-0 font-mono text-lg font-semibold">{me.rating.toFixed(1)}</dd>
            </div>
            <div className="rounded-xl bg-tint p-3">
              <dt className="text-ink-3">Tickets open</dt>
              <dd className="m-0 font-mono text-lg font-semibold">{tickets.data?.length ?? "—"}</dd>
            </div>
          </dl>
        </Card>

        <Card className={cx("p-5", paid ? "border-cash-line" : "")}>
          <div className="flex items-center gap-2">
            <h2 className="m-0 text-[15px] font-semibold">Paid jobs</h2>
            {!paid && <span className="rounded-md bg-off-soft px-2 py-0.5 font-mono text-xs font-bold text-ink-3">L{LEVEL_GATE}</span>}
          </div>
          {paid ? (
            <>
              <p className="m-0 mt-1.5 text-[13px] text-ink-2">You're Level {me.level}. Paid jobs are first come, first served.</p>
              <LinkButton to="/jobs" variant="money" className="mt-3 w-full">
                Open the job board
              </LinkButton>
            </>
          ) : (
            <p className="m-0 mt-1.5 text-[13px] text-ink-2">
              Unlocks at Level {LEVEL_GATE}. You're {LEVEL_GATE - me.level} level{LEVEL_GATE - me.level === 1 ? "" : "s"} away.
            </p>
          )}
        </Card>
      </aside>

      <Card className="min-w-0 flex-[999_1_560px] overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
          <h2 className="m-0 text-[17px] font-semibold">Tickets for you</h2>
          <span className="text-[13px] text-ink-3">Filtered to your level by the API</span>
        </div>
        <div role="group" aria-label="Level filter" className="flex flex-wrap gap-1.5 border-b border-line px-5 py-3">
          {(["all", ...levels] as const).map((l) => (
            <button
              key={String(l)}
              type="button"
              aria-pressed={level === l}
              onClick={() => setLevel(l)}
              className={cx(
                "min-h-8 rounded-full border px-3 text-[13px]",
                level === l ? "border-xp bg-xp-soft font-semibold text-xp-text" : "border-line text-ink-2 hover:bg-tint",
              )}
            >
              {l === "all" ? "All" : `Level ${l}`}
            </button>
          ))}
        </div>

        {tickets.loading && !tickets.data && <SkeletonList rows={5} />}
        {tickets.error !== undefined && (
          <div className="p-5">
            <ErrorState error={tickets.error} onRetry={tickets.reload} />
          </div>
        )}
        {tickets.data && shown.length === 0 && (
          <EmptyState title="No tickets yet" body="New Brightline tickets appear here as they're added. Check back soon." />
        )}
        <ul className="m-0 list-none p-0">
          {shown.map((t) => (
            <li key={t.id} className="border-b border-line last:border-b-0">
              <Link
                to={`/tickets/${encodeURIComponent(t.id)}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-4 text-ink no-underline hover:bg-tint"
              >
                <span className="min-w-0 flex-[999_1_260px]">
                  <span className="block text-[14.5px] font-medium">{t.title}</span>
                  <span className="mt-1 block font-mono text-[12px] text-ink-3">{t.id}</span>
                </span>
                <span className="text-[12.5px] text-ink-3">
                  {t.acceptanceCriteria.length} criteria
                </span>
                <LevelTag level={t.level} />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
