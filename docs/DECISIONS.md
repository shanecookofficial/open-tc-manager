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
