# @sidequest/web

SideQuest UI — React + Vite + Tailwind v4, built against `apps/api/openapi.yaml`
with types and zod schemas from `@sidequest/shared`.

## Run

```bash
npm install                      # from the repo root (workspaces)
npm run mock -w @sidequest/api   # or: npm run dev -w @sidequest/api (core-api)
npm run dev -w @sidequest/web    # http://localhost:5173
```

Copy `.env.example` to `.env.local` to change settings:

| Var | Default | Notes |
| --- | --- | --- |
| `VITE_API_URL` | `/api` | `/api/*` is proxied to `API_PROXY_TARGET` (default `http://localhost:4000`) because the API sends no CORS headers. |
| `VITE_DEMO_USERS` | `maya,jordan,admin,ada,grace` | Handles offered in the header switcher. Ones the API answers 401 for are hidden. |
| `VITE_DEMO_COMPANY_ID` | `company_northwind` | Company the "Post a job" form posts as. |

## Routes

| Path | Screen | Endpoints |
| --- | --- | --- |
| `/` | Landing | — |
| `/login` | Demo-user picker (MOCK) | `GET /users/me` |
| `/home` | Tickets + XP | `GET /tickets` |
| `/tickets/:id` | Problem workspace | `GET /tickets/{id}`, `POST /attempts`, `POST /attempts/{id}/submit`, `GET /attempts/{id}` (polled while grading), `POST /ai/pm`, `POST /ai/coach` |
| `/jobs` | Paid job board (live) | `GET /jobs`, `POST /jobs/{id}/claim`, `POST /admin/jobs/drop-demo` (company), `GET /events` |
| `/jobs/:id` | Active job | `GET /jobs`, `POST /jobs/{id}/submit` |
| `/level-up` | XP / level celebration | `GET /users/me` |
| `/profile`, `/users/:id` | Profile + telemetry opt-in | `GET /users/me`, `GET /users/{id}`, `PATCH /users/me` |
| `/company` | Post jobs, accept submissions (company role only) | `GET /jobs`, `POST /jobs`, `POST /jobs/{id}/accept`, `GET /events` |

The `X-Demo-User` header comes from the switcher in the app header (`src/lib/demoUser.tsx`).
All requests go through `src/lib/api.ts`; errors decode the `{ error: { code, message } }` envelope.
