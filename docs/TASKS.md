# Task Ledger

Work breakdown for OpenTCM (Open Test Case Manager) v1. Rules for claiming, branching,
and review are in
`docs/AGENT_PLAYBOOK.md`. Architecture and scope are in `docs/PLAN.md`; binding product
decisions are in `docs/DECISIONS.md`.

**Status values:** `todo` · `in-progress` · `blocked` · `review` · `done`
Update your task's status line the moment it changes.

Dependency notation: a task may start only when everything in **Needs** is `done`.

---

## M0 — Foundation

### M0-1 · Project scaffold
- **Owner:** Composer · **Status:** done · **Needs:** —
- Next.js (App Router) + TypeScript strict + Tailwind + shadcn/ui + ESLint + Prettier
  + Vitest wired up. `src/` layout: `app/`, `lib/`, `components/`. Placeholder home
  page. MIT `LICENSE` file.
- **Accept:** `npm run dev`, `lint`, `typecheck`, `test`, `build` all succeed on a clean clone.

### M0-2 · Dev database & compose skeleton
- **Owner:** Composer · **Status:** done · **Needs:** M0-1
- `docker-compose.yml` with `postgres:16` (volume, healthcheck) and the app in dev mode;
  `.env.example` with `DATABASE_URL` and comments; `docs/DEVELOPMENT.md` covering local setup.
- **Accept:** `docker compose up` serves the placeholder app connected to Postgres.

### M0-3 · CI pipeline
- **Owner:** Composer · **Status:** done · **Needs:** M0-1
- GitHub Actions on PR: lint, typecheck, unit tests, build. Postgres service container
  prepared (used from M1 on). Required check for merge.
- **Accept:** pipeline green on a trivial PR; failures block merge.

## M1 — Contract (freeze before M2/M3 fan-out)

### M1-1 · Schema & migrations
- **Owner:** Grok 4.6 · **Status:** done · **Needs:** M0-2
- Drizzle schema for `projects`, `directories`, `test_cases`, `test_steps` exactly per
  PLAN §5 (per-project prefix + counter, `deleted_at`, constraints, deferred uniques,
  cascades, `ON DELETE SET NULL` for trashed-case directories). Generated SQL migration
  + `npm run db:migrate`.
- **Accept:** migration applies cleanly to an empty DB; constraint behaviors verified by
  tests (prefix format/uniqueness, per-project case-number uniqueness, sibling-name
  uniqueness incl. root, step-position uniqueness, cascades and SET NULL).

### M1-2 · API contract: `docs/API.md` + Zod schemas
- **Owner:** Grok 4.6 · **Status:** todo · **Needs:** M1-1
- Full request/response/error specification for every PLAN §6 endpoint — including
  projects, trash, bulk-trash/restore/purge with the `{ ids } | { all, filter }`
  envelope, and pagination parameters/metadata — with JSON examples; matching Zod
  schemas in `src/lib/contracts/`; typed fixture factory for UI development
  (`src/lib/contracts/fixtures.ts`).
- **Accept:** Composer approves the PR after a genuine review (this approval *is* the
  contract freeze); fixtures typecheck against the schemas.

### M1-3 · Seed & demo data
- **Owner:** Composer · **Status:** todo · **Needs:** M1-1
- Idempotent `npm run db:seed`: **two projects** with different prefixes (e.g. `WEB`,
  `API`); ~4 directories (one nested twice); ~15 realistic cases demonstrating markdown
  (tables, code blocks, lists) in descriptions, actions, and expected results; some
  steps without expected results; one case with 20+ steps; **2–3 cases already in the
  trash**.
- **Accept:** seed runs twice without error or duplication; data covers the listed variety.

## M2 — API (Grok lane; parallel with M3)

### M2-1 · API foundation
- **Owner:** Grok 4.6 · **Status:** todo · **Needs:** M1-2
- Route-handler plumbing: DB client, Zod request validation wrapper, shared error
  envelope, shared pagination helper, `GET /api/v1/health`. Integration-test harness
  against Postgres in CI.
- **Accept:** health endpoint + one demo validation failure covered by integration tests.

### M2-2 · Project endpoints
- **Owner:** Grok 4.6 · **Status:** todo · **Needs:** M2-1
- List/create/update/delete projects, incl. prefix validation and uniqueness, atomic
  counter behavior, and delete-only-when-empty (no active or trashed cases).
- **Accept:** integration tests for prefix rules, rename/reprefix (numbers unchanged,
  display changes), delete-nonempty rejection, and a concurrent-create hammer test
  proving no duplicate case numbers per project.

### M2-3 · Directory endpoints
- **Owner:** Grok 4.6 · **Status:** todo · **Needs:** M2-1
- `GET /projects/:id/tree`, `POST /directories`, `PATCH /directories/:id`,
  `DELETE /directories/:id?mode=...` incl. cycle rejection and both delete modes
  (`trash_contents` soft-deletes cases; `move_contents_to_parent`).
- **Accept:** integration tests for happy paths + duplicate sibling name, move-into-own-
  descendant, delete-nonempty-without-mode; tree counts exclude trashed cases;
  `trash_contents` leaves cases restorable (to root once their directory is gone).

### M2-4 · Test case endpoints (active)
- **Owner:** Grok 4.6 · **Status:** todo · **Needs:** M2-1
- Paginated list (project + directory filters, `q` on title/number), create with steps
  (per-project numbering), get by id and by `:prefix-:n`, full update with atomic step
  replacement, move, soft delete.
- **Accept:** integration tests for numbering immutability (create→move→update keeps
  number), atomic reorder, empty-steps allowed, validation failures (missing title /
  empty action), search by `WEB-7` and partial title, pagination metadata correctness,
  soft-deleted cases vanishing from list/search/tree counts.

### M2-5 · Trash & bulk endpoints
- **Owner:** Grok 4.6 · **Status:** todo · **Needs:** M2-4
- Paginated/filterable trash list; restore (single + bulk); permanent delete (single,
  409 unless trashed); purge (bulk permanent, `{ ids } | { all, filter }`); bulk-trash
  on active cases. All bulk ops transactional, returning affected counts.
- **Accept:** integration tests: restore to original vs. root fallback; purge with
  `all: true` + filter deletes exactly the matching trashed set and can never touch an
  active case; bulk ops with mixed valid/invalid ids fail atomically with a clear error.

## M3 — UI (Composer lane; parallel with M2, against M1-2 fixtures until M2 lands)

### M3-1 · Markdown components
- **Owner:** Composer · **Status:** todo · **Needs:** M0-1
- `<Markdown>` render component (`react-markdown` + `remark-gfm` + `rehype-sanitize`,
  strict schema) and `<MarkdownEditor>` (textarea + write/preview tabs).
- **Accept:** unit tests: GFM table renders; `<script>` and `onerror` payloads render inert.

### M3-2 · App shell, project switcher & repository view
- **Owner:** Composer · **Status:** todo · **Needs:** M1-2
- Layout with header + project switcher (create/edit dialogs incl. prefix-change
  warning; zero-project onboarding screen) + collapsible directory tree sidebar
  (counts, keyboard navigable, trash link with count) + paginated case list (number,
  title, step count, updated) + search box + empty states.
- **Accept:** Playwright drives project create/switch, tree selection, search, and
  pagination against fixtures.

### M3-3 · Case detail view
- **Owner:** Composer · **Status:** todo · **Needs:** M3-1, M3-2
- `/cases/<PREFIX>-<n>`: breadcrumb, title, rendered description, steps table with
  markdown cells, Edit/Move/Delete-to-trash actions with confirm dialog.
- **Accept:** long/markdown-heavy fixture case renders legibly; trash confirm covered by test.

### M3-4 · Case editor
- **Owner:** Composer · **Status:** todo · **Needs:** M3-1, M3-2
- Create + edit form: title, directory picker, description editor, dynamic step rows
  (required action, optional expected result, preview toggles, insert/remove,
  drag + keyboard reordering), inline validation.
- **Accept:** Playwright: create case with 3 steps incl. reorder; submitting empty
  action shows inline error, not a request.

### M3-5 · Directory management UI
- **Owner:** Composer · **Status:** todo · **Needs:** M3-2
- Create/rename/move/delete dialogs from tree context actions, incl. the delete-mode
  choice (`trash_contents` vs `move_contents_to_parent`) for non-empty directories and
  the case "Move to…" picker.
- **Accept:** Playwright covers create-nested, rename-collision error, and both
  non-empty delete modes.

### M3-6 · Selection mode & bulk trash (repository view)
- **Owner:** Composer · **Status:** todo · **Needs:** M3-2
- "Select" button toggles selection mode: per-row checkboxes, select-all-matching-filter
  control showing the total count, bulk "Move to trash" with count-stating confirmation.
- **Accept:** Playwright: filter → select-all → bulk trash shows correct count and
  empties the filtered list; selection survives page navigation within the filter.

### M3-7 · Trash view
- **Owner:** Composer · **Status:** todo · **Needs:** M3-6
- Paginated, filterable trash table (search + directory, trashed-at column); per-row
  Restore and Delete-permanently; selection mode with bulk Restore and bulk permanent
  delete; typed confirmation (count or `DELETE`) for anything permanent.
- **Accept:** Playwright: trash → restore one → permanently delete one via typed
  confirm → select-all + purge; cancelling the typed confirm never deletes.

### M3-8 · Integration: UI on real API
- **Owner:** Composer · **Status:** todo · **Needs:** M2-2..M2-5, M3-3..M3-7
- Swap fixtures for live endpoints; wire loading/error/toast states; fix contract
  mismatches (via `contract-change` if the contract itself is wrong).
- **Accept:** full e2e gate journey green in CI against a seeded database:
  create project → create dir → create case (markdown steps) → view → edit/reorder →
  move → trash → restore → trash again → purge via typed confirm.

## M4 — Deployment & docs

### M4-1 · Production packaging
- **Owner:** Composer · **Status:** todo · **Needs:** M3-8
- Multi-stage production Dockerfile (standalone output, non-root), production
  `docker-compose.yml` (app + postgres + volume + healthchecks), migrations run on
  container start, image published via CI on tag.
- **Accept:** `docker compose -f docker-compose.prod.yml up` on a clean host serves the
  seeded app; container restart loses no data.

### M4-2 · Setup & user docs
- **Owner:** Composer · **Status:** todo · **Needs:** M4-1
- `docs/SETUP.md`: (a) Docker quickstart; (b) **manual Postgres guide** — install,
  `CREATE DATABASE`/`CREATE USER`/`GRANT` copy-paste block, `DATABASE_URL` format,
  `.env` file walkthrough, migrate, run; (c) upgrade & backup notes; (d) a prominent
  note that v1 has no authentication and belongs on a closed/trusted network.
  Rewritten `README.md` (what/why/screenshot/quickstart/roadmap/license), whose title
  and opening line spell out **"OpenTCM — Open Test Case Manager"** per the product
  owner. Short
  `docs/USER_GUIDE.md` with screenshots incl. trash & bulk delete flows.
- **Accept:** M4-3 passes.

### M4-3 · Adversarial docs walkthrough
- **Owner:** Grok 4.6 · **Status:** todo · **Needs:** M4-2
- Execute `docs/SETUP.md` verbatim (both paths) on a clean environment; file an issue
  for every deviation, ambiguity, or missing step; Composer fixes; repeat until clean.
- **Accept:** one uninterrupted run of each path succeeds with no undocumented action.

## M5 — Hardening & v0.1.0

### M5-1 · Bug bash & edge cases
- **Owner:** both (Grok: API/data, Composer: UI) · **Status:** todo · **Needs:** M3-8
- Attack: 200-char titles, 100+ steps, deep nesting (10+ levels), prefix edits on
  populated projects, concurrent edits, hostile markdown, select-all races while
  another client trashes/restores, browser back/refresh mid-edit. Fix or explicitly
  defer with a note in `docs/DECISIONS.md`.
- **Accept:** zero known data-loss or XSS bugs; deferred list reviewed.

### M5-2 · A11y & performance pass
- **Owner:** Composer · **Status:** todo · **Needs:** M5-1
- Keyboard-only run of the gate journey (incl. selection mode); axe scan on the four
  main screens; list and trash stay responsive at 5k seeded cases (1k trashed) / 500
  directories.
- **Accept:** axe reports no critical issues; list/trash interactions < 200 ms server
  time at the seeded scale.

### M5-3 · Release v0.1.0
- **Owner:** Grok 4.6 · **Status:** todo · **Needs:** M4-3, M5-2
- CHANGELOG, CONTRIBUTING (points contributors at the playbook), issue templates, tag
  `v0.1.0`, verify published image, roadmap section in README naming the future themes
  in the product owner's priority order (users + change history, results reporting,
  step-text search, import/export, version control) as explicitly out of v1.
- **Accept:** tagged release installable from published artifacts by docs alone.

---

## Suggested execution order

```
M0-1 → M0-2 → M0-3 → M1-1 → M1-2 (freeze) ─┬─ Grok:    M2-1 → M2-2/M2-3/M2-4 → M2-5 ─┐
                              └ M1-3 (any time after M1-1)                            ├→ M3-8 → M4-1 → M4-2 → M4-3 ─┐
                                           └─ Composer: M3-1..M3-7 ──────────────────┘           M5-1 → M5-2 ──────┴→ M5-3
```
