import type { Request } from "express";
import type { User } from "@sidequest/shared";
import { DEFAULT_DEMO_USER_HANDLE, type SeedData } from "./seed.js";

/**
 * // MOCK: resolve the current user from the `X-Demo-User` header.
 *
 * Production replacement (architecture §7): a real auth middleware
 * (session/JWT/OAuth) resolves the current user behind this same "resolve
 * current user" seam, so routes downstream are unchanged. When the header is
 * absent the mock falls back to the default demo user; unknown handles resolve
 * to `undefined` so callers can return 401.
 */
export function resolveDemoUser(req: Request, seed: SeedData): User | undefined {
  const header = req.header("X-Demo-User");
  const handle = header && header.trim() !== "" ? header.trim() : DEFAULT_DEMO_USER_HANDLE;
  return seed.users.find((u) => u.handle === handle);
}
