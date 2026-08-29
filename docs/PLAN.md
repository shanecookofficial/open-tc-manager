# OpenTCM — Product & Delivery Plan

**Name:** OpenTCM — **Open Test Case Manager**. The name is final per the product
owner. A research tool shares the acronym ([arXiv:2504.20118](https://arxiv.org/abs/2504.20118));
this is a non-commercial open-source project in a different domain, and the README and
all user-facing surfaces spell out "Open Test Case Manager" to avoid confusion.
**Status:** v1 as specified here is implemented in **0.1.0** (pending the
`v0.1.0` git tag; see `CHANGELOG.md` and `RELEASING.md`). This document remains
the source of truth for scope and architecture.
**Audience:** The AI implementation agents (Grok 4.6 and Composer), human maintainers,
and contributors.

---

## 1. Vision

A free, open-source, self-hostable test case manager that anyone can deploy and use in
minutes. It does one thing well in v1: **authoring and organizing test cases**. It is a
deployable website backed by PostgreSQL, with setup instructions simple enough for a
non-DBA to follow.

### Guiding principles

1. **Simple over powerful.** Every screen should be understandable without a manual.
2. **Zero-friction setup.** One `docker compose up` path, and one "bring your own
   Postgres" path with copy-paste instructions and a plain `.env` file.
3. **Markdown everywhere it matters.** Descriptions, steps, and expected results render
   markdown so teams can write rich, precise instructions.
4. **Hard to lose work.** Deletion is soft by default; permanent deletion is a
   deliberate, multi-step act.
5. **Boring, proven technology.** No exotic dependencies; contributors should feel at home.

---

## 2. Scope

### In scope (v1)

- **Projects** as the top-level unit of organization. Each project has a name and a
  **configurable case-number prefix** (e.g. `WEB`, `API`), set per project by the org.
- Create, read, update, and delete **test cases**. Test cases have:
  - a **title** (required),
  - a **case number** (required, auto-assigned per project, human-facing, e.g. `WEB-42`),
  - an optional **description** (markdown),
  - an ordered list of **steps**, where each step has a required **action** (markdown)
    and an optional **expected result** (markdown).
- A **directory tree** per project: all cases live under the project's implicit main
  (root) directory; teams may create arbitrarily nested sub-directories and move cases
  and directories around.
- **Soft delete with a Trash view.** Deleting a case moves it to the project's trash.
  Permanent deletion happens only from the trash, per case or in bulk via an explicit
  selection mode (checkboxes, select-all), always behind a strong confirmation.
- **Pagination and filtering** on every case listing (main lists and trash), designed
  for projects with thousands of cases.
- A clean, intuitive web UI: project switcher, tree navigation, case list, case detail
  with rendered markdown, case editor with live markdown preview, trash management.
- **PostgreSQL** persistence with automated migrations; all runtime configuration via
  environment variables / `.env` file.
- First-class **setup documentation**: Docker Compose quickstart and a manual Postgres
  configuration guide.
- Seed/demo data so a fresh install isn't an empty void.

### Explicitly out of scope (v1) — confirmed roadmap for later versions

In priority order per the product owner:

1. **Users + change history**: **in progress as v1.1** — see `docs/PLAN-v1.1.md`
   (email/password, roles, append-only snapshots, revert shows A→B→C→A).
2. **Test runs / results**: manual and automated result reporting, pass/fail history.
3. **Search by step text** (full-text search via Postgres `tsvector`).
4. **Import/export** (deferred explicitly).
5. **Richer test case version control** (branching, cherry-pick). v1.1 ships the
   early form: restore-to-snapshot revert without rewriting history.

Also out of **v1.0**: integrations, webhooks, attachments/uploads (markdown may
reference images by URL), tags, custom fields. v1.1 adds closed-network email/password
auth (`docs/PLAN-v1.1.md`); it still is not a public identity platform.

Out-of-scope items must not leak complexity into v1, but the schema must not paint us
into a corner (see §5 future-proofing notes).

---

## 3. Personas & core user journeys

- **QA engineer (primary):** writes and maintains test cases daily. Needs fast case
  creation, keyboard-friendly step editing, markdown for precision.
- **Developer:** occasionally reads a case to reproduce a scenario. Needs fast search of
  titles/numbers and legible rendering.
- **Team lead / admin-ish person:** sets up the instance, creates projects and prefixes,
  organizes the directory tree, curates the trash.

Core journeys that must be excellent:

1. Deploy the app and reach a working UI in under 10 minutes.
2. Create a project with prefix `WEB`, a directory, and a test case with 5 steps — then
   read it back — all in under 3 minutes with no documentation.
3. Reorganize: move a case (or a whole directory) to another directory without breaking
   its case number.
4. Clean house safely: filter a 3,000-case project down to an obsolete subset, select
   them with checkboxes (or select-all), trash them, then permanently purge them from
   the trash — without any chance of doing it by accident.

---

## 4. Technology stack (decision — signed off by product owner)

| Layer | Choice | Rationale |
| --- | --- | --- |
| Language | TypeScript (strict) | One language across the whole stack; both agents are strong in it. |
| Framework | Next.js (App Router) | Single deployable unit for UI + API routes; huge ecosystem; easy Docker image. |
| Database | PostgreSQL 16+ | Required by the brief. |
| ORM / migrations | Drizzle ORM + drizzle-kit | Lightweight, SQL-first, generates plain-SQL migrations that are easy to review. |
| Markdown | `react-markdown` + `remark-gfm` + `rehype-sanitize` | GFM support (tables, task lists) with strict sanitization — user content is untrusted HTML-wise. |
| Styling | Tailwind CSS + a small component set (shadcn/ui) | Fast to build a clean, modern UI without a design team. |
| Validation | Zod schemas shared between API and forms | One source of truth for the contract. |
| Testing | Vitest (unit), Playwright (e2e smoke) | Cheap to run in CI. |
| Packaging | Dockerfile + docker-compose.yml (app + postgres) | The "anyone can use it" path. |
| CI | GitHub Actions: lint, typecheck, unit tests, build, e2e smoke | Every PR must be green. |
| License | **MIT** | Product owner wants no liability and unrestricted use: MIT's warranty/liability disclaimer plus maximal permissiveness fits exactly. |

All API access goes through JSON REST endpoints under `/api/v1/*` (not server actions),
so the API doubles as a public automation surface later (automated result reporting in
a future version will need it anyway).

---

## 5. Data model

Four tables. Within a project, the root ("main directory") is **implicit**:
`directory_id = NULL` means the case lives at the project root; `parent_id = NULL`
means the directory is a top-level child of the project root.

```sql
-- projects: top-level unit; owns the case-number prefix and counter
CREATE TABLE projects (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name             TEXT NOT NULL UNIQUE CHECK (length(trim(name)) BETWEEN 1 AND 120),
  prefix           TEXT NOT NULL UNIQUE CHECK (prefix ~ '^[A-Z][A-Z0-9]{1,9}$'),
  next_case_number INTEGER NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- directories: arbitrarily nested folders within a project
CREATE TABLE directories (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id  BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id   BIGINT REFERENCES directories(id) ON DELETE CASCADE,  -- NULL = child of project root
  name        TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (project_id, parent_id, name)  -- sibling names unique, incl. at root
);

-- test_cases: the core entity
CREATE TABLE test_cases (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id   BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  case_number  INTEGER NOT NULL,                  -- per-project; rendered "<PREFIX>-<n>"
  title        TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  description  TEXT,                              -- optional, markdown
  directory_id BIGINT REFERENCES directories(id) ON DELETE SET NULL, -- NULL = project root
  deleted_at   TIMESTAMPTZ,                       -- NULL = active; set = in trash
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, case_number)
);
CREATE INDEX ON test_cases (project_id, deleted_at, directory_id);

-- test_steps: ordered steps belonging to a case
CREATE TABLE test_steps (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  test_case_id    BIGINT NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
  position        INTEGER NOT NULL,               -- 1-based order within the case
  action          TEXT NOT NULL CHECK (length(trim(action)) >= 1),  -- markdown, required
  expected_result TEXT,                           -- markdown, optional
  UNIQUE (test_case_id, position) DEFERRABLE INITIALLY DEFERRED
);
```

### Behavioral rules

- **Projects & prefixes.** Every directory and case belongs to exactly one project.
  Prefixes are org-configurable per project: uppercase, 2–10 chars, unique across the
  instance. Numbering is assigned from the project's counter atomically
  (`UPDATE projects SET next_case_number = next_case_number + 1 … RETURNING`).
  A prefix **may be edited** later; displayed identifiers re-render with the new prefix
  (the stored `case_number` integers never change) — the UI warns about this when editing.
- **Case numbers are immutable per project and never reused.** Moving a case between
  directories never changes its number. Trashing or permanently deleting a case never
  frees its number.
- **Soft delete (Trash).** "Delete" in the UI sets `deleted_at` after a confirmation.
  Trashed cases disappear from all normal lists, tree counts, and search, and appear in
  the project's **Trash** view. From the trash a case can be **restored** (to its
  original directory, or to the project root if that directory no longer exists) or
  **permanently deleted**. Permanent deletion is only possible for already-trashed
  cases and always requires a strong confirmation (§7).
- **Bulk operations.** Both the main case list and the trash have an explicit selection
  mode (a "Select" button reveals per-row checkboxes plus select-all). Main list:
  bulk move-to-trash. Trash: bulk restore and bulk permanent delete. Select-all
  operates on **everything matching the current filter**, not just the visible page;
  the confirmation always states the exact count.
- **Pagination & filtering everywhere.** All case listings (main and trash) are
  server-paginated (default 50/page) and filterable by text (title + case number) and
  directory. Built for thousands of cases per project.
- **Steps are replaced atomically.** The update-case endpoint accepts the full ordered
  step list and replaces it in one transaction (deferred unique constraint makes
  reordering safe). A case may have zero steps while being drafted, but the UI nudges
  toward at least one.
- **Directory deletion** requires the directory to be empty of active test cases
  (recursively), or the client passes an explicit `mode`: `trash_contents` (soft-delete
  contained cases) or `move_contents_to_parent`. Empty sub-directories are removed with
  their parent. Trashed cases whose directory is later deleted keep living in the trash
  (`directory_id` becomes `NULL` via `ON DELETE SET NULL`) and restore to the project root.
- **Cycle prevention:** moving a directory under its own descendant is rejected server-side.
- **Markdown** is stored raw; rendering + sanitization happen client-side with a strict
  allowlist (no raw HTML pass-through, no scripts).
- **Concurrency:** last-write-wins in v1, with `updated_at` returned so a stale-write
  warning can be added later.
- **Future-proofing (do not build, just don't block):** `test_cases.id` is separate
  from `case_number` so future runs/results and change-history tables can FK to `id`;
  timestamps exist everywhere so history features can be layered on; change history
  (roadmap #1) will be an append-only events table keyed to `test_cases.id` — nothing
  in v1 conflicts with that.

---

## 6. API surface (contract summary)

All endpoints return JSON, use Zod-validated bodies, and share an error envelope
`{ "error": { "code": string, "message": string } }`. The full request/response schemas
live in `docs/API.md` (task M1-2) and are the contract both agents build against.
Unless noted, case endpoints operate on **active** (non-trashed) cases.

| Method & path | Purpose |
| --- | --- |
| `GET /api/v1/projects` · `POST /api/v1/projects` | List / create projects (`name`, `prefix`). |
| `PATCH /api/v1/projects/:id` | Rename and/or change prefix (with re-render warning semantics). |
| `DELETE /api/v1/projects/:id` | Delete an empty project only (no active or trashed cases). |
| `GET /api/v1/projects/:id/tree` | Directory tree with per-directory active-case counts (drives the sidebar). |
| `POST /api/v1/directories` | Create directory (`projectId`, `name`, optional `parentId`). |
| `PATCH /api/v1/directories/:id` | Rename and/or move (`name?`, `parentId?` — `null` = root). |
| `DELETE /api/v1/directories/:id?mode=...` | Delete per the rules in §5. |
| `GET /api/v1/test-cases?projectId=&directoryId=&q=&page=` | Paginated active cases; `q` searches title + case number. |
| `POST /api/v1/test-cases` | Create case with steps (`projectId`, `title`, `description?`, `directoryId?`, `steps[]`). |
| `GET /api/v1/test-cases/:id` | Full case incl. ordered steps. Also by display number: `GET /api/v1/test-cases/number/:prefix-:n`. |
| `PUT /api/v1/test-cases/:id` | Full update: metadata + atomic step-list replacement. |
| `PATCH /api/v1/test-cases/:id/move` | Change `directoryId` only. |
| `DELETE /api/v1/test-cases/:id` | **Soft delete** — moves the case to the trash. |
| `POST /api/v1/test-cases/bulk-trash` | Bulk soft delete: `{ ids: [...] }` or `{ all: true, filter: {...} }`. Returns count. |
| `GET /api/v1/projects/:id/trash?directoryId=&q=&page=` | Paginated, filterable trash listing. |
| `POST /api/v1/test-cases/:id/restore` | Restore a trashed case (original directory, else project root). |
| `POST /api/v1/test-cases/bulk-restore` | Bulk restore: same id/filter envelope as bulk-trash. |
| `DELETE /api/v1/test-cases/:id/permanent` | Permanently delete one **trashed** case (409 if not trashed). |
| `POST /api/v1/projects/:id/trash/purge` | Bulk permanent delete of trashed cases: `{ ids: [...] }` or `{ all: true, filter: {...} }`. Returns count. |
| `GET /api/v1/health` | DB connectivity check for deploy verification. |

---

## 7. UI (v1 screens)

Single-page-app feel. Design language: clean, dense-but-breathable, light theme first,
responsive down to tablet. Empty states, loading skeletons, and error toasts are
required on every surface — "simple yet intuitive" dies in the edge cases.

1. **Project switcher & management.**
   Header dropdown to switch projects; dialogs to create a project (name + prefix with
   live validation) and edit one (renaming a prefix shows an explicit "existing case
   IDs will display with the new prefix" warning). First run with zero projects shows a
   friendly "create your first project" onboarding screen.
2. **Repository view (home, per project).**
   Left: collapsible directory tree ("All test cases" root, folders with active-case
   counts, context actions: new folder, rename, move, delete). Right: **paginated**
   case list for the selected directory — `WEB-n`, title, step count, updated date —
   with a search box (title/number) and a "New test case" button.
   A **Select** button switches the list into selection mode: per-row checkboxes, a
   select-all control (selects everything matching the current filter, with count),
   and a bulk "Move to trash" action with confirmation. A trash link with count sits
   in the sidebar footer.
3. **Case detail view** (`/cases/WEB-42`).
   Title, display number, breadcrumb path, rendered markdown description, and a
   two-column steps table (`#` | Action | Expected result) with markdown rendered in
   cells. Actions: Edit, Move, Delete (to trash, with confirm).
4. **Case editor** (create + edit share one form).
   Title field, directory picker, markdown description with write/preview tabs, and a
   dynamic step list: each row has Action (required) and Expected result (optional)
   textareas with preview toggles, drag-handle + keyboard reordering, add/insert/remove
   row. Client + server validation with inline errors.
5. **Trash view (per project).**
   Paginated, filterable (search + directory) table of trashed cases with trashed-at
   dates. Per-row actions: Restore, Delete permanently (typed confirmation). Selection
   mode identical to the repository view enables bulk Restore and bulk **Delete
   permanently** — the permanent-delete confirmation states the exact count and
   requires typing it (or the word `DELETE`) to proceed. This is deliberately the only
   place in the product where data can be destroyed.

---

## 8. Delivery milestones

Details, dependencies, and agent assignments are in `docs/TASKS.md`. Summary:

| Milestone | Outcome | Gate to next |
| --- | --- | --- |
| **M0 — Foundation** | Repo scaffold, tooling, CI, docker-compose skeleton runs "hello" app + Postgres. | CI green on PRs. |
| **M1 — Contract** | Drizzle schema + migrations + seed script; `docs/API.md` frozen. | Both agents sign off on the contract (see playbook). |
| **M2 — API** | All §6 endpoints implemented with integration tests. | Endpoint tests green; seeded curl walkthrough works. |
| **M3 — UI** | All §7 screens against the real API. | e2e smoke: create project → dir → case → edit → move → trash → restore → purge. |
| **M4 — Deploy & docs** | Production Dockerfile, compose file, `docs/SETUP.md` (incl. manual Postgres + `.env` guide), README. | A fresh machine reaches the UI following only the docs. |
| **M5 — Hardening & v0.1** | Bug bash, a11y pass, perf sanity (500 dirs / 5k cases incl. 1k trashed), tag `v0.1.0`. | Release checklist complete. |

M2 and M3 run **in parallel** after M1 — that is the whole point of freezing the
contract early: Composer builds UI against a mock/fixture layer derived from
`docs/API.md` while Grok builds the real API, then they integrate.

---

## 9. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Agents drift from the contract while working in parallel | Contract freeze at M1; any change requires a `contract-change` PR both agents review (playbook §4). |
| Bulk permanent delete destroys data unintentionally | Purge only operates on already-trashed cases; select-all confirmations state exact counts; typed confirmation; integration tests assert active cases are untouchable by purge. |
| Markdown XSS | `rehype-sanitize` strict schema; e2e test injects `<script>` and asserts inert rendering. |
| Tree/step ordering bugs (races, duplicates) | Atomic replacement in transactions; deferred unique constraints; integration tests for move/reorder/cycle cases. |
| Per-project numbering races under concurrency | Single-row atomic counter update inside the create transaction; integration test hammers concurrent creates and asserts no gaps-by-collision/duplicates. |
| Scope creep toward roadmap features (results, users, versioning) | §2 out-of-scope list is binding; PRs adding that surface area are rejected. |
| "Easy setup" claim fails in the wild | M4 gate is a literal fresh-machine walkthrough of the docs, performed by the agent that did **not** write them. |

---

## 10. Decision log & remaining open items

All previously open product questions were answered by the product owner on 2026-08-28;
the binding record is `docs/DECISIONS.md`. Summary: name finalized as **OpenTCM (Open
Test Case Manager)**; MIT license; per-project configurable prefixes; soft delete +
trash with deliberate bulk permanent deletion; pagination/filtering for large case
volumes; no login (closed networks, `.env` configuration); stack approved;
import/export deferred; search on titles/numbers for now with step-text search on the
roadmap; roadmap priorities recorded in §2.

There are no remaining open product questions. Implementation may begin at task M0-1.
