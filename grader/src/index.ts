/**
 * @sidequest/grader — build-plan spec #3.
 *
 * Grades a submission: clone the PR, inject the ticket's hidden tests, run
 * pytest in a sandbox (subprocess default, docker optional), parse results,
 * generate a senior-engineer AI review via the LLMProvider seam, post it on the
 * PR, and return a GradeResult. No DB access (architecture §2).
 */
export * from "./types.js";
export { grade } from "./grade.js";
export { createSandboxRunner } from "./runners/index.js";
export { loadTicket, copyHiddenTests, type Ticket } from "./tickets.js";
export { review, parseVerdict } from "./reviewer.js";
