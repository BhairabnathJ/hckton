/**
 * marketplace schemas — re-exported from the shared contract (structure steering).
 *
 * The Job entity, the jobs endpoint request/response schemas, the SSE payloads,
 * and the admin drop-demo response are all defined once in `@sidequest/shared`
 * (by api-contract) and reused here verbatim; this module never redefines them.
 */
export { jobsEndpoints, adminEndpoints, type Job } from "@sidequest/shared";
