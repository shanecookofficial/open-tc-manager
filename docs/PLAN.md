# OpenTCM — Product & Delivery Plan

**Working title:** OpenTCM (Open Test Case Manager) — placeholder pending a real name.
**Status:** v1 planning. This document is the source of truth for scope and architecture decisions.
**Audience:** The AI implementation agents (Grok 4.6 and Composer), human maintainers, and contributors.

---

## 1. Vision

A free, open-source, self-hostable test case manager that anyone can deploy and use in
minutes. It does one thing well in v1: **authoring and organizing test cases**. It is a
deployable website backed by PostgreSQL, with setup instructions simple enough for a
non-DBA to follow.

### Guiding principles

1. **Simple over powerful.** Every screen should be understandable without a manual.
2. **Zero-friction setup.** One `docker compose up` path, and one "bring your own
   Postgres" path with copy-paste instructions.
3. **Markdown everywhere it matters.** Descriptions, steps, and expected results render
   markdown so teams can write rich, precise instructions.
4. **Boring, proven technology.** No exotic dependencies; contributors should feel at home.

---

## 2. Scope

### In scope (v1)

- Create, read, update, and delete **test cases**.
- Test cases have:
  - a **title** (required),
  - a **case number** (required, auto-assigned, human-facing, e.g. `TC-42`),
  - an optional **description** (markdown),
  - an ordered list of **steps**, where each step has a required **action** (markdown)
    and an optional **expected result** (markdown).
- A **directory tree** for organization: all cases live under an implicit main (root)
  directory; teams may create arbitrarily nested sub-directories and move cases and
  directories around.
- A clean, intuitive web UI: tree navigation, case list, case detail with rendered
  markdown, and a case editor with live markdown preview.
- **PostgreSQL** persistence with automated migrations.
- First-class **setup documentation**: Docker Compose quickstart and a manual Postgres
  configuration guide.
- Seed/demo data so a fresh install isn't an empty void.

### Explicitly out of scope (v1) — planned for later

- Test **runs / results** (manual or automated reporting), pass/fail history.
- **Users, authentication, roles, permissions.** v1 is intended to run inside a trusted
  network; there is no login.
- Integrations (Jira, CI systems), webhooks, API tokens.
- Attachments / image uploads (markdown may reference images by URL).
- Versioning/history of test cases, comments, tags, custom fields.

Out-of-scope items must not leak complexity into v1, but the schema should not paint us
into a corner (see §5 notes on future-proofing).

---

## 3. Personas & core user journeys

- **QA engineer (primary):** writes and maintains test cases daily. Needs fast case
  creation, keyboard-friendly step editing, markdown for precision.
- **Developer:** occasionally reads a case to reproduce a scenario. Needs fast search of
  titles/numbers and legible rendering.
- **Team lead / admin-ish person:** sets up the instance, organizes the directory tree.

Core journeys that must be excellent:

1. Deploy the app and reach a working UI in under 10 minutes.
2. Create a directory, create a test case with 5 steps, and read it back — all in under
   2 minutes with no documentation.
3. Reorganize: move a case (or a whole directory) to another directory without breaking
   its case number.

---

## 4. Technology stack (decision)

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
| License | MIT (pending confirmation, see open questions) | Maximally permissive for adoption. |

All API access goes through JSON REST endpoints under `/api/v1/*` (not server actions),
so the API doubles as a public automation surface later (e.g. automated result
reporting in v2 will need it anyway).

---

## 5. Data model

Three tables. The root ("main directory") is **implicit**: `directory_id = NULL` means
the case lives at the root; `parent_id = NULL` means the directory is a top-level child
of the root.

```sql
-- directories: arbitrarily nested folders for organizing cases
CREATE TABLE directories (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  parent_id   BIGINT REFERENCES directories(id) ON DELETE CASCADE,  -- NULL = child of root
  name        TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (parent_id, name)   -- sibling names unique, incl. at root
);

-- test_cases: the core entity
CREATE TABLE test_cases (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_number  INTEGER NOT NULL UNIQUE,           -- human-facing, rendered as "TC-<n>"
  title        TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  description  TEXT,                              -- optional, markdown
  directory_id BIGINT REFERENCES directories(id) ON DELETE RESTRICT, -- NULL = root
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE SEQUENCE case_number_seq;  -- assigned at creation, never reused, never renumbered

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

- **Case numbers are immutable and global.** Assigned from `case_number_seq` on create,
  displayed as `TC-<n>`. Moving a case between directories never changes its number.
  Deleting a case never frees its number for reuse.
- **Steps are replaced atomically.** The update-case endpoint accepts the full ordered
  step list and replaces it in one transaction (deferred unique constraint makes
  reordering safe). A case may have zero steps while being drafted, but the UI nudges
  toward at least one.
- **Directory deletion** requires the directory to be empty of test cases (recursively),
  or the client passes an explicit `mode`: `delete_contents` (cascade cases too) or
  `move_contents_to_parent`. Empty sub-directories cascade.
- **Cycle prevention:** moving a directory under its own descendant is rejected server-side.
- **Markdown** is stored raw; rendering + sanitization happen client-side with a strict
  allowlist (no raw HTML pass-through, no scripts).
- **Concurrency:** last-write-wins in v1, with `updated_at` returned so a stale-write
  warning can be added later.
- **Future-proofing (do not build, just don't block):** `test_cases.id` is separate from
  `case_number` so runs/results tables in v2 can FK to `id`; all timestamps exist so
  history features can be layered on.

---

## 6. API surface (contract summary)

All endpoints return JSON, use Zod-validated bodies, and share an error envelope
`{ "error": { "code": string, "message": string } }`. The full request/response schemas
live in `docs/API.md` (task M1-2) and are the contract both agents build against.

| Method & path | Purpose |
| --- | --- |
| `GET /api/v1/tree` | Full directory tree with per-directory case counts (drives the sidebar). |
| `POST /api/v1/directories` | Create directory (`name`, optional `parentId`). |
| `PATCH /api/v1/directories/:id` | Rename and/or move (`name?`, `parentId?` — `null` = root). |
| `DELETE /api/v1/directories/:id?mode=...` | Delete per the rules in §5. |
| `GET /api/v1/test-cases?directoryId=&q=&page=` | List cases in a directory (or root); `q` searches title + `TC-` number. |
| `POST /api/v1/test-cases` | Create case with steps (`title`, `description?`, `directoryId?`, `steps[]`). |
| `GET /api/v1/test-cases/:id` | Full case incl. ordered steps. Also resolvable by number: `GET /api/v1/test-cases/number/:n`. |
| `PUT /api/v1/test-cases/:id` | Full update: metadata + atomic step-list replacement. |
| `PATCH /api/v1/test-cases/:id/move` | Change `directoryId` only. |
| `DELETE /api/v1/test-cases/:id` | Hard delete (UI confirms first). |
| `GET /api/v1/health` | DB connectivity check for deploy verification. |

---

## 7. UI (v1 screens)

Single-page-app feel, three main surfaces. Design language: clean, dense-but-breathable,
light theme first, responsive down to tablet.

1. **Repository view (home).**
   Left: collapsible directory tree ("All test cases" root, folders with counts, context
   actions: new folder, rename, move, delete). Right: case list for the selected
   directory — `TC-n`, title, step count, updated date — with a search box (title/number)
   and a "New test case" button.
2. **Case detail view** (`/cases/TC-42`).
   Title, number, breadcrumb path, rendered markdown description, and a two-column
   steps table (`#` | Action | Expected result) with markdown rendered in cells.
   Actions: Edit, Move, Delete (confirm dialog).
3. **Case editor** (create + edit share one form).
   Title field, directory picker, markdown description with write/preview tabs, and a
   dynamic step list: each row has Action (required) and Expected result (optional)
   textareas with preview toggles, drag-handle reordering, add/insert/remove row.
   Client + server validation with inline errors.

Empty states, loading skeletons, and error toasts are required for all three surfaces —
"simple yet intuitive" dies in the edge cases.

---

## 8. Delivery milestones

Details, dependencies, and agent assignments are in `docs/TASKS.md`. Summary:

| Milestone | Outcome | Gate to next |
| --- | --- | --- |
| **M0 — Foundation** | Repo scaffold, tooling, CI, docker-compose skeleton runs "hello" app + Postgres. | CI green on PRs. |
| **M1 — Contract** | Drizzle schema + migrations + seed script; `docs/API.md` frozen. | Both agents sign off on the contract (see playbook). |
| **M2 — API** | All §6 endpoints implemented with unit/integration tests. | Endpoint tests green; seeded curl walkthrough works. |
| **M3 — UI** | All §7 screens against the real API. | e2e smoke: create dir → create case → edit → move → delete. |
| **M4 — Deploy & docs** | Production Dockerfile, compose file, `docs/SETUP.md` (incl. manual Postgres guide), README. | A fresh machine reaches the UI following only the docs. |
| **M5 — Hardening & v0.1** | Bug bash, a11y pass, perf sanity (500 dirs / 5k cases), tag `v0.1.0`. | Release checklist complete. |

M2 and M3 run **in parallel** after M1 — that is the whole point of freezing the
contract early: Composer builds UI against a mock/fixture layer derived from
`docs/API.md` while Grok builds the real API, then they integrate.

---

## 9. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Agents drift from the contract while working in parallel | Contract freeze at M1; any change requires a `contract-change` PR both agents review (playbook §4). |
| Markdown XSS | `rehype-sanitize` strict schema; e2e test injects `<script>` and asserts inert rendering. |
| Tree/step ordering bugs (races, duplicates) | Atomic replacement in transactions; deferred unique constraints; integration tests for move/reorder/cycle cases. |
| Scope creep toward v2 (results, users) | §2 out-of-scope list is binding; PRs adding v2 surface area are rejected. |
| "Easy setup" claim fails in the wild | M4 gate is a literal fresh-machine walkthrough of the docs, performed by the agent that did **not** write them. |

---

## 10. Open questions for the product owner

Defaults are chosen so work can proceed; answers override them.

1. **Name & branding** — "OpenTCM" is a placeholder. Any preferred name (repo will be
   renamed accordingly)? *Default: keep placeholder until v0.1.*
2. **License** — MIT assumed. Confirm, or prefer Apache-2.0/AGPL? *Default: MIT.*
3. **Case number format** — global sequence rendered `TC-42`. Good, or do you want a
   configurable prefix (e.g. per top-level directory) in v1? *Default: fixed global `TC-`.*
4. **Delete semantics** — v1 hard-deletes cases after a confirm dialog (numbers never
   reused). Acceptable, or do you want soft-delete/archive in v1? *Default: hard delete.*
5. **Unauthenticated v1** — no users means no login; v1 assumes deployment inside a
   trusted network. Acceptable? *Default: yes, with a prominent README warning.*
6. **Stack sign-off** — any objection to Next.js/TypeScript/Drizzle (§4)? *Default: proceed.*
7. **Import/export** — JSON export of a directory subtree is cheap and helps adoption;
   in v1 or defer? *Default: defer to v1.1.*
8. **Search depth** — v1 searches title + case number only (not step text). Sufficient
   for v1? *Default: yes; full-text search of steps in v1.1 via Postgres `tsvector`.*
