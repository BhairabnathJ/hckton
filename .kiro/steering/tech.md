# Tech

## Backend

- Node 20, Express, TypeScript.
- Prisma with SQLite (Postgres later).
- zod for validation.

## Grader

- Runs student code in Docker (`python:3.12-slim`).
- Sandbox: `--network none`, 512MB memory limit, 1 CPU, 60s timeout.

## LLM

- Amazon Bedrock behind a single `LLMProvider` interface.

## GitHub

- Octokit with a personal access token from env.

## Mocks

- auth (a demo-user header, `X-Demo-User`)
- Stripe escrow
- payouts

Mark all mocks with `// MOCK` comments.

## Conventions

- Services contain the business logic; routes stay thin.
- Every endpoint is validated with zod.
- Errors use the format `{ error: { code, message } }`.
