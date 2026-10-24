/**
 * PrismaClient singleton for the core-api process.
 *
 * The only component with a read/write connection to SQLite (architecture §1).
 * A single instance is shared across modules to avoid exhausting connections.
 *
 * `loadEnv()` runs first so DATABASE_URL (defaulted in code when `.env` omits
 * it) is present before the client is constructed.
 */
import { PrismaClient } from "@prisma/client";
import { loadEnv } from "./env.js";

loadEnv();

export const prisma = new PrismaClient();
