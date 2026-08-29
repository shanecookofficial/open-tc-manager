# Decision Log

Append-only. One dated entry per decision that outlives a single PR. Agents: add an
entry whenever you make a call another agent (or future contributor) would otherwise
have to rediscover.

---

**2026-08-28 — Product owner decisions (round 1).** The open questions in the initial
plan were answered as follows, and the plan was updated to match:

1. **Name:** "OpenTCM" is taken ([arXiv:2504.20118](https://arxiv.org/abs/2504.20118)).
   New working title **TestTrove** after collision checks ruled out CaseTree, TestHive,
   and CaseForge (all existing products/components). Owner may still override before v0.1.
2. **License:** **MIT.** Owner requirements: no liability exposure, anyone may use it.
   MIT's warranty/liability disclaimer plus maximal permissiveness fits.
3. **Case numbering:** **Configurable prefix per project is a must.** Introduced a
   `projects` entity owning a unique, editable prefix and a per-project number counter.
   Numbers are per-project, immutable, never reused; display IDs are `<PREFIX>-<n>`.
4. **Deletion:** **Soft delete + Trash.** Deleting a case trashes it. Permanent
   deletion happens only from the trash, individually or in bulk via an explicit
   selection mode (button reveals checkboxes; select-all covers everything matching
   the current filter), always behind a typed/strong confirmation. Because projects may
   hold thousands of cases, all case listings (main and trash) get server-side
   pagination and filtering.
5. **Auth:** No login in v1; product targets closed networks; configuration via
   environment variables / `.env` file. **Users + per-case change history are the top
   roadmap priority** for a later version; test case version control is desired but
   acknowledged as furthest out.
6. **Stack:** Next.js / TypeScript / Drizzle / PostgreSQL approved as proposed.
7. **Import/export:** deferred (roadmap).
8. **Search:** titles + case numbers in v1; **search by step text is a confirmed
   roadmap item** (planned via Postgres full-text search).

---

**2026-08-28 — Product owner decision (round 2): name is OpenTCM, final.** The owner
reconsidered and chose to keep **OpenTCM (Open Test Case Manager)** despite the acronym
appearing in a research paper ([arXiv:2504.20118](https://arxiv.org/abs/2504.20118)):
this is a non-commercial open-source project in a different domain, nothing is being
sold, and the README and user-facing surfaces spell out "Open Test Case Manager" to
avoid confusion. This supersedes the "TestTrove" working title from round 1. The name
question is closed; no open product questions remain.

---

**2026-08-28 — Schema mapping (M1-1).** PLAN §5 is implemented in
`src/lib/db/schema.ts` with a plain-SQL migration in `drizzle/0000_init.sql`.
IDs are PostgreSQL `BIGINT GENERATED ALWAYS AS IDENTITY`, mapped in Drizzle as
`bigint({ mode: "number" })` so JSON APIs can use numbers rather than BigInt.
`projects.next_case_number` is a counter column (atomic `UPDATE … RETURNING`);
no Postgres sequence is used for case numbers. The only schema.ts ↔ SQL
divergence is `UNIQUE (test_case_id, position) DEFERRABLE INITIALLY DEFERRED`
on `test_steps`: drizzle-orm 0.45 cannot emit `DEFERRABLE`, so that clause is
a hand-edit of the generated migration. `UNIQUE NULLS NOT DISTINCT` on
directories, prefix/length CHECKs, cascades, and `ON DELETE SET NULL` are all
expressed in schema.ts and emitted by drizzle-kit.

---

**2026-08-28 — API contract freeze candidate (M1-2).** `docs/API.md` plus
`src/lib/contracts/` are the interface Composer mocks and Grok implements.
Choices worth not rediscovering:

- JSON ids are numbers (`bigint({ mode: "number" })`).
- Bulk trash/restore require `projectId` _plus_ the XOR envelope
  `{ ids } | { all: true, filter? }`; purge takes the XOR envelope only
  because the project is in the URL. `ids` and `all` together is invalid.
- `directoryId` omitted = whole project; JSON/`query` null = root only;
  a number = that folder, non-recursive.
- GET-by-id and GET-by-display-number return trashed cases (`deletedAt`
  set); list endpoints do not. Permanent delete of a non-trashed case is
  `409 CASE_NOT_TRASHED`.
- PUT replaces steps atomically; request steps have no ids; step ids are
  not stable across PUT. Zero steps are allowed.
- Prefix change has no confirm flag in the API (UI warning only).
- Directory `trash_contents` leaves contained cases trashed at root
  (folders are gone). `move_contents_to_parent` does not move already-
  trashed cases (they SET NULL and restore to root).
- Bulk success body is `{ count }`. Directory delete returns 200 with
  counts; project/permanent-case delete return 204.
- Error codes are a closed enum (see API.md §1.3) inside
  `{ error: { code, message } }` — no `details` array in v1.

---

**2026-08-28 — API foundation (M2-1).** Route handlers live under
`src/app/api/v1/` and share `apiHandler` (`src/lib/api/handler.ts`): Zod
parses params/query/body, the handler returns a `Response`, and thrown
`ApiError`s become `{ error: { code, message } }`. Zod failures use the
first issue as `fieldPath: message` (e.g. `title: …`, `steps.0.action: …`)
so the UI can map them; there is still no `details` array. Empty `q` is
stripped from the query string before schema parse so it is ignored rather
than failing `min(1)`. Integration tests invoke the exported GET/POST/…
functions directly with constructed `Request` objects against live Postgres;
they do not boot `next dev`. The shared `pg` pool is closed once by
`src/zz-integration-teardown.integration.test.ts` (filename sorts last)
so multiple `*.integration.test.ts` files can share it; schema tests no
longer call `pool.end()` themselves.

---

**2026-08-28 — Project numbering (M2-2).** Case numbers are allocated by
`allocateCaseNumber` (`src/lib/api/numbering.ts`): `UPDATE projects SET
next_case_number = next_case_number + 1 … RETURNING` inside the caller's
transaction. The row lock serializes concurrent creates; a rollback also
rolls back the counter, so failed creates do not burn numbers. Prefix
and name clashes map from Postgres unique violations
(`projects_prefix_unique` → `PREFIX_TAKEN`, `projects_name_unique` →
`NAME_TAKEN`) rather than a pre-check, so the unique index is the source
of truth under races.

---

**2026-08-28 — Directory tree & delete modes (M2-3).** Cycle detection
walks from the proposed parent up to root; if the moving directory is
seen, the request is `CYCLE_DETECTED` (covers self and any descendant).
Subtree membership is computed in memory (`collectSubtreeIds`) from the
project's directory rows. `trash_contents` soft-deletes active cases in
the subtree then deletes the folder so `ON DELETE SET NULL` leaves those
cases trashed at root. `move_contents_to_parent` reparents immediate
child folders and direct _active_ cases; already-trashed cases stay put
and become root via SET NULL. Sibling-name collisions abort the
transaction with `SIBLING_NAME_TAKEN`.

---

**2026-08-28 — Test case writes & search (M2-4).** `PUT /test-cases/:id`
replaces steps by deleting and re-inserting in one transaction (new step
ids, positions `1…n`). Search `q` is a case-insensitive substring of
`title` or the computed `prefix-caseNumber` display id (`position(lower(q)
in lower(…))`), so `WEB-7` / `web-7` / partial titles all work. List
filters treat an unknown `directoryId` as `404`; create/update/move of a
case into another project's folder is `409 CROSS_PROJECT`. GET-by-id and
GET-by-display-number return trashed rows (`deletedAt` set); list/search
do not.

---

**2026-08-28 — Bulk trash/restore/purge (M2-5).** Bulk `{ ids }` loads
every id first and rejects the whole transaction on the first missing,
wrong-project, or wrong-state row (`404` / `409`) so no partial updates
occur. `{ all: true, filter }` never enumerates ids from the other
scope: bulk-trash queries `deleted_at IS NULL`; bulk-restore and purge
query `deleted_at IS NOT NULL`. Purge's DELETE also includes
`deleted_at IS NOT NULL` as a second guard so an active case cannot be
removed even if targeting were wrong. Restore (single and bulk) keeps
`directoryId` when that folder still belongs to the project, otherwise
null (root).

---

**2026-08-28 — UI data fetching (M3-2).** Client components call the live
REST API via `src/lib/api-client/` (typed `fetch` + Zod response parse).
A small `useAsyncData` hook (`src/hooks/use-async-data.ts`) refetches when
query-key deps change (SWR-style, no extra library). Server components that
need initial data import `@/lib/api/*` directly (same serializers as the
HTTP layer) because relative `fetch` has no origin during RSC render.
Repository filters live in URL search params (`dir`, `q`, `page`,
`pageSize`) for deep links and Playwright stability.

---

**2026-08-28 — M5-1 API bug bash (Grok 4.6).** Attacks against the data
layer and the fixes / explicit deferrals:

1. **Postgres constraint races map to the contract envelope.** Uncaught
   CHECK (`23514`), foreign-key (`23503`), and unique (`23505`) failures
   used to become `500 INTERNAL_ERROR`. `toErrorResponse` now maps them
   through `mapPgConstraintError` so whitespace that slips past Zod, a
   create-into-a-just-deleted-folder FK, or a sibling-name race is
   `400` / `404` / `409` with a closed error code. Call sites still throw
   more specific messages when they catch the same constraint first.

2. **Row locks for last-write-wins.** `PUT /test-cases/:id` takes
   `SELECT … FOR UPDATE` on the case row so parallel step replacements
   cannot interleave inserts (mixed/duplicated positions → unique
   violation → 500). Directory create/rename/move/delete and case create
   lock the **project** row first so tree mutations and create-into-folder
   serialize; a mid-chain move under a descendant stays `CYCLE_DETECTED`
   without a cycle slipping through. Bulk-trash `{ all }` UPDATE is
   guarded with `deleted_at IS NULL`. Bulk-restore `{ all }` skips rows
   another client already restored rather than failing the whole batch;
   bulk `{ ids }` still 409s on wrong state.

3. **Unknown `/api/v1` paths** return the JSON `404 NOT_FOUND` envelope
   via `src/app/api/v1/[...path]/route.ts` (documented in API.md §1.9).
   Malformed JSON is `400 VALIDATION_ERROR`. JSON bodies are parsed even
   when `Content-Type` is omitted.

4. **Seed re-run message.** The log line counted as "N new case(s)" and
   was easy to misread against the total `test_cases` row count on a
   no-op re-run. `runSeed()` now returns `{ insertedCases, skippedCases }`
   and prints `inserted 0 case(s), 18 already present`. Insert also treats
   `(project_id, case_number)` unique violations as "already present" so
   a lookup miss cannot crash or double-insert.

5. **Failed creates do not burn case numbers.** Allocation happens inside
   the create transaction after validation/FK checks; a `400`/`404` never
   touches `next_case_number`, and a CHECK/insert failure rolls the
   counter back with the transaction. This reaffirms the M2-2 decision;
   burning is **not** acceptable in v1.

6. **Prefix change vs GET-by-display-number.** Contract (API.md §2 PATCH
   - §4 GET-by-number): lookup is against the **current** `projects.prefix`.
     After `WEB` → `WEBX`, `GET …/number/WEB-n` is 404 and `WEBX-n` returns
     the same row. Stored `caseNumber` is unchanged.

**Explicit v1 deferrals (not data-loss):**

- **Restore-to-root toast / original directory (v1.1).** After
  `ON DELETE SET NULL`, trash summaries only have `directoryId: null`,
  so the UI cannot distinguish "was always at root" from "folder was
  deleted". Telling those apart requires persisting an original-directory
  snapshot (schema + contract). Restore _destination_ is already correct
  (root fallback). The UI heuristic in `trash-view.tsx` that tries to
  phrase "original folder no longer exists" is therefore wrong whenever
  `dirId` is already null — Composer should not treat that copy as
  accurate until v1.1 grows the snapshot. No contract addition in v1.

- **JSON body on HTTP 405 (v1.1).** Next.js returns native `405` with an
  `Allow` header for methods a route file does not export. Wrapping every
  route with dummy methods (or adding `METHOD_NOT_ALLOWED` to the closed
  error enum) is boilerplate / a contract-change. Unknown paths are 404
  JSON regardless of method, which is the important hygiene fix.

- **`next_case_number` integer overflow (v1.1).** Counters are PostgreSQL
  `integer` (max 2_147_483_647). Overflow is not a v1 scenario; high
  values below the cap work. No bigint migration in v1.

---

**2026-08-29 — Unsaved editor changes (M5-1, Composer).** v1 uses the browser
`beforeunload` prompt when the case editor form is dirty. There is no in-app
Next.js router guard (would need a shared dirty-state context). Successful
save clears dirty state before navigation; refresh mid-edit does not auto-save
and does not crash.

**2026-08-29 — Restore toast copy (M5-1, Composer).** Trash rows only expose
`directoryId` (null after folder delete). The UI now says "restored to project
root" whenever `restored.directoryId === null`; the "original folder no longer
exists" phrase is deferred to v1.1 per the API-owner note above.

---

**2026-08-29 — v0.1.0 tagging is maintainer-side (M5-3).** The release-prep PR
does **not** create git tag `v0.1.0`. Pushing that tag triggers
`.github/workflows/docker.yml`, which publishes
`ghcr.io/shanecookofficial/opentcm:latest` and `:v0.1.0` (plus `:0.1.0` /
`:0.1`). After merge: `git tag v0.1.0 <merge-commit> && git push origin v0.1.0`.
Details in `RELEASING.md`. CI's required check remains lint/typecheck/unit/
integration/build; e2e is required in `CONTRIBUTING.md` before merge but is not
an Actions check (M0-3 scoped CI that way; Playwright stays local).

---

**2026-08-29 — v1.1 product decisions (auth, history, revert).** Binding
detail is `docs/PLAN-v1.1.md`. Summary:

1. **Auth:** email + password, Argon2id, httpOnly session cookie, 7-day sliding
   session. No OAuth, SSO, or SMTP. Closed-network product; this is not a public
   IdP. `GET /api/v1/health` stays public; every other `/api/v1` route and every
   page requires a session.
2. **Provisioning:** Admins create accounts. First Admin from
   `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` only when `users` is
   empty. Users change their own password; Admins set anyone’s password.
3. **Roles (instance-wide, all projects visible):** Admin / Member / Viewer per
   the matrix in PLAN-v1.1 §4. Purge and user/project administration are
   Admin-only. Revert is Member+.
4. **Users are deactivated, not hard-deleted,** so `test_case_events.actor_id`
   can `ON DELETE RESTRICT`. Display name + email are copied onto each event at
   write time.
5. **History + revert (PO confirmation):** snapshot-per-event, append-only.
   Reverting C back to A **restores snapshot A as current state and appends a
   new event** whose snapshot is A. Timeline is **A → B → C → A**. Events A, B,
   and C are never deleted or rewritten. This is restore-to-snapshot, not
   git-cherry-pick of a single mid-history edit. Revert-of-revert is allowed.
6. **History covers test-case mutations only** (create, update, move, trash,
   restore, revert). Bulk ops write one event per case. Purge CASCADE-deletes
   the case and its events (no tombstone UI). Seed cases are not backfilled with
   fake authors.
7. **v0.1.0 merge stays deferred**; v1.1 work lives on its own branch/PR.
