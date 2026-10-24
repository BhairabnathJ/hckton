import type { ReactNode } from "react";
import { NavLink, Link, Navigate, Outlet } from "react-router-dom";
import { useDemoUser } from "../lib/demoUser";
import { LEVEL_GATE, isCompany } from "../lib/format";
import { DemoUserSwitcher } from "./DemoUserSwitcher";
import { ErrorState, cx } from "./ui";

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 text-[17px] font-bold tracking-tight text-ink no-underline">
      <span className="grid size-8 place-items-center rounded-[9px] bg-xp text-white">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      </span>
      SideQuest
    </Link>
  );
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  cx(
    "rounded-control px-3 py-2 text-sm font-medium no-underline",
    isActive ? "bg-xp-soft text-xp-text" : "text-ink-2 hover:bg-tint hover:text-ink",
  );

/** Company-only routes: students are sent to the job board. */
export function RequireCompany({ children }: { children: ReactNode }) {
  const { me, loading } = useDemoUser();
  if (!me) return loading ? null : <Navigate to="/login" replace />;
  return isCompany(me) ? <>{children}</> : <Navigate to="/jobs" replace />;
}

export function AppShell() {
  const { me, error, loading } = useDemoUser();
  const paid = (me?.level ?? 0) >= LEVEL_GATE;
  const company = isCompany(me);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
          <Logo />
          <nav aria-label="Primary" className="order-3 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
            {company ? (
              <NavLink to="/company" className={navClass}>
                Company
              </NavLink>
            ) : (
              <NavLink to="/home" className={navClass}>
                Home
              </NavLink>
            )}
            <NavLink to="/jobs" className={navClass}>
              <span className="inline-flex items-center gap-1.5">
                Paid jobs
                {!paid && !company && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-label="locked">
                    <rect x="4" y="11" width="16" height="10" rx="2" />
                    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                  </svg>
                )}
              </span>
            </NavLink>
            {!company && (
              <NavLink to="/profile" className={navClass}>
                Profile
              </NavLink>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-2.5">
            {me && !company && (
              <span className="hidden rounded-full bg-xp-soft px-2.5 py-1 font-mono text-[12.5px] font-semibold text-xp-text md:inline">
                {me.xp.toLocaleString()} XP
              </span>
            )}
            <DemoUserSwitcher />
          </div>
        </div>
      </header>
      <main>
        {!loading && error && !me ? (
          <div className="mx-auto max-w-xl p-6">
            <ErrorState title="Can't sign in a demo user" error={error} onRetry={() => window.location.reload()} />
          </div>
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  );
}
