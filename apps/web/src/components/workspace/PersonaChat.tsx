import { useState, type FormEvent } from "react";
import { api, describeError } from "../../lib/api";
import { Button, Card, cx } from "../ui";

interface ChatLine {
  mine: boolean;
  text: string;
  error?: boolean;
}

export function PersonaChat({
  persona,
  attemptId,
  onAnswered,
}: {
  persona: "pm" | "coach";
  attemptId?: string;
  onAnswered: () => void;
}) {
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const isCoach = persona === "coach";

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const q = draft.trim();
    if (!q || busy) return;
    setDraft("");
    setLines((l) => [...l, { mine: true, text: q }]);
    setBusy(true);
    try {
      const res = await api.ask(persona, q, attemptId);
      setLines((l) => [...l, { mine: false, text: res.response }]);
      onAnswered();
    } catch (err) {
      setLines((l) => [...l, { mine: false, text: describeError(err), error: true }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex min-h-[420px] flex-col overflow-hidden">
      <div className="border-b border-line px-4 py-3">
        <div className="text-[13.5px] font-semibold">{isCoach ? "Engineering Coach" : "Product Manager"}</div>
        <div className="text-[12px] text-ink-3">
          {isCoach ? "Explains concepts and points you to files. Won't write the fix." : "Answers questions about requirements. Free to ask."}
        </div>
      </div>
      {isCoach && (
        <div className="mx-4 mt-3 rounded-xl border border-warn bg-warn-soft px-3.5 py-2.5 text-[13px]">
          <strong className="font-semibold">Asking Coach counts as a hint.</strong>{" "}
          <span className="text-ink-2">Any hint forfeits the +25 clean-solve bonus on this ticket.</span>
        </div>
      )}
      <div className="flex flex-1 flex-col gap-3 p-4" aria-live="polite">
        {lines.length === 0 && (
          <p className="m-auto max-w-[280px] text-center text-[13px] text-ink-3">
            {isCoach ? "Stuck? Ask Coach where to look." : "Ask about expected behaviour, edge cases or scope."}
          </p>
        )}
        {lines.map((l, i) => (
          <div
            key={i}
            className={cx(
              "max-w-[86%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-[13.5px]",
              l.mine
                ? "self-end rounded-br-sm bg-xp text-white"
                : l.error
                  ? "self-start rounded-bl-sm border border-err/40 bg-err-soft text-err-text"
                  : "self-start rounded-bl-sm border border-line bg-tint",
            )}
          >
            {l.text}
          </div>
        ))}
        {busy && <div className="self-start text-[12.5px] text-ink-3">Writing…</div>}
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-line p-3">
        <label htmlFor={`q-${persona}`} className="sr-only">
          Ask {isCoach ? "Coach" : "the PM"}
        </label>
        <input
          id={`q-${persona}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={isCoach ? "Ask Coach for a hint…" : "Ask about requirements…"}
          className="min-h-11 min-w-0 flex-1 rounded-control border border-line bg-tint px-3 text-[13px]"
        />
        <Button type="submit" variant={isCoach ? "warn" : "primary"} disabled={busy || !draft.trim()}>
          {isCoach ? "Use hint" : "Send"}
        </Button>
      </form>
    </Card>
  );
}
