# OpenTCM — Open Test Case Manager

**OpenTCM — Open Test Case Manager** is a free, open-source, self-hostable web
application for authoring and organizing software test cases. Store structured test
steps with markdown descriptions, organize work in nested directories per project, and
manage lifecycle with a safe trash workflow — all backed by PostgreSQL.

MIT licensed · [Setup guide](docs/SETUP.md) · [User guide](docs/USER_GUIDE.md) ·
[Changelog](CHANGELOG.md)

**Current version: v0.1.0** (pending the maintainer `v0.1.0` git tag after merge;
see [RELEASING.md](RELEASING.md)).

![Repository view](docs/images/repository.png)

## Features (v1)

- **Projects with configurable prefixes** — e.g. `WEB-42`, `API-7`; numbers are
  immutable per project.
- **Nested directory tree** per project with case counts.
- **Markdown everywhere** — descriptions, step actions, and expected results (GFM
  tables, code blocks, lists) with sanitised rendering.
- **Search and pagination** across large case libraries.
- **Selection mode** — bulk move to trash with select-all-matching when filters are
  active.
- **Trash workflow** — restore or permanently delete; typed confirmation guards
  destructive actions.
- **Directory management** — create, rename, move, and delete folders from the tree.
- **Docker for the website only** — you provide PostgreSQL and enter connectors
  in `.env`; migrations run on app startup.
- **Email + password authentication** with Admin / Member / Viewer roles (v1.1).

## Quickstart

**Docker (recommended):**

```bash
git clone https://github.com/shanecookofficial/open-tc-manager.git
cd open-tc-manager
cp .env.example .env
# Enter POSTGRES_* or DATABASE_URL for your org Postgres (required).
# Optional: set SEED_DEMO_DATA=true in .env for demo data on first boot only,
# then set it back to false (see docs/SETUP.md).
docker compose -f docker-compose.prod.yml up -d --build
```

Open http://localhost:3000 — sign in (production: the Admin you set with
`BOOTSTRAP_ADMIN_*`; local `docker compose up`: `admin@opentcm.io` /
`opentcm-admin`), then **Create your first project**. The WEB/API demo appears
only if you set `SEED_DEMO_DATA=true` or run `npm run db:seed`.

OpenTCM v1.1 requires sign-in. Use it only on a closed or trusted network
([Security](#security)).

Full instructions (upgrades, backups, demo data, manual Postgres): **[docs/SETUP.md](docs/SETUP.md)**

## Development

```bash
cp .env.example .env       # enter POSTGRES_* or DATABASE_URL
docker compose up --remove-orphans   # website only; migrate + dev server
# http://localhost:3000 — admin@opentcm.io / opentcm-admin (empty instance)
```

Or run Next.js on the host (same connectors; use `localhost` for host Postgres):

```bash
npm ci
npm run db:migrate
npm run dev
```

`npm run db:seed` is optional (WEB/API demo projects and cases).

See **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)** for scripts, testing, and
troubleshooting.

| Command                              | Purpose                                   |
| ------------------------------------ | ----------------------------------------- |
| `npm run test`                       | Unit tests                                |
| `npm run test:integration`           | API integration tests (requires Postgres) |
| `npm run test:e2e`                   | Playwright end-to-end tests               |
| `npm run lint` / `npm run typecheck` | Code quality                              |

## Documentation

| Doc                                   | Audience                       |
| ------------------------------------- | ------------------------------ |
| [SETUP.md](docs/SETUP.md)             | Install and operate OpenTCM    |
| [USER_GUIDE.md](docs/USER_GUIDE.md)   | Day-to-day usage               |
| [DEVELOPMENT.md](docs/DEVELOPMENT.md) | Contributors and local dev     |
| [CONTRIBUTING.md](CONTRIBUTING.md)    | How to contribute              |
| [RELEASING.md](RELEASING.md)          | How maintainers tag a release  |
| [CHANGELOG.md](CHANGELOG.md)          | Released and pending changes   |
| [API.md](docs/API.md)                 | HTTP API contract              |
| [PLAN.md](docs/PLAN.md)               | Product scope and architecture |
| [PLAN-v1.1.md](docs/PLAN-v1.1.md)     | v1.1: auth, roles, history     |
| [TASKS.md](docs/TASKS.md)             | v0.1.0 task ledger             |

## Security

OpenTCM v1.1 adds email + password authentication and instance-wide roles. Anyone
who can reach the application can still read all projects and cases **after signing
in** — roles limit write operations, not project visibility. Deploy only on a
**closed or trusted network**, or place it behind your own access controls (VPN,
firewall, authenticated reverse proxy).

## Roadmap (not in v1)

Future themes, in product-owner priority order:

1. **Users and per-case change history** — **v1.1** (`docs/PLAN-v1.1.md`): email/password, roles, snapshot revert (A→B→C→A)
2. **Test result reporting** (manual and automated)
3. **Search by step text**
4. **Import / export**
5. **Test case version control**

## Screenshots

| Repository                                | Case detail (markdown)                      | Trash                           |
| ----------------------------------------- | ------------------------------------------- | ------------------------------- |
| ![Repository](docs/images/repository.png) | ![Case detail](docs/images/case-detail.png) | ![Trash](docs/images/trash.png) |

## License

[MIT](LICENSE)
