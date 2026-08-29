# Task Ledger — v1.1 (auth, history, revert)

Work breakdown for OpenTCM v1.1. Binding scope: `docs/PLAN-v1.1.md`. v0.1.0
ledger remains in `docs/TASKS.md` (all done). Playbook: `docs/AGENT_PLAYBOOK.md`.
Decisions: `docs/DECISIONS.md`.

**Status values:** `todo` · `in-progress` · `blocked` · `review` · `done`

---

## A1 — Contract (freeze before A2/A4 fan-out)

### A1-1 · Schema & migration `0001`

- **Owner:** Grok 4.6 · **Status:** done · **Needs:** —
- Drizzle tables `users`, `sessions`, `test_case_events` exactly per PLAN-v1.1 §6.
  Forward-only SQL migration (do **not** edit `0000_init.sql`).
- **Accept:** migration applies on top of v0.1.0 schema; uniqueness of lowercased
  email; `ON DELETE RESTRICT` from events → users; `ON DELETE CASCADE` events with
  cases; integration tests for those FKs.

### A1-2 · API contract expansion

- **Owner:** Grok 4.6 · **Status:** done · **Needs:** A1-1
- Update `docs/API.md` + Zod in `src/lib/contracts/` for auth, users, events,
  revert, new error codes, and “all other routes require a session.” Fixtures:
  sample users + a 4-event timeline A→B→C→A.
- **Accept:** Composer review **is** the freeze (set status `review` until then).

---

## A2 — Auth API (Grok)

### A2-1 · Login, session, me, password, bootstrap

- **Owner:** Grok 4.6 · **Status:** done · **Needs:** A1-2
- Argon2id; session cookie; bootstrap Admin when users empty; deactivated users
  cannot log in; health remains public.
- **Accept:** integration tests: happy login, bad password, deactivated, logout
  invalidates cookie, bootstrap once-only, change-own-password.

### A2-2 · User admin endpoints + RBAC wrapper

- **Owner:** Grok 4.6 · **Status:** done · **Needs:** A2-1
- Users CRUD-ish per PLAN-v1.1 §7; last-Admin protection; wrap all existing
  `/api/v1` routes (except login + health) with session + role checks per §4.
- **Accept:** Viewer gets 403 on POST case; Member 403 on purge and POST /users;
  Admin can deactivate a Member; cannot deactivate last Admin.

---

## A3 — History API (Grok)

### A3-1 · Record events on every case mutation

- **Owner:** Grok 4.6 · **Status:** done · **Needs:** A2-1
- Same transaction as create/PUT/move/trash/restore and bulk per-case. Snapshot
  shape per PLAN-v1.1 §5. Actor denormalized from the session user.
- **Accept:** integration: create→one `created` event; PUT→`updated`; move→`moved`;
  trash/restore; bulk trash writes N events; Viewer/Member actor recorded.

### A3-2 · List events + revert

- **Owner:** Grok 4.6 · **Status:** done · **Needs:** A3-1
- GET timeline oldest-first. POST revert applies snapshot, appends `reverted`
  event. **Binding test:** mutate A→B→C, revert to A, GET events snapshots equal
  A,B,C,A (fourth snapshot deep-equals first); events A–C unchanged.
- **Accept:** that test plus revert of unknown event 404; Viewer 403 on revert;
  revert of a revert allowed.

---

## A4 — UI (Composer)

### A4-1 · Login, session chrome, route guard

- **Owner:** Composer · **Status:** done · **Needs:** A1-2
- `/login`; redirect unauthenticated users; header name/role/logout; api-client
  sends cookies. Playwright: login → repository; logout → login page.
- **Accept:** e2e green against live API once A2-1 exists; until then fixtures
  only if A2 is not yet merged — prefer live API (sequential, like v1).

### A4-2 · Users admin (Admin)

- **Owner:** Composer · **Status:** done · **Needs:** A4-1, A2-2
- Users table and dialogs per PLAN-v1.1 §8. Hide Users link for non-Admin.
- **Accept:** Playwright as Admin: create Member, deactivate, Member cannot open
  `/users` (redirect or 403 page).

### A4-3 · History panel + revert

- **Owner:** Composer · **Status:** done · **Needs:** A4-1, A3-2
- Case detail History: A→B→C→A readable; Revert confirm; Viewers see history
  without Revert. Hide write chrome for Viewer.
- **Accept:** Playwright Member: edit twice (A→B→C), revert to first snapshot,
  timeline shows four events and case body matches A.

### A4-4 · Role-aware repository chrome

- **Owner:** Composer · **Status:** done · **Needs:** A4-1, A2-2
- Viewer: no New case, Select, directory write, purge, project create. Member: no
  purge, no project settings, no Users.
- **Accept:** Playwright Viewer cannot submit create case (no button + API 403 if
  forced).

---

## A5 — Docs, seed, harden

### A5-1 · Seed demo users + docs

- **Owner:** Composer · **Status:** done · **Needs:** A1-1
- Idempotent seed users (e.g. admin@opentcm.local / documented password) **only
  if no users exist** OR skip when bootstrap env already created Admin — pick one
  strategy, document it, do not duplicate Admins. SETUP.md, USER_GUIDE.md,
  `.env.example`, DEVELOPMENT.md, README roadmap line for v1.1.
- **Accept:** adversarial pass: Grok follows SETUP login path verbatim (A5-2).

### A5-2 · Adversarial docs + e2e gate

- **Owner:** Grok 4.6 · **Status:** todo · **Needs:** A4-3, A5-1
- Walk SETUP bootstrap+login; full e2e: bootstrap/login → create case → edit →
  revert → A→B→C→A assertion. Bug-bash: last-Admin, deactivated login, CSRF not
  in scope (SameSite cookie). Flip any leftover A* tasks if already done.
- **Accept:** e2e gate green; SETUP walkthrough needs no undocumented steps.

---

## Suggested order

```
A1-1 → A1-2 (freeze)
  ├─ Grok: A2-1 → A2-2
  │         A3-1 → A3-2 ─┐
  └─ Composer: A4-1 (after freeze; live API after A2-1)
               A4-2 (needs A2-2)  A4-3 (needs A3-2)  A4-4
                                    A5-1 (after A1-1, polish after UI)
                                         └→ A5-2
```
