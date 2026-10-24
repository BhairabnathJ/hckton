/**
 * core-api dev entrypoint (`npm run dev`).
 *
 * Loads env (defaulting DATABASE_URL), verifies the selected providers'
 * credentials are present (naming any missing var without printing it, §6),
 * and starts the Express app.
 */
import { loadEnv, assertCredentials } from "./env.js";
import { createApp } from "./app.js";

const env = loadEnv();

// Verify the reviewer provider's credentials early. GitHub is required to grade
// a real PR; the grader also checks it, but we surface it up front.
const requireGithub = (process.env.GRADER_RUNNER ?? "subprocess").trim().toLowerCase() !== "demo";
try {
  assertCredentials(env, { requireGithub });
} catch (err) {
  console.error(`[startup] ${(err as Error).message}`);
  process.exit(1);
}

const app = createApp();
app.listen(env.port, () => {
  console.log(`core-api listening on http://localhost:${env.port}`);
  console.log(`  LLM_PROVIDER=${env.llmProvider}  GRADER_RUNNER=${env.graderRunner}`);
});
