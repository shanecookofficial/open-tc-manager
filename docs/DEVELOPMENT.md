# Local development

This guide covers running OpenTCM locally. PostgreSQL is **not** started by
Docker — you provide a PostgreSQL 16+ instance and enter the connectors in
`.env`. Docker (optional) runs only the website.

## Prerequisites

- **Node.js 22+** and **npm 10+** (see `engines` in `package.json`).
- **Git** clone of this repository.
- **PostgreSQL 16+** that you operate (local install, org server, or managed).

For the Docker app path you also need **Docker** and **Docker Compose v2**.

## Configure connectors

```bash
cp .env.example .env
```

Enter either discrete fields or `DATABASE_URL` (`DATABASE_URL` wins if both are
set):

```
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=opentcm
POSTGRES_PASSWORD=opentcm
POSTGRES_DB=opentcm
```

Create the role and database if they do not exist (superuser):

```sql
CREATE USER opentcm WITH PASSWORD 'opentcm';
CREATE DATABASE opentcm OWNER opentcm;
GRANT ALL PRIVILEGES ON DATABASE opentcm TO opentcm;
```

If the website runs **in Docker** and Postgres is on **this machine**, set
`POSTGRES_HOST=host.docker.internal`. `localhost` inside the container is the
container, not the host.

## Quick start with Docker Compose (website only)

```bash
docker compose up --remove-orphans
```

Wait until `docker compose logs app` shows Next.js Ready (`npm ci` and
migrations finished). You do **not** need `db:seed`. A new database gets one
Admin and no projects or cases.

- **App:** http://localhost:3000 — sign in as `admin@opentcm.io` /
  `opentcm-admin`. The first sign-in asks you to **create your admin account**
  (new email and password). Then **Create your first project**. OpenTCM
  requires authentication (closed/trusted networks). Override
  `BOOTSTRAP_ADMIN_*` in `.env` if you want a different temporary Admin;
  Compose forwards those into the `app` service.

`--remove-orphans` drops a leftover Compose `postgres` container from older
revisions of this file. Your database is whatever you pointed the connectors
at — `docker compose down` does not delete it.

Optional WEB/API demo data:

```bash
docker compose exec app npm run db:seed
```

To run commands inside the app container:

```bash
docker compose exec app npm run lint
```

Stop the website:

```bash
docker compose down
```

## Run the Next.js dev server on the host

```bash
npm ci
npm run db:migrate
npm run dev
```

Open http://localhost:3000.

Sign in as `admin@opentcm.io` / `opentcm-admin` on a new database
(`NODE_ENV=development` creates that Admin when `users` is empty), then
create your real admin account when prompted. `npm run db:seed` is optional.

Use `POSTGRES_HOST=localhost` (or `DATABASE_URL` with `localhost`) when the
dev server is not in Docker.

## Seeding

`npm run db:seed` loads demo data for local development and API walkthroughs. It is
**idempotent** — safe to run after every migration or whenever you want a known
dataset without wiping the database.

The script inserts (or reuses) two projects — **Web App** (`WEB`) and **Payments API**
(`API`) — with the same names, prefixes, directory tree, and markdown-rich test cases
as `src/lib/contracts/fixtures.ts`. Database ids differ from fixture ids; match rows by
`prefix` and `displayNumber` (e.g. `WEB-11`).

A new **development** instance does **not** run this script. First boot
creates `admin@opentcm.io` / `opentcm-admin` and leaves projects empty.
Seed is optional when you want the WEB/API walkthrough dataset.

It also inserts **demo users** when those emails are missing:

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

Requires configured connectors (see `.env.example`) and an applied migration
(`npm run db:migrate`).

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
| `npm run test:integration` | API integration tests against live Postgres (connectors, migrated)                   |
| `npm run test:e2e`         | Playwright (seeds, production build, standalone server)                              |
| `npm run db:generate`      | Generate a SQL migration from `src/lib/db/schema.ts`                                 |
| `npm run db:migrate`       | Apply pending migrations (drizzle-kit)                                               |
| `npm run db:migrate:prod`  | Apply migrations with `scripts/migrate.mjs` (no drizzle-kit)                         |
| `npm run db:seed`          | Idempotent demo seed (WEB + API projects, markdown cases)                            |

## Troubleshooting

- **`connection refused` from the Docker app:** You pointed connectors at
  `localhost`. Use `host.docker.internal` when Postgres is on the Docker host.
  Confirm `listen_addresses` and `pg_hba.conf` allow that client.
- **Port 3000 already in use:** Run `npm run dev -- --port 3001` (or set the port
  in the compose `command` for the app service).
- **`.env` not loaded:** Next.js loads `.env` automatically for local development.
  Ensure the file exists at the repository root and is not committed (it is
  listed in `.gitignore`).
- **`tsx: not found` on `docker compose exec app npm run db:seed`:** Compose
  keeps `node_modules` in a named volume and runs `npm ci` on startup. Seed
  before that finishes, or with a stale volume, cannot see `tsx`. Wait until
  the app logs show Ready, then `docker compose exec app npm ci` and seed
  again. To reset the volume: `docker compose down` and
  `docker volume rm open-tc-manager_app_node_modules`, then `docker compose up`.
