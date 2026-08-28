# OpenTCM — Open Test Case Manager

**OpenTCM — Open Test Case Manager** is a free, open-source, self-hostable web
application for authoring and organizing software test cases. Store structured test
steps with markdown descriptions, organize work in nested directories per project, and
manage lifecycle with a safe trash workflow — all backed by PostgreSQL.

MIT licensed · [Setup guide](docs/SETUP.md) · [User guide](docs/USER_GUIDE.md)

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
- **Docker or bring-your-own Postgres** — production image with automatic migrations
  on startup.
- **No authentication** — intended for closed/trusted networks only (see
  [Security](#security)).

## Quickstart

**Docker (recommended):**

```bash
git clone https://github.com/shanecookofficial/open-tc-manager.git
cd open-tc-manager
cp .env.example .env
# Optional: set SEED_DEMO_DATA=true in .env for demo data on first boot
docker compose -f docker-compose.prod.yml up -d --build
```

Open http://localhost:3000

Full instructions (upgrades, backups, demo data, manual Postgres): **[docs/SETUP.md](docs/SETUP.md)**

## Development

```bash
cp .env.example .env
docker compose up          # Postgres + dev server, or use your own Postgres
npm ci
npm run db:migrate
npm run db:seed
npm run dev
```

See **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)** for scripts, testing, and
troubleshooting.

| Command | Purpose |
| --- | --- |
| `npm run test` | Unit tests |
| `npm run test:integration` | API integration tests (requires Postgres) |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run lint` / `npm run typecheck` | Code quality |

## Documentation

| Doc | Audience |
| --- | --- |
| [SETUP.md](docs/SETUP.md) | Install and operate OpenTCM |
| [USER_GUIDE.md](docs/USER_GUIDE.md) | Day-to-day usage |
| [DEVELOPMENT.md](docs/DEVELOPMENT.md) | Contributors and local dev |
| [API.md](docs/API.md) | HTTP API contract |
| [PLAN.md](docs/PLAN.md) | Product scope and architecture |
| [TASKS.md](docs/TASKS.md) | Implementation task ledger |

## Security

OpenTCM v1 has **no built-in authentication**. Anyone who can reach the application
can read and modify all data. Deploy only on a **closed or trusted network**, or place
it behind your own access controls (VPN, firewall, authenticated reverse proxy).

## Roadmap (not in v1)

Future themes, in product-owner priority order:

1. **Users and per-case change history**
2. **Test result reporting** (manual and automated)
3. **Search by step text**
4. **Import / export**
5. **Test case version control**

## Screenshots

| Repository | Case detail (markdown) | Trash |
| --- | --- | --- |
| ![Repository](docs/images/repository.png) | ![Case detail](docs/images/case-detail.png) | ![Trash](docs/images/trash.png) |

## License

[MIT](LICENSE)
