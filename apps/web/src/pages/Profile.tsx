import { useState } from "react";
import { useParams } from "react-router-dom";
import type { User } from "@sidequest/shared";
import { Avatar, Card, ErrorState, Pill, SectionLabel, Skeleton, XpBar, cx } from "../components/ui";
import { api, describeError } from "../lib/api";
import { useDemoUser } from "../lib/demoUser";
import { LEVEL_GATE } from "../lib/format";
import { useAsync } from "../lib/useAsync";

/** /profile shows the current user; /users/:id shows any user's public profile. */
export function Profile() {
  const { id } = useParams();
  const { me, handle } = useDemoUser();
  const other = useAsync(() => (id ? api.user(id) : Promise.resolve(null)), [id, handle]);
  const user: User | null | undefined = id ? other.data : me;
  const isMe = !!user && user.id === me?.id;

  if (id && other.error !== undefined) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <ErrorState error={other.error} onRetry={other.reload} title="Couldn't load this profile" />
      </div>
    );
  }
  if (!user) {
    return (
      <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6">
        <Skeleton className="h-48 rounded-card" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[1100px] flex-wrap items-start gap-6 px-4 py-6 sm:px-6">
      <Card className="min-w-0 flex-[999_1_480px] p-6">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={user.name} level={user.level} size={64} />
          <div className="min-w-0">
            <h1 className="m-0 text-[24px] font-semibold tracking-tight">{user.name}</h1>
            <div className="text-ink-2">
              <span className="font-mono">@{user.handle}</span> · {user.school}
            </div>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            {user.level >= LEVEL_GATE && <Pill tone="cash">Paid jobs unlocked</Pill>}
            {user.workAuthorized && <Pill tone="pass">Work authorized</Pill>}
          </div>
        </div>
        <XpBar xp={user.xp} level={user.level} className="mt-6" />
        <dl className="mt-6 grid grid-cols-3 gap-3 text-[13px]">
          {[
            ["Level", String(user.level)],
            ["XP", user.xp.toLocaleString()],
            ["Rating", user.rating.toFixed(1)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-tint p-3">
              <dt className="text-ink-3">{k}</dt>
              <dd className="m-0 font-mono text-xl font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="m-0 mt-4 text-[12.5px] text-ink-3">
          Public link: <span className="font-mono">/users/{user.id}</span>
        </p>
      </Card>

      {isMe && <TelemetryCard user={user} />}
    </div>
  );
}

function TelemetryCard({ user }: { user: User }) {
  const { refreshMe } = useDemoUser();
  const [on, setOn] = useState(user.telemetryOptIn);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();

  const toggle = async () => {
    const next = !on;
    setOn(next);
    setBusy(true);
    setError(undefined);
    try {
      const updated = await api.setTelemetryOptIn(next);
      setOn(updated.telemetryOptIn);
      await refreshMe();
    } catch (err) {
      setOn(!next);
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="min-w-0 flex-[1_1_320px] p-6">
      <SectionLabel>Privacy</SectionLabel>
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="font-semibold" id="telemetry-label">
            Share anonymous usage data
          </div>
          <p className="m-0 mt-1 text-[13px] text-ink-2">
            Helps us improve tickets and grading. Saved as <span className="font-mono">telemetryOptIn</span>.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby="telemetry-label"
          disabled={busy}
          onClick={toggle}
          className={cx("relative h-7 w-12 shrink-0 rounded-full transition-colors duration-150", on ? "bg-xp" : "bg-line-2")}
        >
          <span
            className={cx(
              "absolute top-[3px] size-[22px] rounded-full bg-white shadow transition-[left] duration-150",
              on ? "left-[23px]" : "left-[3px]",
            )}
          />
        </button>
      </div>
      <p className={cx("m-0 mt-3 text-[12.5px] font-medium", on ? "text-pass-text" : "text-ink-3")}>{on ? "On" : "Off"}</p>
      {error !== undefined && <p className="m-0 mt-2 text-[12.5px] text-err-text">{describeError(error)}</p>}
    </Card>
  );
}
