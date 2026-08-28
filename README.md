# OpenTCM (working title)

A free, open-source, self-hostable test case manager: a simple, intuitive website for
authoring and organizing test cases, backed by PostgreSQL.

**Status: planning.** Implementation has not started yet. Start here:

- [`docs/PLAN.md`](docs/PLAN.md) — product vision, scope, stack, data model, milestones.
- [`docs/AGENT_PLAYBOOK.md`](docs/AGENT_PLAYBOOK.md) — how the AI implementation agents
  (Grok 4.6 and Composer) collaborate: roles, workflow, review rules, quality bars.
- [`docs/TASKS.md`](docs/TASKS.md) — the task ledger: work breakdown with owners,
  dependencies, and acceptance criteria.

## What v1 will do

- Test cases with a title, an auto-assigned immutable number (`TC-42`), an optional
  markdown description, and ordered steps (required action, optional expected result —
  both markdown).
- A directory tree for organization: everything lives under a main directory, with
  arbitrarily nested sub-directories.
- Easy deployment: `docker compose up`, or bring your own Postgres with a copy-paste
  setup guide.

Test result reporting (manual and automated) and user accounts are deliberately deferred
to a later version — see the scope section of the plan.
