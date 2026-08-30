# Contributing to OpenTCM

Thanks for helping with **OpenTCM — Open Test Case Manager**. v1 is intentionally
small: authoring and organizing test cases. Please read the scope in
[`docs/PLAN.md`](docs/PLAN.md) §2 before proposing work. The
[roadmap in the README](README.md#roadmap-not-in-v1) lists themes that are
**explicitly out of v1** (users + change history, result reporting, step-text
search, import/export, version control). PRs that implement those will be closed
with a pointer to the plan.

Two AI implementation agents (Grok 4.6 and Composer) built v1 under
[`docs/AGENT_PLAYBOOK.md`](docs/AGENT_PLAYBOOK.md). Human contributors should
still follow the same quality bars: small PRs, green suites, forward-only
migrations, no silent divergences from the plan.

## Development setup

Follow **[`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)** (Docker Compose or
bring-your-own PostgreSQL 16+). Short version:

```bash
cp .env.example .env     # enter connectors for your PostgreSQL 16+ instance
npm ci
npm run db:migrate
npm run dev              # http://localhost:3000 — admin@opentcm.io / opentcm-admin
# npm run db:seed        # optional WEB/API demo data (idempotent)
```

Node.js **22+** is required (`package.json` `engines`).

## Test suite

Integration and e2e tests need a **live PostgreSQL** reachable at `DATABASE_URL`
(see `.env.example`) with migrations applied.

| Suite            | Command                    | Postgres?                                                            |
| ---------------- | -------------------------- | -------------------------------------------------------------------- |
| Lint             | `npm run lint`             | no                                                                   |
| Typecheck        | `npm run typecheck`        | no                                                                   |
| Unit             | `npm run test`             | no                                                                   |
| Integration      | `npm run test:integration` | **yes** (migrated `DATABASE_URL`)                                    |
| Production build | `npm run build`            | no (build uses a dummy URL)                                          |
| End-to-end       | `npm run test:e2e`         | **yes** (Playwright seeds, builds, and starts the standalone server) |

GitHub Actions runs lint, typecheck, unit, integration, and build on every PR.
Run **e2e locally** before you open the PR; it is required for merge even though
it is not a required Actions check yet.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`,
`fix:`, `docs:`, `test:`, `chore:`, `ci:`. Keep the subject imperative and
specific (`fix: map CHECK violations to 400`, not `fix stuff`).

## Pull requests

- **Small.** One concern per PR. Reviewers should be able to hold the diff in
  mind (the playbook targets under ~600 lines excluding lockfiles and generated
  SQL).
- **Green.** `lint`, `typecheck`, `test`, `test:integration`, and `build` must
  pass; run `test:e2e` as well when you touch UI, API behavior the UI relies on,
  or seed data.
- **No new dependencies** without a one-line justification in the PR body.
- **No roadmap features** (playbook §2.6 / PLAN §2).
- Describe what changed, how you verified it, and any contract impact
  (`docs/API.md` + `src/lib/contracts/`). Contract changes are rare and must
  update the doc, Zod schemas, and fixtures together.

## Database migrations

Migrations are **forward-only** plain SQL under `drizzle/`, reviewed line by
line. **Never edit a migration that has already been merged.** Add a new
migration instead (`npm run db:generate`, then re-apply any hand-edits such as
`DEFERRABLE` that drizzle-kit cannot emit — see `docs/DECISIONS.md`).

## Releasing

Maintainers: see **[`RELEASING.md`](RELEASING.md)**. Contributors do not tag
releases.

## License

By contributing you agree that your work is licensed under the [MIT License](LICENSE).
