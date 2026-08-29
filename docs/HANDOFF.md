# Orchestrator Handoff — OpenTCM

**Date:** 2026-08-29
**From:** The original head-product-owner/orchestrator agent (Claude Fable 5)
**To:** The incoming orchestrator agent (Grok 4.6), working directly with the human
product owner, plus the implementation agents (a Grok 4.6 and a Composer).

Read this first, then the documents it points to. This file is the bridge between
what was built and what comes next. Keep it updated if the handoff situation changes
again; otherwise it can be deleted after v1.1 planning absorbs it.

---

## 1. What this project is

**OpenTCM — Open Test Case Manager**: free, MIT-licensed, self-hostable test case
manager. Next.js 16 (App Router) + TypeScript strict + Tailwind v4 + shadcn/ui,
Drizzle ORM on PostgreSQL 16, REST API under `/api/v1`. No authentication by design
in v1 (closed/trusted networks). The human product owner's decisions are binding and
recorded in `docs/DECISIONS.md`.

Authoritative documents, in reading order:

1. `docs/PLAN.md` — product vision, v1 scope (binding), data model, API surface, UI spec.
2. `docs/DECISIONS.md` — append-only decision log. **All product-owner rulings land here.**
3. `docs/AGENT_PLAYBOOK.md` — the two-lane collaboration protocol (roles, cross-review, quality bars).
4. `docs/TASKS.md` — the completed v1 ledger (all 24 tasks M0-1..M5-3 are `done`). Use it as the template for the v1.1 ledger.
5. `docs/API.md` — the frozen API contract. Changes require the contract-change discipline (playbook §4).
6. `docs/SETUP.md`, `docs/DEVELOPMENT.md`, `docs/USER_GUIDE.md`, `CONTRIBUTING.md`, `RELEASING.md`, `CHANGELOG.md`.

## 2. Current state (exact)

- **Branch:** `cursor/test-case-manager-plan-967e` — contains planning docs plus the
  complete v0.1.0 implementation. ~32 commits: one per ledger task, plus review-fix
  commits, plus doc fixes.
- **PR:** [#1](https://github.com/shanecookofficial/open-tc-manager/pull/1), open
  against the `plan` branch, marked **ready for review**. Body documents the full
  scope and verification.
- **Not merged, not tagged.** v0.1.0 tag is deliberately deferred to post-merge
  (tagging triggers GHCR publish — exact steps in `RELEASING.md`).
- **Verification at handoff:** lint/typecheck/build pass; **33 unit**, **91
  integration** (live Postgres), **26 Playwright e2e** (incl. full gate journey,
  XSS inertness, keyboard-only journey); axe: 0 critical/serious on all four main
  screens; perf 11–45 ms server time at 5k cases/500 dirs (200 ms budget);
  production standalone smoke passed on a fresh DB.
- **Human verification:** the PO ran the **dev** compose stack (`docker compose up`)
  on a real Docker host successfully after running the first-run migration commands
  (that gap is now documented in `docs/DEVELOPMENT.md`). The **production** compose
  path (`docker-compose.prod.yml`) has still **never been executed on a real Docker
  host** — it is desk-checked and its image builds in CI. First real run is a known
  risk; treat any failure there as a high-priority bug.

## 3. How the two-agent orchestration worked (keep doing this)

Lanes per `docs/AGENT_PLAYBOOK.md`:
- **Grok 4.6 = Backend/Architecture lane:** schema, migrations, API contract + implementation, transactional logic, integration tests. Reviews everything Composer ships.
- **Composer = Frontend/Delivery lane:** UI screens/components, forms, markdown rendering, packaging, CI, docs, seed. Reviews everything Grok ships.

Process that proved itself in v1 (recommend keeping):
1. One ledger task = one commit, conventional message ending in the task id, flipping the task's status in the ledger within the same commit.
2. **Cross-review after every milestone**, not every commit (adaptation from the per-PR review in the playbook — works better with orchestrated subagents). Reviewer runs everything, reads the whole milestone diff, and lands small fixes itself in a single `fix: address <milestone> review findings (<reviewer>)` commit; large problems go back to the author.
3. **Contract freeze before fan-out**: schema + `docs/API.md` + Zod schemas land first; the consumer lane approves them (that approval IS the freeze); implementation on both sides then proceeds against the frozen contract. This prevented all drift in v1 — zero contract deviations at M2 review.
4. **Adversarial docs gate**: the agent who did NOT write the setup docs executes them verbatim on a clean environment and treats every deviation as a defect. This found 17 defects including 3 blockers in v1. Do not skip it for any user-facing doc.
5. Every decision that outlives a PR goes in `docs/DECISIONS.md`, dated. Every deliberate non-fix is recorded there as an explicit deferral.
6. All suites green before every commit (see §5 for the suite matrix). Never commit red.

Orchestration adaptations that were made for the shared-VM reality (subagents share
one checkout, one branch): lanes ran **sequentially** (M2 API before M3 UI, so the UI
was built directly against the live API instead of fixtures — recorded in the ledger),
and the reviewer fixes small findings directly instead of a comment round-trip.

## 4. Environment setup for a fresh cloud VM

The v1 work happened on a VM that will not persist. A fresh orchestrator VM needs:

```bash
# Node 22 + npm are usually preinstalled; verify: node --version (need >= 22)

# Postgres (no Docker on these VMs):
sudo apt-get update -qq && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql postgresql-contrib
sudo service postgresql start
sudo -u postgres psql -c "CREATE USER opentcm WITH PASSWORD 'opentcm' CREATEDB;" \
                       -c "CREATE DATABASE opentcm OWNER opentcm;"

# Repo:
npm ci
cp .env.example .env   # DATABASE_URL=postgresql://opentcm:opentcm@localhost:5432/opentcm
npm run db:migrate && npm run db:seed

# Playwright (for e2e):
npx playwright install chromium --with-deps
```

Docker is NOT available on the cloud VMs — docker-compose/Dockerfile changes must be
desk-checked line by line and verified via the CI image-build job (`.github/workflows/docker.yml`
builds the image on every PR).

## 5. Suite matrix (all must be green before any commit)

| Command | What | Needs |
| --- | --- | --- |
| `npm run lint` / `npm run typecheck` / `npm run build` | static + build | — |
| `npm run test` | 33 unit tests | — |
| `npm run test:integration` | 91 API/DB tests | live Postgres, migrated |
| `npm run test:e2e` | 26 Playwright tests | Postgres + chromium; seeds + builds + standalone server itself |
| `npm run db:seed` (×2) | idempotency check | prints `inserted 0 case(s), 18 already present` on rerun |

## 6. Immediate next actions (release, before any v1.1 work)

1. PO merges [PR #1](https://github.com/shanecookofficial/open-tc-manager/pull/1).
2. PO (or orchestrator if asked) tags: `git tag v0.1.0 <merge-commit> && git push origin v0.1.0`.
3. Verify GHCR publish per `RELEASING.md` (image `ghcr.io/shanecookofficial/opentcm`,
   tags `latest`/`v0.1.0`/`0.1.0`/`0.1`; may need the GHCR package set public).
4. First real `docker compose -f docker-compose.prod.yml up` on a Docker host —
   verify migrations-on-boot, `SEED_DEMO_DATA=true` first-boot flow, restart
   persistence, and the backup/restore block from `docs/SETUP.md`.
5. GitHub housekeeping the agents could not do: mark the CI check required (branch
   protection), confirm Actions has `packages: write` allowed for the docker workflow.

## 7. Known deferrals and loose ends (fodder for v1.1 ledger)

Recorded in `docs/DECISIONS.md` unless noted:

- **Restore-toast directory snapshot**: trash rows whose folder was deleted have
  `directory_id NULL`; UI cannot distinguish "was at root" from "folder deleted".
  Needs a snapshot column or path string captured at trash time.
- **JSON 405** for wrong methods on known routes (currently Next's native 405).
- **`next_case_number` integer overflow** guard (cap 2,147,483,647 — theoretical).
- **Unsaved-changes guard is `beforeunload` only** — no in-app router guard.
- **Editor compact mode** at >40 steps drops preview tabs (perf tradeoff).
- **Playwright not run in GitHub Actions** (local requirement per CONTRIBUTING; CI
  runs lint/typecheck/unit/integration/build + docker image build). Adding an e2e CI
  job is a good early v1.1 task.
- **Search indexes**: fine at 5k cases with the existing
  `(project_id, deleted_at, directory_id)` index; revisit (likely trigram or
  tsvector) before ~50k cases or when step-text search lands.
- `docs/DEVELOPMENT.md` troubleshooting and seed sections assume the WEB/API demo —
  keep them in sync if seed content changes.

## 8. Confirmed roadmap (product owner's priority order — do not reorder without a new PO ruling)

1. **Users + per-case change history.** The PO's top priority. Schema was
   future-proofed: FK history/audit tables to `test_cases.id` (stable, never reused —
   distinct from `case_number`). Expect: users table, session/auth mechanism (PO
   accepted no-auth for v1 explicitly to defer this), append-only case-events table,
   history view per case. This is a large, contract-expanding milestone — run a full
   plan → contract-freeze → implement cycle like v1.
2. **Test result reporting** (manual + automated via the REST API — the reason the
   API is REST-first).
3. **Search by step text** (Postgres full-text/tsvector; see search-index note above).
4. **Import/export** (JSON subtree export was judged cheap and adoption-friendly).
5. **Test case version control** (PO acknowledges complexity; furthest out).

## 9. Working with this product owner

- Decisions arrive quickly and definitively; record each in `docs/DECISIONS.md` and
  fold them into `docs/PLAN.md` immediately (see the naming history there for the
  pattern: proposal → PO override → append-only log entry, never rewrite history).
- When asking the PO questions, always attach a proposed default per question so work
  is never blocked on an answer.
- The PO tests things personally (found the dev-compose migration gap within minutes
  of v0.1.0 being declared done). Assume everything you ship will be run by a human
  shortly after; keep first-run experience and error messages honest.
