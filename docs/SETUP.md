# OpenTCM setup guide

This guide covers installing and running **OpenTCM — Open Test Case Manager** in
production. For day-to-day development, see [`DEVELOPMENT.md`](DEVELOPMENT.md).

> **Security — read before exposing OpenTCM to a network**
>
> OpenTCM v1.1 adds **email + password authentication** and instance-wide roles.
> Deploy on a **closed or trusted network** (VPN, office LAN, SSH tunnel). Basic
> auth is not a substitute for network isolation — do not publish OpenTCM directly
> to the public internet without additional access controls.

---

## Part A — Docker Compose quickstart (recommended)

### Prerequisites

- [Docker Engine](https://docs.docker.com/engine/install/) 24+
- [Docker Compose](https://docs.docker.com/compose/install/) v2

### 1. Clone and configure

```bash
git clone https://github.com/shanecookofficial/open-tc-manager.git
cd open-tc-manager
cp .env.example .env
```

Edit `.env` if you want non-default credentials or demo data on first boot:

| Variable            | Default                                    | Purpose                                                               |
| ------------------- | ------------------------------------------ | --------------------------------------------------------------------- |
| `POSTGRES_USER`     | `opentcm`                                  | Postgres role created by the `postgres` service                       |
| `POSTGRES_PASSWORD` | `opentcm`                                  | Postgres password (**change in production**)                          |
| `POSTGRES_DB`       | `opentcm`                                  | Database name                                                         |
| `APP_PORT`          | `3000`                                     | Host port mapped to the app container                                 |
| `OPENTCM_IMAGE`     | `ghcr.io/shanecookofficial/opentcm:latest` | Image reference (used when not building locally)                      |
| `SEED_DEMO_DATA`    | `false`                                    | Set to `true` on **first boot only** to load the WEB/API demo dataset |
| `BOOTSTRAP_ADMIN_EMAIL` | unset (optional)                         | First Admin email when `users` is empty (see §8)                      |
| `BOOTSTRAP_ADMIN_PASSWORD` | unset (optional)                      | First Admin password (unset after first boot in production)           |
| `HTTPS`             | `false`                                    | Set `true` when served over HTTPS (Secure session cookie)             |

`docker-compose.prod.yml` reads these variables from `.env` in the project directory
(Compose loads `.env` automatically). It **constructs** `DATABASE_URL` for the app
container from `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB`. Changing the
`DATABASE_URL=` line in `.env` has **no effect** on this stack.

The Compose volume key is `postgres_data` (Docker names it
`<project-directory>_postgres_data`).

### 2. Start the stack

Build from source (first run or after pulling code changes):

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Or pull a published release image (after the maintainer pushes git tag `v0.1.0`;
the Docker workflow then publishes `ghcr.io/shanecookofficial/opentcm:latest` and
`:v0.1.0` — until that tag exists, pull will fail and you should build from
source instead):

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

Open **http://localhost:3000** (or `http://localhost:<APP_PORT>` if you changed it).

You will be redirected to **Sign in**. Use the bootstrap Admin from §8, a user
created by `npm run db:seed`, or an account your Admin provisioned.

If you did **not** seed demo data, after sign-in the home URL shows **Create your
first project** (Admins only). If you seeded, it redirects into the first project.

The `app` service waits until Postgres passes its healthcheck
(`pg_isready` on the `postgres` service), then the entrypoint:

1. Runs database migrations (`scripts/migrate.mjs`).
2. Optionally seeds demo data when `SEED_DEMO_DATA=true` (exact string `true`).
3. Starts the Next.js standalone server on container port 3000
   (`node server.js`, healthcheck `GET /api/v1/health`).

### 3. Enable demo data on first boot

In `.env`:

```
SEED_DEMO_DATA=true
```

Bring the stack up, or recreate the **app** container once so the entrypoint runs
with the new value:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

The seed is **idempotent for rows that still exist** (upsert by project prefix and
case number). Safe to run twice on an empty-of-demo database. **Do not leave
`SEED_DEMO_DATA=true` after first boot:** a later restart will recreate demo cases
you permanently deleted. Set it back to `false` and recreate the app container:

```bash
# in .env: SEED_DEMO_DATA=false
docker compose -f docker-compose.prod.yml up -d
```

Demo projects: **Web App** (`WEB`) and **Payments API** (`API`).

### 4. Verify health

```bash
curl -s http://localhost:3000/api/v1/health
```

Expected: `{"status":"ok","database":"connected"}`

If you seeded:

```bash
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/p/WEB
# HTTP 200
```

If you skipped seed, `/p/WEB` is **HTTP 404**. Open http://localhost:3000 and use
**Create your first project** instead.

### 5. Upgrade to a new release

Building from source:

```bash
cd open-tc-manager
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Using a published GHCR image:

```bash
cd open-tc-manager
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

Migrations run automatically every time the app container starts. Postgres data
persists in the `postgres_data` Docker volume across restarts and upgrades.

### 6. Backup and restore (Postgres volume)

**Backup** (while the stack is running). `--clean --if-exists` is required so a
later restore can replace an existing schema (plain `pg_dump` restore fails with
`schema "drizzle" already exists`):

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U opentcm -d opentcm --no-owner --no-acl --clean --if-exists \
  > opentcm-backup-$(date +%Y%m%d).sql
```

Adjust `-U` / `-d` if you changed `POSTGRES_USER` or `POSTGRES_DB` in `.env`.
The Compose service name is `postgres` (not `db`).

**Restore** (destructive — replaces all data in that database):

```bash
# Stop the app so nothing writes during restore
docker compose -f docker-compose.prod.yml stop app

docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U opentcm -d opentcm -v ON_ERROR_STOP=1 \
  < opentcm-backup-YYYYMMDD.sql

docker compose -f docker-compose.prod.yml start app
```

These commands restore into the **existing** `opentcm` database. That works when
the dump was taken with `--clean --if-exists`. They do not drop/recreate the
database or the `postgres_data` volume.

For a full disaster-recovery rebuild: `docker compose -f docker-compose.prod.yml down`
(keeps the volume), restore as above; or `down -v` (destroys data), start Postgres
again, then restore into the empty database.

### 7. Stop and remove

```bash
# Stop containers, keep data volume
docker compose -f docker-compose.prod.yml down

# Stop containers AND delete the Postgres volume (destroys all data)
docker compose -f docker-compose.prod.yml down -v
```

---

## Part B — Manual install with your own PostgreSQL

Use this path when you run Postgres yourself (bare metal, managed cloud, or an
existing cluster) and want to run the Node.js app directly on a host.

### 1. Install PostgreSQL 16

Skip this section if `psql --version` already reports **16.x** and the server is
accepting connections (`pg_isready`). Creating the role in step 2 is still required.

Official installation guides:

- [PostgreSQL download page](https://www.postgresql.org/download/) — pick your OS.
- [Ubuntu packages](https://www.postgresql.org/download/linux/ubuntu/)

**Ubuntu 24.04 (Noble):** `postgresql-16` is in the default archives.

```bash
sudo apt-get update
sudo apt-get install -y postgresql-16 postgresql-client-16
sudo systemctl enable --now postgresql
```

**Ubuntu 22.04 (Jammy):** the default archives ship PostgreSQL **14**, not 16.
Add [PostgreSQL's apt repository](https://www.postgresql.org/download/linux/ubuntu/)
first, then install `postgresql-16` / `postgresql-client-16` as above. Installing
the metapackage `postgresql` on 22.04 gives you 14 and is **not** sufficient.

If `systemctl` fails (containers, some WSL setups, hosts without systemd as PID 1),
start Postgres with your platform's equivalent and skip `enable --now`. Verify with
`pg_isready` and `psql --version`.

Verify:

```bash
psql --version
# psql (PostgreSQL) 16.x
```

### 2. Create database and role

The copy-paste block below uses role/database name `opentcm`. **If a local OpenTCM
dev install already created that role or database**, the statements fail with
`already exists` — that is expected. Either drop them (destructive) or pick
different names and substitute them in `DATABASE_URL` in step 4.

```bash
# Destructive reset if you are replacing a leftover dev database:
# sudo -u postgres psql -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS opentcm;"
# sudo -u postgres psql -v ON_ERROR_STOP=1 -c "DROP ROLE IF EXISTS opentcm;"
```

Connect as the Postgres superuser and run this block **verbatim** (change the
password before production; the password must match `DATABASE_URL` in step 4):

```bash
sudo -u postgres psql -v ON_ERROR_STOP=1 <<'SQL'
CREATE USER opentcm WITH PASSWORD 'change-me-in-production';
CREATE DATABASE opentcm OWNER opentcm;
GRANT ALL PRIVILEGES ON DATABASE opentcm TO opentcm;
SQL
```

`CREATE DATABASE ... OWNER opentcm` is what grants schema rights on PostgreSQL 15+.
The `GRANT ALL PRIVILEGES ON DATABASE` line is extra and does not replace ownership.

### 3. Install Node.js 22 and clone OpenTCM

Skip the NodeSource install if `node -v` already reports **v22**.

```bash
# Node 22 — see https://nodejs.org/ if you need another install method
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

git clone https://github.com/shanecookofficial/open-tc-manager.git
cd open-tc-manager
```

### 4. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set `DATABASE_URL`. The example file defaults to password
`opentcm` (dev Compose); **replace it** with the password from step 2 or
authentication will fail.

Format, field by field:

```
postgresql://<user>:<password>@<host>:<port>/<database>
             │      │           │      │      └── database name (opentcm)
             │      │           │      └── port (5432)
             │      │           └── hostname (localhost, or remote host)
             │      └── password for the role
             └── Postgres role name (opentcm)
```

Example for local Postgres with the role created above:

```
DATABASE_URL=postgresql://opentcm:change-me-in-production@localhost:5432/opentcm
```

`db:migrate:prod`, `db:seed`, and `start:standalone` load this file from the
repository root. You do **not** need to `export DATABASE_URL` in the shell for
those npm scripts. URL-encode reserved characters in the password (`@`, `:`, `/`,
`%`, `#`).

### 5. Install dependencies, migrate, and build

```bash
npm ci
npm run db:migrate:prod
```

`db:migrate:prod` uses `scripts/migrate.mjs` (drizzle-orm migrator). It does **not**
require `drizzle-kit`, which is a development-only tool.

Optional demo data (idempotent; safe to run twice):

```bash
npm run db:seed
```

If you skip seed, the UI shows **Create your first project** at
http://localhost:3000 after you start the server. `/p/WEB` will 404 until you
create a project with that prefix or run the seed.

Production build:

```bash
npm run build
```

This produces a Next.js **standalone** output under `.next/standalone/`. The home
page is rendered at **request** time (not frozen at build time), so seeding before
or after `build` both work.

### 6. Run the production server

**Recommended (matches the Docker image runtime):**

```bash
npm run start:standalone
```

`start:standalone` copies static assets into the standalone bundle and runs
`node .next/standalone/server.js` with `HOSTNAME=0.0.0.0` and `PORT=3000`.
It also loads `DATABASE_URL` from `.env`. This is the correct production command;
`node .next/standalone/server.js` by itself is missing static files.

Open **http://localhost:3000**.

`npm run start` (`next start`) is **not** a supported production command in this
repo: `next.config.ts` sets `output: "standalone"`, and Next.js will warn that
`next start` does not work with that setting. Use `start:standalone`.

### 7. Verify

```bash
curl -s http://localhost:3000/api/v1/health
# {"status":"ok","database":"connected"}
```

If you ran `db:seed`:

```bash
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/p/WEB
# HTTP 200
```

If you skipped seed, that `/p/WEB` check returns **HTTP 404**. Confirm instead:

```bash
curl -s http://localhost:3000/api/v1/projects
# {"items":[]}
```

and that the browser shows **Create your first project**.

### 8. Upgrade (manual install)

```bash
cd open-tc-manager
git pull
npm ci
npm run db:migrate:prod
npm run build
# restart your process manager / systemd unit running start:standalone
```

### 9. Backup and restore (manual Postgres)

Load `DATABASE_URL` from `.env` in this shell, then dump with `--clean --if-exists`
so restore can replace an existing schema:

```bash
set -a
source .env
set +a

pg_dump "$DATABASE_URL" --no-owner --no-acl --clean --if-exists \
  > opentcm-backup-$(date +%Y%m%d).sql
```

**Restore** (stop the OpenTCM process first to avoid concurrent writes):

```bash
set -a
source .env
set +a

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 < opentcm-backup-YYYYMMDD.sql
```

A dump **without** `--clean --if-exists` cannot be restored on top of a database
that already has OpenTCM tables (`ERROR: schema "drizzle" already exists`).

---

## Troubleshooting

| Symptom                                              | Fix                                                                                                                                                                                       |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL is not set`                            | Put `DATABASE_URL` in `.env` at the repo root (migrate/seed/standalone load it) or export it in the shell.                                                                                |
| App starts but health shows database error           | Check Postgres is running, credentials match the role password (not the leftover `.env.example` value `opentcm` unless that is what you created), and migrations ran (`db:migrate:prod`). |
| `role "opentcm" already exists`                      | Leftover dev database. Drop and recreate (step 2) or substitute different names.                                                                                                          |
| Port 3000 in use                                     | Set `PORT=3001` (and `APP_PORT=3001` in Compose `.env`).                                                                                                                                  |
| Docker app exits immediately                         | `docker compose -f docker-compose.prod.yml logs app` — usually migration failure or bad `DATABASE_URL`.                                                                                   |
| Blank styles in standalone mode                      | Use `npm run start:standalone` (copies `.next/static`); do not run `server.js` without static assets.                                                                                     |
| `/p/WEB` is 404                                      | Seed was skipped (or prefix is not `WEB`). Open `/` and create a project, or run `npm run db:seed`.                                                                                       |
| `systemctl: System has not been booted with systemd` | Start Postgres without systemd; the packages can still be installed.                                                                                                                      |

---

## Part C — First Admin, sign-in, and users (v1.1)

### Bootstrap Admin (empty database)

When the `users` table is empty, OpenTCM can create one Admin from environment
variables (also used by Docker / `start:standalone` on boot):

```
BOOTSTRAP_ADMIN_EMAIL=ada@opentcm.local
BOOTSTRAP_ADMIN_PASSWORD=change-me-in-production
```

Bootstrap runs once — if **any** user already exists (seed, prior bootstrap, or
manual insert), it is a no-op. You may unset `BOOTSTRAP_ADMIN_PASSWORD` after
first boot; leaving it set does not create a duplicate Admin.

### Demo users from seed (development / e2e)

`npm run db:seed` (and `SEED_DEMO_DATA` in Docker) also provisions demo accounts
when appropriate:

| When | Users created |
| --- | --- |
| `users` table empty | Admin, Member, Viewer (documented passwords in `DEVELOPMENT.md`) |
| Demo emails missing | Each of `admin@`, `member@`, `viewer@` inserted when absent — never overwrites |

### Sign in

1. Open `/login` (unauthenticated visits to any other page redirect here).
2. Enter email and password.
3. After success you land on the repository (or the `next=` path you requested).

Admins open **Users** in the header to create Member/Viewer accounts and manage
roles. See [`USER_GUIDE.md`](USER_GUIDE.md) for roles and case history.

---

## Related docs

- [`DEVELOPMENT.md`](DEVELOPMENT.md) — local dev with hot reload
- [`USER_GUIDE.md`](USER_GUIDE.md) — using the application
- [`API.md`](API.md) — HTTP API reference
