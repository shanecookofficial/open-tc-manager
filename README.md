# OpenTCM — Open Test Case Manager

OpenTCM (**Open Test Case Manager**) is a free, open-source, self-hostable test case
manager: a simple, intuitive website for authoring and organizing test cases, backed
by PostgreSQL. MIT licensed.

**Status: planning.** Implementation has not started yet. Start here:

- [`docs/PLAN.md`](docs/PLAN.md) — product vision, scope, stack, data model, milestones.
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — binding product decisions from the product owner.
- [`docs/AGENT_PLAYBOOK.md`](docs/AGENT_PLAYBOOK.md) — how the AI implementation agents
  (Grok 4.6 and Composer) collaborate: roles, workflow, review rules, quality bars.
- [`docs/TASKS.md`](docs/TASKS.md) — the task ledger: work breakdown with owners,
  dependencies, and acceptance criteria.

## What v1 will do

- **Projects with configurable case-number prefixes**: each project gets its own prefix
  (e.g. `WEB`, `API`) and its own immutable, never-reused numbering (`WEB-42`).
- Test cases with a title, an auto-assigned number, an optional markdown description,
  and ordered steps (required action, optional expected result — both markdown).
- A directory tree per project: everything lives under a main directory, with
  arbitrarily nested sub-directories.
- **Safe deletion**: deleting a case moves it to a per-project trash. Permanent
  deletion happens only from the trash — per case or in bulk via checkbox selection
  with select-all — always behind a typed confirmation. Paginated, filterable lists
  keep this workable at thousands of cases.
- Easy deployment: `docker compose up`, or bring your own Postgres with a copy-paste
  setup guide and a plain `.env` file. No login — v1 is built for closed/trusted networks.

## Roadmap (deliberately not in v1)

In priority order: users with per-case change history, test result reporting (manual
and automated), search by step text, import/export, and test case version control.
