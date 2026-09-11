# TMS Bakım Takip — standalone backend

A self-contained Express + MongoDB backend for this frontend. It is **not**
related to the API in the app's `.env`: nothing here reads it, calls it, or
copies its data. Point the frontend at this server and it runs on its own.

## Running it

```bash
cd server
cp .env.example .env          # adjust MONGODB_URI if needed
npm install
npm run seed                  # fills an empty database (safe to re-run)
npm run dev                   # http://localhost:5050
```

Then, in the app's own `.env` at the repo root:

```
API_URL = "http://localhost:5050"
```

and restart `npm run dev` for the frontend.

Seeded accounts:

| email | password | role |
|---|---|---|
| `admin@tms.local` | `Admin123!` | Yönetici — every permission, sees every page |
| `operator@tms.local` | `Operator123!` | Operatör — read/write on processes only |

The operator account is worth logging in as once: the "Yeni Süreç" button is
gated on `activeProcess:manage`, so it disappears for that role. That is the
frontend's own rule, reproduced here rather than worked around.

## What it implements

Every endpoint `src/consts/endpoints.ts` names, with the response shapes
`src/api/handlers/*` expects — including the inconsistent ones, which are
deliberate:

- **Wrapped lists** (`{ count, <key> }`): `/api/projects`, `/api/stages`,
  `/api/substages`, `/api/materials`, `/api/wagons`, `/api/train-types`,
  `/api/trains/with-processes`, `/api/processes/search`
- **Bare arrays**: `/api/trains`, `/api/favorite-processes`, `/api/reasons`,
  `/api/roles`, `/api/processes` (when filtered by project/status)
- **Paged envelope** (`{ pageNumber, pageSize, totalCount, totalPages, data }`):
  any of the above called with `pageNumber`/`pageSize`, plus `/api/users`

`/api/processes` is the sharp edge: the same URL answers a bare array, a
`{ processes }` object, or the paged envelope depending on which query
parameters arrive, because three different frontend handlers read it.

### Auth

- `POST /auth` → `{ accessToken }` and sets the `jwt` httpOnly refresh cookie.
- `GET /refresh` → a fresh access token from that cookie.
- `POST /logout` clears it.
- The access token carries `UserInfo.role.permissions`, which the frontend
  decodes straight out of the JWT — the sidebar and every `RoleWrapper` read it.
- An expired access token answers **403**, not 401: `axiosInstance` refreshes
  and retries on both, and the app was written against that behaviour.
- Everything under `/api` requires a token. There is no anonymous read.

### Train types and project plans

Two things the old API did not have, added here because the frontend now
expects them:

- `GET|POST /api/train-types`, `GET|PUT|DELETE /api/train-types/:id` — a type
  owns an **ordered** wagon list, and trains reference a type. Order matters: a
  plan refers to a wagon by its position in the set.
- A project can carry a **plan** (what the setup wizard posts): its train type,
  trains, wagons, the jobs with `scope: "TRAIN" | "WAGON"`, per-`(train, wagon)`
  exclusions, and materials. `GET /api/projects/:id/progress` derives the target
  from that plan instead of the typed `totalTrainCount × totalSubStagePerTrain`,
  which is the arrangement the plan replaces. A project without a plan still
  falls back to the two numbers.

### Duplicate jobs

`POST /api/processes/start` refuses a second live process for the same
`(project, train, wagon, workflow)`, enforced by a partial unique index as well
as the check. Deleting a process frees the slot — which is how a failed job is
repeated, rather than a separate "rework" concept.

## Layout

```
src/
  app.js index.js config.js db.js
  models/index.js          all schemas
  middleware/auth.js       JWT signing, the /api guard
  lib/http.js              paging, list envelopes, error types
  lib/serialize.js         document -> the exact shape the frontend reads
  lib/progress.js          plan -> targets, completion, per-train rows
  routes/auth.js           /auth /refresh /logout /register, password reset
  routes/catalog.js        materials, sub-stages, stages, reasons, roles,
                           workflows, users
  routes/fleet.js          wagons, train types, trains, trains/with-processes
  routes/projects.js       projects + progress
  routes/processes.js      processes, stages, sub-stages, statistics
  seed.js
```

## Known gaps

- Images on a sub-stage are stored as strings; there is no upload endpoint.
- `/api/processes/statistics` returns a simple per-stage tally. The statistics
  page is commented out of the sidebar, so nothing consumes it yet.
- No rate limiting, and the reset code is written to the server log instead of
  being emailed. Both are fine for development and not for anything else.
