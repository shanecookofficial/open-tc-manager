# Local development

This guide covers two ways to run OpenTCM locally during development. Both paths
use the same environment variables; only how Postgres is started differs.

## Prerequisites

- **Node.js 22+** and **npm 10+** (see `engines` in `package.json`).
- **Git** clone of this repository.

For the Docker path you also need **Docker** and **Docker Compose v2**.

For the bring-your-own Postgres path you need a **PostgreSQL 16+** server.

## Quick start with Docker Compose

The `docker-compose.yml` file starts PostgreSQL 16 and the Next.js dev server:

```bash
cp .env.example .env   # optional on first run; compose sets DATABASE_URL for the app container
docker compose up
```

On the **first run**, once both containers are up, apply migrations (and optionally
load the demo data) from a second terminal — the dev stack does not run them for you:

```bash
docker compose exec app npm run db:migrate
docker compose exec app npm run db:seed   # optional: WEB/API demo data
```

- **App:** http://localhost:3000 — sign in with a seeded or bootstrap Admin, then
  land in the demo project or the "create your first project" screen (Admins).
  OpenTCM requires authentication (closed/trusted networks). `BOOTSTRAP_ADMIN_*`
  in `.env` is forwarded into the Compose `app` service.
- **Postgres:** `localhost:5432`, user/password/database `opentcm` / `opentcm` / `opentcm`.

The `app` service waits for Postgres to pass its healthcheck before starting.
Data persists in the `postgres_data` Docker volume.

To run commands inside the app container:

```bash
docker compose exec app npm run lint
```

Stop and remove containers (data volume is kept):

```bash
docker compose down
```

## Bring your own PostgreSQL

Use this path when you already have Postgres installed or prefer not to use Docker.

### 1. Create database and role

Connect as a superuser and run:

```sql
CREATE USER opentcm WITH PASSWORD 'opentcm';
CREATE DATABASE opentcm OWNER opentcm;
GRANT ALL PRIVILEGES ON DATABASE opentcm TO opentcm;
```

Adjust the username, password, and database name if your environment requires it.

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` so `DATABASE_URL` points at your instance, for example:

```
DATABASE_URL=postgresql://opentcm:opentcm@localhost:5432/opentcm
```

The URL format is:

```
postgresql://<user>:<password>@<host>:<port>/<database>
```

### 3. Install dependencies and run the dev server

```bash
npm ci
npm run dev
```

Open http://localhost:3000.

After `npm ci`, apply migrations before running anything that talks to Postgres:

```bash
npm run db:migrate
npm run db:seed
```

## Seeding

`npm run db:seed` loads demo data for local development and API walkthroughs. It is
**idempotent** — safe to run after every migration or whenever you want a known
dataset without wiping the database.

The script inserts (or reuses) two projects — **Web App** (`WEB`) and **Payments API**
(`API`) — with the same names, prefixes, directory tree, and markdown-rich test cases
as `src/lib/contracts/fixtures.ts`. Database ids differ from fixture ids; match rows by
`prefix` and `displayNumber` (e.g. `WEB-11`).

It also seeds **demo users** when the `users` table is empty:

| Email | Role | Password (dev only) |
| --- | --- | --- |
| `admin@opentcm.local` | Admin | `opentcm-admin` |
| `member@opentcm.local` | Member | `opentcm-member` |
| `viewer@opentcm.local` | Viewer | `opentcm-viewer` |

If bootstrap or another process already created a different Admin (e.g.
`it-admin@opentcm.local` from integration tests), seed still adds
`admin@opentcm.local` when that email is missing. It never overwrites existing
rows or creates duplicate emails.

**Strategy:** projects are keyed by `prefix`; directories by
`(project_id, parent_id, name)`; test cases by `(project_id, case_number)`. A second run
skips existing rows and leaves row counts unchanged. `next_case_number` is synced to
`max(case_number) + 1` per project after seeding.

Requires `DATABASE_URL` (see `.env.example`) and an applied migration (`npm run db:migrate`).

```bash
npm run db:seed
```

Spot-check:

```bash
psql "$DATABASE_URL" -c "SELECT prefix, next_case_number FROM projects ORDER BY prefix"
psql "$DATABASE_URL" -c "SELECT count(*) FROM test_cases"
```

## npm scripts

| Script                     | Purpose                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------ |
| `npm run dev`              | Start Next.js in development mode                                                    |
| `npm run build`            | Production build (standalone output)                                                 |
| `npm run start:standalone` | Serve that build (`HOSTNAME=0.0.0.0`, copies static assets)                          |
| `npm run start`            | `next start` — **not** supported with `output: "standalone"`; use `start:standalone` |
| `npm run lint`             | ESLint                                                                               |
| `npm run typecheck`        | TypeScript (`tsc --noEmit`)                                                          |
| `npm run test`             | Vitest unit tests (does not require Postgres)                                        |
| `npm run test:integration` | API integration tests against live Postgres (`DATABASE_URL`, migrated)               |
| `npm run test:e2e`         | Playwright (seeds, production build, standalone server)                              |
| `npm run db:generate`      | Generate a SQL migration from `src/lib/db/schema.ts`                                 |
| `npm run db:migrate`       | Apply pending migrations to `DATABASE_URL` (drizzle-kit)                             |
| `npm run db:migrate:prod`  | Apply migrations with `scripts/migrate.mjs` (no drizzle-kit)                         |
| `npm run db:seed`          | Idempotent demo seed (WEB + API projects, markdown cases)                            |

## Troubleshooting

- **Port 5432 already in use:** Stop the other Postgres instance or change the
  published port in `docker-compose.yml` and update `DATABASE_URL` accordingly.
- **Port 3000 already in use:** Run `npm run dev -- --port 3001` (or set the port
  in the compose `command` for the app service).
- **`.env` not loaded:** Next.js loads `.env` automatically for local development.
  Ensure the file exists at the repository root and is not committed (it is
  listed in `.gitignore`).
