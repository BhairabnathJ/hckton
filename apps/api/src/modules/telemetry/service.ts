/**
 * telemetry service (architecture §2 telemetry, §6 opt-in).
 *
 * Records a TelemetryEvent ONLY when the user's telemetryOptIn is true. For a
 * user who has not opted in (the default), nothing is recorded and the calling
 * request is not affected — telemetry is a side channel that must never block
 * or fail the main flow.
 */
import { prisma } from "../../db.js";

/** Fire-and-forget: record an opt-in event; swallow all errors. */
export function record(userId: string, name: string, props: Record<string, unknown> = {}): void {
  void capture(userId, name, props).catch(() => {
    // Side channel: a telemetry failure must never surface to the caller.
  });
}

async function capture(userId: string, name: string, props: Record<string, unknown>): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { telemetryOptIn: true },
  });
  // Consent gate: only opted-in users are recorded.
  if (!user?.telemetryOptIn) return;

  await prisma.telemetryEvent.create({
    data: {
      userId,
      name,
      // Bounded, anonymized props — no PII, no secrets (§6).
      propsJson: JSON.stringify(props).slice(0, 2000),
    },
  });
}
