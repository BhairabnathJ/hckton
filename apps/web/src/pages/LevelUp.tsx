import { useLocation } from "react-router-dom";
import { LevelUpCelebration, type XpSnapshot } from "../components/LevelUpCelebration";
import { LinkButton } from "../components/ui";
import { useDemoUser } from "../lib/demoUser";

interface LevelUpState {
  ticketId?: string;
  from?: XpSnapshot | null;
  to?: XpSnapshot | null;
}

export function LevelUp() {
  const { me } = useDemoUser();
  const state = (useLocation().state ?? {}) as LevelUpState;
  const to = state.to ?? (me ? { xp: me.xp, level: me.level } : { xp: 0, level: 1 });
  const from = state.from ?? to;

  return (
    <div className="relative grid min-h-[calc(100vh-64px)] place-items-center overflow-hidden px-4 py-12">
      <LevelUpCelebration
        from={from}
        to={to}
        ticketId={state.ticketId}
        actions={
          <>
            <LinkButton to="/home" className="flex-1">
              Next ticket
            </LinkButton>
            <LinkButton to="/profile" variant="secondary">
              View profile
            </LinkButton>
          </>
        }
      />
    </div>
  );
}
