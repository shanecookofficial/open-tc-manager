# OpenTCM setup guide

This guide covers installing and running **OpenTCM — Open Test Case Manager** in
production. For day-to-day development, see [`DEVELOPMENT.md`](DEVELOPMENT.md).

> **Security — read before exposing OpenTCM to a network**
>
> OpenTCM v1 has **no authentication or authorization**. Anyone who can reach the web
> UI or API can read, create, edit, and delete all projects and test cases. Deploy only
> on a **closed or trusted network** (VPN, office LAN, SSH tunnel). Do not publish
> OpenTCM directly to the public internet without adding your own access controls.

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

| Variable | Default | Purpose |
| --- | --- | --- |
| `POSTGRES_USER` | `opentcm` | Postgres role created by the `postgres` service |
| `POSTGRES_PASSWORD` | `opentcm` | Postgres password (**change in production**) |
| `POSTGRES_DB` | `opentcm` | Database name |
| `APP_PORT` | `3000` | Host port mapped to the app container |
| `OPENTCM_IMAGE` | `ghcr.io/shanecookofficial/opentcm:latest` | Image reference (used when not building locally) |
| `SEED_DEMO_DATA` | `false` | Set to `true` on **first boot** to load the WEB/API demo dataset |

`docker-compose.prod.yml` reads these variables from `.env` in the project directory
(Compose loads `.env` automatically).

### 2. Start the stack

Build from source (first run or after pulling code changes):

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Or pull a published release image (after a `v*` tag is published to GHCR):

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

Open **http://localhost:3000** (or `http://localhost:<APP_PORT>` if you changed it).

The `app` service waits until Postgres passes its healthcheck, then:

1. Runs database migrations (`scripts/migrate.mjs` via the container entrypoint).
2. Optionally seeds demo data when `SEED_DEMO_DATA=true`.
3. Starts the Next.js standalone server on port 3000.

### 3. Enable demo data on first boot

In `.env`:

```
SEED_DEMO_DATA=true
```

Bring the stack up (or restart the app container once):

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

The seed is **idempotent** — safe to leave `SEED_DEMO_DATA=true` across restarts, but
you only need it on first boot. After data exists, set it back to `false`.

Demo projects: **Web App** (`WEB`) and **Payments API** (`API`).

### 4. Verify health

```bash
curl -s http://localhost:3000/api/v1/health
```

Expected: `{"status":"ok","database":"connected"}`

### 5. Upgrade to a new release

```bash
cd open-tc-manager
git pull   # if building from source
docker compose -f docker-compose.prod.yml pull   # if using GHCR image
docker compose -f docker-compose.prod.yml up -d --build
```

Migrations run automatically every time the app container starts. Postgres data
persists in the `postgres_data` Docker volume across restarts and upgrades.

### 6. Backup and restore (Postgres volume)

**Backup** (while the stack is running):

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U opentcm -d opentcm --no-owner --no-acl \
  > opentcm-backup-$(date +%Y%m%d).sql
```

Adjust `-U` / `-d` if you changed `POSTGRES_USER` or `POSTGRES_DB` in `.env`.

**Restore** into a fresh database (destructive — replaces all data):

```bash
# Stop the app so nothing writes during restore
docker compose -f docker-compose.prod.yml stop app

docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U opentcm -d opentcm -v ON_ERROR_STOP=1 \
  < opentcm-backup-YYYYMMDD.sql

docker compose -f docker-compose.prod.yml start app
```

For a full disaster-recovery rebuild: `docker compose -f docker-compose.prod.yml down`
(keeps the volume), restore as above, or recreate the volume and restore into an empty
database.

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

Official installation guides:

- [PostgreSQL download page](https://www.postgresql.org/download/) — pick your OS.
- [Ubuntu packages](https://www.postgresql.org/download/linux/ubuntu/)

**Ubuntu / Debian (exact commands):**

```bash
sudo apt-get update
sudo apt-get install -y postgresql-16 postgresql-client-16
sudo systemctl enable --now postgresql
```

Verify:

```bash
psql --version
# psql (PostgreSQL) 16.x
```

### 2. Create database and role

Connect as the Postgres superuser and run this block **verbatim** (change the
password before production):

```bash
sudo -u postgres psql -v ON_ERROR_STOP=1 <<'SQL'
CREATE USER opentcm WITH PASSWORD 'change-me-in-production';
CREATE DATABASE opentcm OWNER opentcm;
GRANT ALL PRIVILEGES ON DATABASE opentcm TO opentcm;
SQL
```

### 3. Install Node.js 22 and clone OpenTCM

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

Edit `.env` and set `DATABASE_URL`. Format, field by field:

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

### 5. Install dependencies, migrate, and build

```bash
npm ci
npm run db:migrate:prod
```

`db:migrate:prod` uses `scripts/migrate.mjs` (drizzle-orm migrator). It does **not**
require `drizzle-kit`, which is a development-only tool.

Optional demo data:

```bash
npm run db:seed
```

Production build:

```bash
npm run build
```

This produces a Next.js **standalone** output under `.next/standalone/`.

### 6. Run the production server

**Recommended (matches the Docker image runtime):**

```bash
npm run start:standalone
```

`start:standalone` copies static assets into the standalone bundle and runs
`node .next/standalone/server.js` with `HOSTNAME=0.0.0.0` and `PORT=3000`.

**Alternative** (full `.next` tree on disk, not used in Docker):

```bash
npm run start
```

Open **http://localhost:3000**.

### 7. Verify

```bash
curl -s http://localhost:3000/api/v1/health
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/p/WEB
```

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

**Backup:**

```bash
pg_dump "$DATABASE_URL" --no-owner --no-acl > opentcm-backup-$(date +%Y%m%d).sql
```

**Restore:**

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 < opentcm-backup-YYYYMMDD.sql
```

Stop the OpenTCM process before restoring to avoid concurrent writes.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `DATABASE_URL is not set` | Export `DATABASE_URL` or add it to `.env` at the repo root. |
| App starts but health shows database error | Check Postgres is running, credentials match, and migrations ran (`db:migrate:prod`). |
| Port 3000 in use | Set `PORT=3001` (and `APP_PORT=3001` in Compose `.env`). |
| Docker app exits immediately | `docker compose -f docker-compose.prod.yml logs app` — usually migration failure or bad `DATABASE_URL`. |
| Blank styles in standalone mode | Use `npm run start:standalone` (copies `.next/static`); do not run `server.js` without static assets. |

---

## Related docs

- [`DEVELOPMENT.md`](DEVELOPMENT.md) — local dev with hot reload
- [`USER_GUIDE.md`](USER_GUIDE.md) — using the application
- [`API.md`](API.md) — HTTP API reference
