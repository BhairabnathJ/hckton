/**
 * Deterministic seed (`npm run seed`).
 *
 * Re-running resets to the same known state: it clears the mutable tables and
 * re-creates the three demo users, the two personas, the Brightline SimCompany,
 * and the tickets loaded from sim-companies/brightline-hidden/tickets.json.
 *
 * Demo users (resolvable via X-Demo-User), level-consistent under
 * level = floor(xp / 100) + 1:
 *   - Maya Chen      handle "maya"   Level 1  UMass Amherst       xp 0     (0..99   -> L1)
 *   - Jordan Okafor  handle "jordan" Level 6  Northeastern        xp 550   (500..599 -> L6)
 *   - company admin  handle "admin"  Level 1  SideQuest           xp 0
 */
import { prisma } from "../src/db.js";
import { reloadTickets } from "../src/modules/tickets/loader.js";

async function main(): Promise<void> {
  // Clear in FK-safe order so the seed is deterministic on re-run.
  await prisma.telemetryEvent.deleteMany();
  await prisma.hintLog.deleteMany();
  await prisma.review.deleteMany();
  await prisma.gradeRun.deleteMany();
  await prisma.attempt.deleteMany();
  // Tickets/personas/users are upserted below; no need to delete tickets (the
  // reload upserts them and attempts referencing them were just cleared).

  // Personas (pm/coach) authored reviews reference these.
  await prisma.persona.upsert({
    where: { id: "pm" },
    create: {
      id: "pm",
      name: "Product Manager",
      voice: "pragmatic product manager",
      systemPrompt: "Clarify requirements and acceptance criteria; never give solution code.",
    },
    update: {},
  });
  await prisma.persona.upsert({
    where: { id: "coach" },
    create: {
      id: "coach",
      name: "Engineering Coach",
      voice: "senior engineering coach",
      systemPrompt: "Give nudges only; never a solution. Reviews advise APPROVE / REQUEST_CHANGES.",
    },
    update: {},
  });

  // Three demo users.
  await prisma.user.upsert({
    where: { handle: "maya" },
    create: {
      handle: "maya",
      name: "Maya Chen",
      school: "UMass Amherst",
      xp: 0,
      level: 1,
      rating: 0,
      workAuthorized: false,
      telemetryOptIn: false,
    },
    update: { name: "Maya Chen", school: "UMass Amherst", xp: 0, level: 1 },
  });
  await prisma.user.upsert({
    where: { handle: "jordan" },
    create: {
      handle: "jordan",
      name: "Jordan Okafor",
      school: "Northeastern",
      xp: 550,
      level: 6,
      rating: 4.8,
      workAuthorized: true,
      telemetryOptIn: false,
    },
    update: {
      name: "Jordan Okafor",
      school: "Northeastern",
      xp: 550,
      level: 6,
      rating: 4.8,
      workAuthorized: true,
    },
  });
  await prisma.user.upsert({
    where: { handle: "admin" },
    create: {
      handle: "admin",
      name: "SideQuest Admin",
      school: "SideQuest",
      xp: 0,
      level: 1,
      rating: 0,
      workAuthorized: true,
      telemetryOptIn: false,
    },
    update: { name: "SideQuest Admin" },
  });

  // Tickets from the server-only hidden manifest (Brightline SimCompany).
  const { count } = await reloadTickets();

  const users = await prisma.user.count();
  console.log(`Seed complete: ${users} users, ${count} tickets, 2 personas.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
