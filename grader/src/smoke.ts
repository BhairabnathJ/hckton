/**
 * Grader smoke test (Requirement 10).
 *
 * Grades a real PR against the L1 ticket (brightline-l1-pagination) and prints
 * the full GradeResult. Honors GRADER_RUNNER and LLM_PROVIDER so it runs with
 * the subprocess runner and/or the mock LLM when Docker or a live LLM is
 * unavailable. Exits non-zero if the pipeline errors before producing a result.
 *
 *   PR_URL=https://github.com/OWNER/REPO/pull/N npm run smoke -w @sidequest/grader
 *   # or:  npm run smoke -w @sidequest/grader -- <PR_URL> [attemptId]
 */
import { grade } from "./grade.js";
import { loadDotenv } from "./config.js";

const L1_TICKET = "brightline-l1-pagination";

async function main() {
  loadDotenv();
  const argUrl = process.argv[2];
  const prUrl = argUrl ?? process.env.PR_URL;
  const attemptId = process.argv[3] ?? process.env.ATTEMPT_ID ?? "smoke-attempt";

  if (!prUrl) {
    console.error(
      "Usage: provide a PR URL via arg or PR_URL env.\n" +
        "  PR_URL=https://github.com/OWNER/REPO/pull/N npm run smoke -w @sidequest/grader",
    );
    process.exit(2);
  }

  console.log(`Grading PR against ticket ${L1_TICKET}`);
  console.log(`  PR:            ${prUrl}`);
  console.log(`  GRADER_RUNNER: ${process.env.GRADER_RUNNER ?? "subprocess (default)"}`);
  console.log(`  LLM_PROVIDER:  ${process.env.LLM_PROVIDER ?? "gemini (default)"}`);
  console.log("");

  const result = await grade({ attemptId, ticketId: L1_TICKET, prUrl });

  console.log("=== GradeResult ===");
  console.log(JSON.stringify(result, null, 2));
  console.log("");
  console.log(
    `passed=${result.passed}  testsPassed=${result.testsPassed}  ` +
      `testsFailed=${result.testsFailed}  verdict=${result.verdict}`,
  );
  console.log(`reviewCommentUrl: ${result.reviewCommentUrl ?? "(none posted)"}`);
}

main().catch((err) => {
  console.error(`\n=== SMOKE FAILED: ${(err as Error).message} ===`);
  process.exit(1);
});
