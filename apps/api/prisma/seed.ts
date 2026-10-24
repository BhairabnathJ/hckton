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
      role: "student",
    },
    update: { name: "Maya Chen", school: "UMass Amherst", xp: 0, level: 1, role: "student" },
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
      role: "student",
    },
    update: {
      name: "Jordan Okafor",
      school: "Northeastern",
      xp: 550,
      level: 6,
      rating: 4.8,
      workAuthorized: true,
      role: "student",
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
      role: "company",
    },
    update: { name: "SideQuest Admin", role: "company" },
  });

  // Tickets from the server-only hidden manifest (Brightline SimCompany).
  const { count } = await reloadTickets();

  // Marketplace: one Company + two open jobs (minLevel 6) so a Level 6 user
  // (Jordan) can claim a live job in the demo. Reset for determinism.
  await prisma.job.deleteMany();
  await prisma.company.deleteMany();
  const company = await prisma.company.create({
    data: { id: "company_northwind", name: "Northwind Logistics", size: "51-200" },
  });
  await prisma.job.create({
    data: {
      companyId: company.id,
      title: "Harden the shipments pagination endpoint",
      description: "Production pagination drops rows under load; make it correct and covered.",
      payCents: 9000, // $90
      timeLimitHours: 6,
      minLevel: 6,
      status: "open",
      escrowStatus: "funded", // // MOCK
    },
  });
  await prisma.job.create({
    data: {
      companyId: company.id,
      title: "Add route ETA caching",
      description: "Add a short-lived cache in front of the ETA computation.",
      payCents: 12000, // $120
      timeLimitHours: 8,
      minLevel: 6,
      status: "open",
      escrowStatus: "funded", // // MOCK
    },
  });

  const users = await prisma.user.count();
  const jobs = await prisma.job.count();
  console.log(`Seed complete: ${users} users, ${count} tickets, 2 personas, 1 company, ${jobs} jobs.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
