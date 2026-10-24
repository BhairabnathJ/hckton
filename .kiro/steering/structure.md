# Structure

- `/apps/api`: Express API. Feature modules go in `src/modules/<name>/` with `routes.ts`, `service.ts`, `schema.ts`.
- `/apps/web`: UI, built separately against the contract.
- `/packages/shared`: zod schemas and types shared by API and web.
- `/sim-companies/brightline`: the student-facing repo template. It contains NO hidden tests.
- `/sim-companies/brightline-hidden`: hidden tests and ticket definitions. Server-only, never exposed.
- `/grader`: the Docker runner and the reviewer.
