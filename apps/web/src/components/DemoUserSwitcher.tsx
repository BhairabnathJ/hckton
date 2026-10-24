import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDemoUser } from "../lib/demoUser";
import { homePath, isCompany } from "../lib/format";
import { Avatar, MockTag, cx } from "./ui";

/** // MOCK: header control that picks the X-Demo-User handle. */
export function DemoUserSwitcher() {
  const { users, me, setHandle, loading } = useDemoUser();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (loading && !me) return <div className="h-10 w-36 animate-pulse rounded-xl bg-overlay" aria-hidden />;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-10 items-center gap-2 rounded-xl border border-line bg-surface py-1 pr-2.5 pl-1 text-ink hover:bg-tint"
      >
        {me ? <Avatar name={me.name} level={isCompany(me) ? undefined : me.level} size={32} /> : <span className="size-8 rounded-full bg-overlay" />}
        <span className="hidden text-[13px] font-medium sm:inline">{me ? me.name.split(" ")[0] : "No user"}</span>
        <MockTag>DEMO</MockTag>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Switch demo user"
          className="sq-pop absolute top-12 right-0 z-40 w-[340px] max-w-[calc(100vw-32px)] rounded-card border border-line bg-surface p-2 shadow-[0_24px_60px_-20px_rgba(15,23,42,.3)]"
        >
          <div className="px-2.5 pt-2 pb-2">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-semibold">Switch demo user</span>
              <span className="rounded bg-warn-soft px-1.5 font-mono text-[10px] tracking-wider text-warn-text">MOCK LOGIN</span>
            </div>
            <p className="m-0 mt-1 text-[12.5px] text-ink-3">
              Sets the <span className="font-mono">X-Demo-User</span> header. No password needed.
            </p>
          </div>
          {users.length === 0 && <p className="px-2.5 pb-3 text-[13px] text-ink-2">The API didn't recognise any demo users.</p>}
          {users.map((u) => {
            const on = u.handle === me?.handle;
            return (
              <button
                key={u.id}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                onClick={() => {
                  setHandle(u.handle);
                  setOpen(false);
                  navigate(homePath(u));
                }}
                className={cx(
                  "mt-1 flex w-full items-center gap-3 rounded-xl border p-3 text-left",
                  on ? "border-xp bg-xp-soft" : "border-line bg-surface hover:bg-tint",
                )}
              >
                <Avatar name={u.name} level={isCompany(u) ? undefined : u.level} size={38} />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block font-semibold">{u.name}</span>
                  <span className="block truncate text-[12.5px] text-ink-2">
                    {isCompany(u) ? "Company account" : `Level ${u.level} · ${u.school} · ${u.xp.toLocaleString()} XP`}
                  </span>
                </span>
                <span className="font-mono text-[11px] text-ink-3">{u.handle}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
