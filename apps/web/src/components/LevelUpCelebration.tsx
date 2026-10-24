import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Card, XpBar } from "./ui";

export interface XpSnapshot {
  xp: number;
  level: number;
}

const CONFETTI = ["#2563EB", "#10B981", "#93C5FD", "#6EE7B7"];

/** XP count-up with blue/green confetti on a level increase. */
export function LevelUpCelebration({
  from,
  to,
  ticketId,
  actions,
}: {
  from: XpSnapshot;
  to: XpSnapshot;
  ticketId?: string;
  actions?: ReactNode;
}) {
  const gained = Math.max(0, to.xp - from.xp);
  const leveled = to.level > from.level;
  const [xp, setXp] = useState(from.xp);

  useEffect(() => {
    if (gained === 0) return;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 1200);
      setXp(Math.round(from.xp + gained * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from.xp, gained]);

  const pieces = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        left: `${(i * 37) % 100}%`,
        delay: `${(i % 9) * 0.12}s`,
        duration: `${2.4 + (i % 5) * 0.35}s`,
        color: CONFETTI[i % CONFETTI.length],
        size: 6 + (i % 4) * 2,
      })),
    [],
  );

  return (
    <>
      {(leveled || gained > 0) &&
        pieces.map((p, i) => (
          <span
            key={i}
            aria-hidden
            className="sq-confetti pointer-events-none fixed top-0 z-[60] rounded-[2px]"
            style={{
              left: p.left,
              width: p.size,
              height: p.size * 1.6,
              background: p.color,
              animation: `sq-confetti ${p.duration} ease-in ${p.delay} both`,
            }}
          />
        ))}
      <Card className="relative w-full max-w-[520px] p-8 text-center">
        <div className="text-[12px] font-bold tracking-[.08em] text-xp-text uppercase">
          {leveled ? "Level up" : gained > 0 ? "XP earned" : "Your progress"}
        </div>
        <h2 className="m-0 mt-2 text-[40px] leading-none font-bold tracking-[-0.04em]">
          {leveled ? `Level ${to.level}` : `+${gained} XP`}
        </h2>
        {ticketId && <p className="m-0 mt-2 font-mono text-[13px] text-ink-3">{ticketId} passed</p>}
        {gained > 0 && leveled && (
          <div className="mx-auto mt-6 inline-flex rounded-full bg-xp-soft px-4 py-1.5 font-mono text-lg font-bold text-xp-text">
            +{gained} XP
          </div>
        )}
        <XpBar xp={xp} level={xp >= to.xp ? to.level : from.level} className="mt-6 text-left" />
        {actions && <div className="mt-8 flex flex-wrap gap-2">{actions}</div>}
      </Card>
    </>
  );
}
