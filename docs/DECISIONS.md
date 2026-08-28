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
