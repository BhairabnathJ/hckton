import { Link, useNavigate } from "react-router-dom";
import { Logo } from "../components/AppShell";
import { Avatar, Card, ErrorState, MockTag, Skeleton } from "../components/ui";
import { useDemoUser } from "../lib/demoUser";
import { LEVEL_GATE } from "../lib/format";

/** // MOCK: login is a demo-user picker that sets X-Demo-User. */
export function Login() {
  const { users, setHandle, loading, error } = useDemoUser();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(1100px_620px_at_50%_-10%,#dbe8ff,transparent_70%)]">
      <div className="flex items-center justify-between px-4 py-4 sm:px-6">
        <Link to="/" className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-sm font-medium text-ink no-underline shadow-card">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back to home
        </Link>
      </div>
      <main className="grid flex-1 place-items-center px-4 pb-16">
        <Card className="w-full max-w-[440px] px-7 py-9 text-center sm:px-9">
          <div className="flex justify-center">
            <Logo />
          </div>
          <h1 className="m-0 mt-5 text-[24px] leading-tight font-semibold tracking-tight">Sign in to SideQuest</h1>
          <p className="m-0 mt-2 text-ink-2">
            Pick a demo account <MockTag>MOCK LOGIN</MockTag>
          </p>

          <div className="mt-6 flex flex-col gap-2 text-left">
            {loading &&
              Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-[62px] rounded-xl" />)}
            {!loading && error !== undefined && users.length === 0 && (
              <ErrorState title="Can't reach the API" error={error} onRetry={() => window.location.reload()} />
            )}
            {users.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => {
                  setHandle(u.handle);
                  navigate(u.handle === "admin" ? "/company" : u.level >= LEVEL_GATE ? "/jobs" : "/home");
                }}
                className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3 hover:border-xp hover:bg-xp-soft"
              >
                <Avatar name={u.name} level={u.level} size={40} />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block font-semibold">{u.name}</span>
                  <span className="block truncate text-[12.5px] text-ink-2">
                    Level {u.level} · {u.school}
                  </span>
                </span>
                <span className="font-mono text-[11px] text-ink-3">{u.handle}</span>
              </button>
            ))}
          </div>
          <p className="m-0 mt-5 text-[12.5px] text-ink-3">
            Sends the <span className="font-mono">X-Demo-User</span> header. Real auth replaces this later.
          </p>
        </Card>
      </main>
    </div>
  );
}
