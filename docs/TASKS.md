# Task Ledger

Work breakdown for OpenTCM v1. Rules for claiming, branching, and review are in
`docs/AGENT_PLAYBOOK.md`. Architecture and scope are in `docs/PLAN.md`.

**Status values:** `todo` · `in-progress` · `blocked` · `review` · `done`
Update your task's status line the moment it changes.

Dependency notation: a task may start only when everything in **Needs** is `done`.

---

## M0 — Foundation

### M0-1 · Project scaffold
- **Owner:** Composer · **Status:** todo · **Needs:** —
- Next.js (App Router) + TypeScript strict + Tailwind + shadcn/ui + ESLint + Prettier
  + Vitest wired up. `src/` layout: `app/`, `lib/`, `components/`. Placeholder home page.
- **Accept:** `npm run dev`, `lint`, `typecheck`, `test`, `build` all succeed on a clean clone.

### M0-2 · Dev database & compose skeleton
- **Owner:** Composer · **Status:** todo · **Needs:** M0-1
- `docker-compose.yml` with `postgres:16` (volume, healthcheck) and the app in dev mode;
  `.env.example` with `DATABASE_URL`; `docs/DEVELOPMENT.md` covering local setup.
- **Accept:** `docker compose up` serves the placeholder app connected to Postgres.

### M0-3 · CI pipeline
- **Owner:** Composer · **Status:** todo · **Needs:** M0-1
- GitHub Actions on PR: lint, typecheck, unit tests, build. Postgres service container
  prepared (used from M1 on). Required check for merge.
- **Accept:** pipeline green on a trivial PR; failures block merge.

## M1 — Contract (freeze before M2/M3 fan-out)

### M1-1 · Schema & migrations
- **Owner:** Grok 4.6 · **Status:** todo · **Needs:** M0-2
- Drizzle schema for `directories`, `test_cases`, `test_steps` + `case_number_seq`,
  exactly per PLAN §5 (constraints, deferred uniques, cascades). Generated SQL migration
  + `npm run db:migrate`.
- **Accept:** migration applies cleanly to an empty DB; constraint behaviors verified by
  unit tests (sibling-name uniqueness incl. root, step-position uniqueness, cascades).

### M1-2 · API contract: `docs/API.md` + Zod schemas
- **Owner:** Grok 4.6 · **Status:** todo · **Needs:** M1-1
- Full request/response/error specification for every PLAN §6 endpoint, with JSON
  examples; matching Zod schemas in `src/lib/contracts/`; typed fixture factory for UI
  development (`src/lib/contracts/fixtures.ts`).
- **Accept:** Composer approves the PR after a genuine review (this approval *is* the
  contract freeze); fixtures typecheck against the schemas.

### M1-3 · Seed & demo data
- **Owner:** Composer · **Status:** todo · **Needs:** M1-1
- Idempotent `npm run db:seed`: ~4 directories (one nested twice), ~12 realistic cases
  demonstrating markdown (tables, code blocks, lists) in descriptions, actions, and
  expected results; some steps without expected results; one case with 20+ steps.
- **Accept:** seed runs twice without error or duplication; data covers the listed variety.

## M2 — API (Grok lane; parallel with M3)

### M2-1 · API foundation
- **Owner:** Grok 4.6 · **Status:** todo · **Needs:** M1-2
- Route-handler plumbing: DB client, Zod request validation wrapper, shared error
  envelope, `GET /api/v1/health`. Integration-test harness against Postgres in CI.
- **Accept:** health endpoint + one demo validation failure covered by integration tests.

### M2-2 · Directory endpoints
- **Owner:** Grok 4.6 · **Status:** todo · **Needs:** M2-1
- `GET /tree`, `POST /directories`, `PATCH /directories/:id`,
  `DELETE /directories/:id?mode=...` incl. cycle rejection and all three delete modes.
- **Accept:** integration tests for happy paths + duplicate sibling name, move-into-own-
  descendant, delete-nonempty-without-mode; tree returns recursive case counts.

### M2-3 · Test case endpoints
- **Owner:** Grok 4.6 · **Status:** todo · **Needs:** M2-1
- List (directory filter, `q` search on title/number, pagination), create with steps,
  get by id and by number, full update with atomic step replacement, move, delete.
- **Accept:** integration tests for numbering immutability (create→move→update keeps
  `TC-n`), atomic reorder, empty-steps allowed, validation failures (missing title /
  empty action), search by `TC-7` and by partial title.

## M3 — UI (Composer lane; parallel with M2, against M1-2 fixtures until M2 lands)

### M3-1 · App shell & repository view
- **Owner:** Composer · **Status:** todo · **Needs:** M1-2
- Layout with header + collapsible directory tree sidebar (counts, keyboard navigable)
  + case list (number, title, step count, updated) + search box + empty states.
- **Accept:** Playwright test drives tree selection and search against fixtures.

### M3-2 · Markdown components
- **Owner:** Composer · **Status:** todo · **Needs:** M0-1
- `<Markdown>` render component (`react-markdown` + `remark-gfm` + `rehype-sanitize`,
  strict schema) and `<MarkdownEditor>` (textarea + write/preview tabs).
- **Accept:** unit tests: GFM table renders; `<script>` and `onerror` payloads render inert.

### M3-3 · Case detail view
- **Owner:** Composer · **Status:** todo · **Needs:** M3-1, M3-2
- `/cases/TC-<n>`: breadcrumb, title, rendered description, steps table with markdown
  cells, Edit/Move/Delete actions with confirm dialog.
- **Accept:** long/markdown-heavy fixture case renders legibly; delete confirm covered by test.

### M3-4 · Case editor
- **Owner:** Composer · **Status:** todo · **Needs:** M3-1, M3-2
- Create + edit form: title, directory picker, description editor, dynamic step rows
  (required action, optional expected result, preview toggles, insert/remove,
  drag + keyboard reordering), inline validation.
- **Accept:** Playwright: create case with 3 steps incl. reorder; submitting empty
  action shows inline error, not a request.

### M3-5 · Directory management UI
- **Owner:** Composer · **Status:** todo · **Needs:** M3-1
- Create/rename/move/delete dialogs from tree context actions, incl. the delete-mode
  choice for non-empty directories and case "Move to…" picker.
- **Accept:** Playwright covers create-nested, rename-collision error, and both
  non-empty delete modes.

### M3-6 · Integration: UI on real API
- **Owner:** Composer · **Status:** todo · **Needs:** M2-2, M2-3, M3-3, M3-4, M3-5
- Swap fixtures for live endpoints; wire loading/error/toast states; fix contract
  mismatches (via `contract-change` if the contract itself is wrong).
- **Accept:** full e2e gate journey green in CI against a seeded database:
  create dir → create case (markdown steps) → view → edit/reorder → move → delete.

## M4 — Deployment & docs

### M4-1 · Production packaging
- **Owner:** Composer · **Status:** todo · **Needs:** M3-6
- Multi-stage production Dockerfile (standalone output, non-root), production
  `docker-compose.yml` (app + postgres + volume + healthchecks), migrations run on
  container start, image published via CI on tag.
- **Accept:** `docker compose -f docker-compose.prod.yml up` on a clean host serves the
  seeded app; container restart loses no data.

### M4-2 · Setup & user docs
- **Owner:** Composer · **Status:** todo · **Needs:** M4-1
- `docs/SETUP.md`: (a) Docker quickstart; (b) **manual Postgres guide** — install,
  `CREATE DATABASE`/`CREATE USER`/`GRANT` copy-paste block, `DATABASE_URL` format,
  migrate, run; (c) upgrade & backup notes. Rewritten `README.md` (what/why/screenshot/
  quickstart/license). Short `docs/USER_GUIDE.md` with screenshots.
- **Accept:** M4-3 passes.

### M4-3 · Adversarial docs walkthrough
- **Owner:** Grok 4.6 · **Status:** todo · **Needs:** M4-2
- Execute `docs/SETUP.md` verbatim (both paths) on a clean environment; file an issue
  for every deviation, ambiguity, or missing step; Composer fixes; repeat until clean.
- **Accept:** one uninterrupted run of each path succeeds with no undocumented action.

## M5 — Hardening & v0.1.0

### M5-1 · Bug bash & edge cases
- **Owner:** both (Grok: API/data, Composer: UI) · **Status:** todo · **Needs:** M3-6
- Attack: 200-char titles, 100+ steps, deep nesting (10+ levels), concurrent edits,
  hostile markdown, browser back/refresh mid-edit. Fix or explicitly defer with a note
  in `docs/DECISIONS.md`.
- **Accept:** zero known data-loss or XSS bugs; deferred list reviewed.

### M5-2 · A11y & performance pass
- **Owner:** Composer · **Status:** todo · **Needs:** M5-1
- Keyboard-only run of the gate journey; axe scan on the three main screens; case list
  paginates and stays responsive at 5k seeded cases / 500 directories.
- **Accept:** axe reports no critical issues; list interactions < 200 ms server time
  at the seeded scale.

### M5-3 · Release v0.1.0
- **Owner:** Grok 4.6 · **Status:** todo · **Needs:** M4-3, M5-2
- CHANGELOG, LICENSE, CONTRIBUTING (points contributors at the playbook), issue
  templates, tag `v0.1.0`, verify published image, roadmap section in README naming
  the v2 themes (results reporting, users/auth) as explicitly out of v1.
- **Accept:** tagged release installable from published artifacts by docs alone.

---

## Suggested execution order

```
M0-1 → M0-2 → M0-3 → M1-1 → M1-2 (freeze) ─┬─ Grok:    M2-1 → M2-2 → M2-3 ─┐
                              └ M1-3 (any time after M1-1)                  ├→ M3-6 → M4-1 → M4-2 → M4-3 ─┐
                                           └─ Composer: M3-1..M3-5 ────────┘            M5-1 → M5-2 ──────┴→ M5-3
```
