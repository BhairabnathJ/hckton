import { z } from "zod";
import { user } from "../entities/user.js";

/** GET /users/me — the current user (resolved from X-Demo-User). */
export const getMeResponse = user;

/** GET /users/:id — a user's public profile. */
export const getUserResponse = user;

/** PATCH /users/me — toggle the telemetry opt-in (conflict C4). */
export const updateOptInRequest = z.object({ telemetryOptIn: z.boolean() });
export const updateOptInResponse = user;

export type UpdateOptInRequest = z.infer<typeof updateOptInRequest>;
