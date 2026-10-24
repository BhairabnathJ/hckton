import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";
import { describeError } from "../lib/api";
import { initials, xpProgress, type Tone } from "../lib/format";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "money" | "secondary" | "ghost" | "warn";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-xp text-white shadow-[0_6px_18px_-6px_rgba(37,99,235,.55)] hover:bg-xp-text",
  money: "bg-cash text-white shadow-[0_6px_18px_-6px_rgba(4,120,87,.55)] hover:brightness-110",
  secondary: "border border-line-2 bg-surface text-ink hover:bg-tint",
  ghost: "text-ink-2 hover:bg-tint hover:text-ink",
  warn: "border border-warn bg-surface text-warn-text hover:bg-warn-soft",
};
const sizes: Record<Size, string> = {
  sm: "min-h-9 px-3 text-[13px] rounded-control",
  md: "min-h-11 px-4 text-sm rounded-xl",
  lg: "min-h-13 px-6 text-base rounded-[14px]",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md"): string {
  return cx(
    "inline-flex items-center justify-center gap-2 font-semibold no-underline transition-colors duration-150",
    "disabled:cursor-not-allowed disabled:bg-overlay disabled:text-ink-2 disabled:shadow-none disabled:border-transparent",
    variants[variant],
    sizes[size],
  );
}

export function Button({
  variant,
  size,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button type="button" {...props} className={cx(buttonClass(variant, size), className)} />;
}

export function LinkButton({
  variant,
  size,
  className,
  ...props
}: LinkProps & { variant?: Variant; size?: Size }) {
  return <Link {...props} className={cx(buttonClass(variant, size), "hover:no-underline", className)} />;
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cx("rounded-card border border-line bg-surface shadow-card", className)}>{children}</section>;
}

const tones: Record<Tone, string> = {
  pass: "bg-pass-soft text-pass-text",
  warn: "bg-warn-soft text-warn-text",
  err: "bg-err-soft text-err-text",
  run: "bg-xp-soft text-xp-text",
  claim: "bg-claim-soft text-claim-text",
  off: "bg-off-soft text-ink-2",
  cash: "bg-cash-soft text-cash",
};

export function Pill({ tone, children, dot = true }: { tone: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold", tones[tone])}>
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function MockTag({ children = "MOCK" }: { children?: ReactNode }) {
  return (
    <span className="rounded border border-dashed border-warn px-1.5 font-mono text-[10px] font-medium tracking-wider text-warn-text">
      {children}
    </span>
  );
}

export function LevelTag({ level, locked }: { level: number; locked?: boolean }) {
  return (
    <span
      className={cx(
        "rounded-md px-2 py-0.5 font-mono text-xs font-bold",
        locked ? "bg-off-soft text-ink-3" : "bg-xp-soft text-xp-text",
      )}
    >
      L{level}
    </span>
  );
}

export function Avatar({ name, level, size = 36 }: { name: string; level?: number; size?: number }) {
  return (
    <span
      className="relative grid shrink-0 place-items-center rounded-full bg-tint-2 font-semibold text-xp-text"
      style={{ width: size, height: size, fontSize: size * 0.34 }}
    >
      {initials(name)}
      {level !== undefined && (
        <span className="absolute -right-1.5 -bottom-1 grid h-[17px] min-w-[18px] place-items-center rounded-full border-2 border-surface bg-xp px-0.5 font-mono text-[10px] font-bold text-white">
          {level}
        </span>
      )}
    </span>
  );
}

export function XpBar({ xp, level, className }: { xp: number; level: number; className?: string }) {
  const p = xpProgress(xp);
  return (
    <div className={className}>
      <div className="flex justify-between text-[13px]">
        <span className="font-mono font-bold text-xp-text">LV {level}</span>
        <span className="font-mono text-ink-2">
          {xp.toLocaleString()} XP · {p.toNext} to L{level + 1}
        </span>
      </div>
      <div
        className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-overlay"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={p.pct}
        aria-label={`Level ${level} progress`}
      >
        <div className="h-full rounded-full bg-xp transition-[width] duration-700" style={{ width: `${p.pct}%` }} />
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("animate-pulse rounded-lg bg-overlay", className)} />;
}

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3 p-5" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-6 rounded-full" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = "Couldn't load this" }: { error: unknown; onRetry?: () => void; title?: string }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-2 rounded-xl border border-err/40 bg-err-soft p-4">
      <div className="font-semibold text-err-text">{title}</div>
      <p className="m-0 text-[13px] text-ink-2">{describeError(error)}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <div className="font-semibold">{title}</div>
      {body && <p className="m-0 max-w-sm text-[13px] text-ink-2">{body}</p>}
      {action}
    </div>
  );
}

export function Toast({ children, tone = "run", onClose }: { children: ReactNode; tone?: Tone; onClose: () => void }) {
  return (
    <div
      role="status"
      className={cx(
        "sq-pop fixed right-4 bottom-4 z-50 flex max-w-sm items-start gap-3 rounded-xl border border-line px-4 py-3 shadow-card",
        tones[tone],
      )}
    >
      <div className="flex-1 text-[13px]">{children}</div>
      <button type="button" onClick={onClose} className="text-xs font-semibold underline-offset-2 hover:underline">
        Dismiss
      </button>
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <h3 className="m-0 mb-2.5 text-[11.5px] font-semibold tracking-[.06em] text-ink-3 uppercase">{children}</h3>;
}
