# Agent Playbook — How Grok 4.6 and Composer Work Together

This document is the collaboration protocol for the AI implementation agents building
OpenTCM (Open Test Case Manager). Read `docs/PLAN.md` first; read `docs/TASKS.md` to
find your work.
Binding product decisions live in `docs/DECISIONS.md`.

---

## 1. Roles

Two agents, complementary strengths, mutual review:

- **Grok 4.6 — "Backend/Architecture" lane.**
  Owns: database schema and migrations, the API contract (`docs/API.md`), API endpoint
  implementation, transactional logic (per-project case numbering, step replacement,
  directory moves, cycle detection, directory delete modes, soft delete/restore, bulk
  trash/restore/purge), integration tests, markdown sanitization policy.
  Reviews: everything Composer ships.

- **Composer — "Frontend/Delivery" lane.**
  Owns: project scaffolding, CI pipeline, all UI screens and components (incl. project
  switcher, selection mode, and trash), forms and client-side validation, markdown
  rendering components, Docker packaging, setup and user documentation, seed/demo data
  content.
  Reviews: everything Grok ships.

Lanes are defaults, not walls. If a task blocks and the owning agent is saturated, the
other agent may pick it up — but must say so in the task log (§5) and still get review
from the other agent.

## 2. Ground rules

1. **The plan is binding.** `docs/PLAN.md` §2 scope and §5 behavioral rules are not
   negotiable inside a task. If implementation reveals a genuine problem with the plan,
   open a `plan-change` PR editing the plan itself — never silently diverge.
2. **Small PRs.** One task (or sub-task) per PR. Target < ~600 changed lines excluding
   lockfiles and generated migrations. A reviewer agent should be able to hold the whole
   diff in mind.
3. **Every PR is cross-reviewed** by the other agent before merge. Review means: run it,
   read the diff, check the task's acceptance criteria, leave comments or approve.
4. **CI must be green** (lint, typecheck, unit tests, build; e2e where present) before
   requesting review. Never merge red.
5. **No new dependencies without a one-line justification** in the PR description.
   Prefer the stack already chosen in PLAN §4.
6. **No roadmap features.** Anything touching runs/results, users/auth, change history,
   version control, step-text search, import/export, or integrations gets the PR closed
   with a pointer to PLAN §2.

## 3. Workflow per task

1. Claim the task in `docs/TASKS.md`: set `status: in-progress` and your agent name,
   commit that edit directly to `main` (it is the coordination ledger).
2. Branch: `feat/<task-id>-<slug>` (e.g. `feat/m2-3-case-endpoints`). Conventional
   commit messages (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
3. Implement to the task's **acceptance criteria** — they are the definition of done.
4. Add/adjust tests. New behavior without a test is an automatic review rejection,
   except pure-docs tasks.
5. Open the PR referencing the task id; fill in: what changed, how it was verified,
   any contract implications.
6. The other agent reviews. Address comments; reviewer merges (squash).
7. Mark the task `status: done` in `docs/TASKS.md` (same PR or immediate follow-up).

## 4. The contract and how to change it

`docs/API.md` (produced in task M1-2) is the interface between the two lanes:

- It specifies every endpoint: path, method, request schema, response schema, error
  codes — with JSON examples. Zod schemas in `src/lib/contracts/` are its executable
  twin; the doc and the schemas ship in the same PR, always in sync.
- After M1 the contract is **frozen**. Composer codes the UI against fixtures generated
  from the contract; Grok implements the endpoints to it.
- Changing it requires a PR labeled `contract-change` that updates `docs/API.md`, the
  Zod schemas, and all affected fixtures/tests in one atomic change, approved by the
  other agent. Keep these rare and small.

## 5. Communication between agents

Agents are asynchronous and share no memory. All coordination happens in-repo:

- **`docs/TASKS.md`** — the ledger: task status, owner, blockers. Update it truthfully
  and immediately; it is the only way the other agent knows what is happening.
- **PR descriptions and review comments** — design discussion happens here, attached to
  concrete diffs.
- **`docs/DECISIONS.md`** — append-only log of decisions that outlive a single PR
  (e.g. "chose deferred unique constraint for step reordering because …"). One dated
  paragraph per decision. It already holds the product owner's binding decisions.
- Never leave knowledge only in a chat transcript, commit message, or your own head.

## 6. Quality bars (apply to every PR)

- TypeScript `strict`; no `any` without an inline justification comment.
- Server-side validation on every endpoint regardless of client validation.
- All user-visible strings and screens handle: empty states, long titles (200 chars),
  markdown with tables/code blocks, and 100+ steps without breaking layout.
- Accessibility basics: semantic HTML, labeled inputs, focus management in dialogs,
  keyboard-operable tree and step reordering.
- Migrations are forward-only, plain SQL, reviewed line by line; never edit a merged
  migration.
- Seed script must remain runnable and idempotent (`npm run db:seed`).

## 7. Verification duties

- **Grok** maintains integration tests that run the API against a real Postgres
  (docker service in CI) covering: per-project numbering immutability and concurrency,
  atomic step replacement, move-with-cycle rejection, directory delete modes,
  soft-delete/restore semantics, purge safety (active cases untouchable), and search.
- **Composer** maintains the Playwright smoke suite covering the M3 gate journey
  (create project → create dir → create case with markdown steps → view rendered →
  edit/reorder → move → trash → restore → purge via typed confirm) plus an
  XSS-inertness check.
- The M4 docs gate is adversarial: **Grok**, not Composer, executes `docs/SETUP.md`
  verbatim on a clean environment and files issues for every deviation.
