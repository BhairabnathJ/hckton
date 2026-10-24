import type { AttemptStatus, Job, JobStatus, User } from "@sidequest/shared";

/** // MOCK auth role: company accounts post and accept jobs; students claim them. */
export function isCompany(user: User | null | undefined): boolean {
  return user?.role === "company";
}

/** Students see open jobs plus jobs they claimed; companies see everything. */
export function visibleJobs(jobs: Job[], user: User | null | undefined): Job[] {
  if (isCompany(user)) return jobs;
  return jobs.filter((j) => j.status === "open" || (!!user && j.claimedByUserId === user.id));
}

/** Where a user lands after picking them in the demo switcher. */
export function homePath(user: User): string {
  return isCompany(user) ? "/company" : user.level >= LEVEL_GATE ? "/jobs" : "/home";
}

/** Level 6 unlocks the paid job board (architecture: level gate). */
export const LEVEL_GATE = 6;

/** Mirrors apps/api progression: level = floor(xp / 100) + 1. */
export const XP_PER_LEVEL = 100;
export function xpProgress(xp: number): { into: number; pct: number; toNext: number } {
  const into = xp % XP_PER_LEVEL;
  return { into, pct: Math.round((into / XP_PER_LEVEL) * 100), toNext: XP_PER_LEVEL - into };
}

export function dollars(cents: number): string {
  const whole = cents % 100 === 0;
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: whole ? 0 : 2,
  });
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function countdown(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const s = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

export type Tone = "pass" | "warn" | "err" | "run" | "claim" | "off" | "cash";

export const attemptStatusView: Record<AttemptStatus, { label: string; tone: Tone }> = {
  in_progress: { label: "In progress", tone: "off" },
  grading: { label: "Grading", tone: "run" },
  changes_requested: { label: "Changes requested", tone: "warn" },
  passed: { label: "Passed", tone: "pass" },
  abandoned: { label: "Abandoned", tone: "off" },
};

export const jobStatusView: Record<JobStatus, { label: string; tone: Tone }> = {
  open: { label: "Open", tone: "pass" },
  claimed: { label: "Claimed", tone: "claim" },
  submitted: { label: "Submitted", tone: "run" },
  accepted: { label: "Accepted", tone: "cash" },
  paid: { label: "Paid", tone: "cash" },
  expired: { label: "Expired", tone: "off" },
};

/** A GitHub pull request URL, e.g. https://github.com/org/repo/pull/12 */
export const PR_URL = /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+\/?$/;
