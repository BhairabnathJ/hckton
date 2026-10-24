/**
 * Deterministic, realistic seed data for the mock server (Requirement 5.4).
 *
 * Includes one user below the Level 6 gate (ada) and one at/above it (grace),
 * a Company, a SimCompany, three Brightline tickets at levels 1/2/3 (no
 * hiddenTestRef), one in_progress attempt, and two jobs — one `open` and one
 * `claimed` with a near-future expiry to demo claim expiry.
 */
import type {
  User,
  Company,
  SimCompany,
  Ticket,
  Attempt,
  Job,
} from "@sidequest/shared";

export interface SeedData {
  users: User[];
  companies: Company[];
  simCompanies: SimCompany[];
  tickets: Ticket[];
  attempts: Attempt[];
  jobs: Job[];
}

export const DEFAULT_DEMO_USER_HANDLE = "ada";

export function buildSeed(): SeedData {
  const users: User[] = [
    {
      id: "user_ada",
      handle: "ada",
      name: "Ada Lovelace",
      school: "Imperial College London",
      xp: 540,
      level: 3,
      rating: 4.2,
      workAuthorized: true,
      telemetryOptIn: false,
    },
    {
      id: "user_grace",
      handle: "grace",
      name: "Grace Hopper",
      school: "Vassar College",
      xp: 2210,
      level: 7,
      rating: 4.9,
      workAuthorized: true,
      telemetryOptIn: true,
    },
  ];

  const companies: Company[] = [
    { id: "company_northwind", name: "Northwind Trading", size: "mid" },
  ];

  const simCompanies: SimCompany[] = [
    {
      id: "simco_brightline",
      name: "Brightline Logistics",
      repoTemplateUrl: "https://github.com/sidequest/sim-companies-brightline",
    },
  ];

  const tickets: Ticket[] = [
    {
      id: "brightline-l1-pagination",
      simCompanyId: "simco_brightline",
      level: 1,
      title: "Fix off-by-one in GET /shipments pagination",
      description:
        "The shipments list endpoint returns one extra (or missing) row at page " +
        "boundaries. Correct the pagination offset so pages don't overlap or skip.",
      acceptanceCriteria: [
        "Page 1 and page 2 contain no overlapping shipments",
        "No shipment is skipped between consecutive pages",
      ],
      branch: "ticket/l1-pagination",
    },
    {
      id: "brightline-l2-eta-timezone",
      simCompanyId: "simco_brightline",
      level: 2,
      title: "Correct route ETA for non-UTC drivers",
      description:
        "Route ETAs are wrong by whole hours for drivers in non-UTC time zones " +
        "because the timezone conversion is dropped. Restore the conversion.",
      acceptanceCriteria: [
        "Route ETA is correct for drivers in any timezone",
        "UTC and non-UTC drivers differ only by the true offset",
      ],
      branch: "ticket/l2-eta-timezone",
    },
    {
      id: "brightline-l3-route-eta",
      simCompanyId: "simco_brightline",
      level: 3,
      title: "Add GET /routes/{id}/eta endpoint",
      description:
        "Add a new endpoint that returns an estimated time of arrival for a route " +
        "computed from its distance and average speed.",
      acceptanceCriteria: [
        "GET /routes/{id}/eta returns an ETA computed from distance / average speed",
        "Unknown route ids return a 404",
      ],
      branch: "ticket/l3-route-eta",
    },
  ];

  const attempts: Attempt[] = [
    {
      id: "attempt_ada_l1",
      userId: "user_ada",
      ticketId: "brightline-l1-pagination",
      status: "in_progress",
      prUrl: null,
      testRuns: 0,
      reviewRounds: 0,
      hintsUsed: 1,
    },
  ];

  // One open job (minLevel 6) and one already claimed by grace with a
  // near-future claimExpiresAt so the demo can show job.claim_expired.
  const soon = new Date(Date.now() + 60_000).toISOString();
  const jobs: Job[] = [
    {
      id: "job_search_relevance",
      companyId: "company_northwind",
      title: "Improve search relevance ranking",
      description:
        "Tune the product search ranking so exact-title matches outrank partial " +
        "description matches. Includes a failing test to make pass.",
      payCents: 45000,
      timeLimitHours: 48,
      minLevel: 6,
      status: "open",
      claimedByUserId: null,
      claimExpiresAt: null,
      escrowStatus: "funded",
    },
    {
      id: "job_invoice_pdf",
      companyId: "company_northwind",
      title: "Fix invoice PDF line-item totals",
      description:
        "Invoice PDFs occasionally miscompute the line-item subtotal under " +
        "discounts. Reproduce and fix.",
      payCents: 32000,
      timeLimitHours: 24,
      minLevel: 6,
      status: "claimed",
      claimedByUserId: "user_grace",
      claimExpiresAt: soon,
      escrowStatus: "funded",
    },
  ];

  return { users, companies, simCompanies, tickets, attempts, jobs };
}
