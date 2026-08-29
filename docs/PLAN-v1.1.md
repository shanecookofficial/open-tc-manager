# OpenTCM v1.1 — Auth, roles, case history, and revert

**Status:** planning. v0.1.0 (PR #1) is complete and will be merged later; this
document is the binding scope for v1.1. Implementation agents: Grok 4.6
(backend) and Composer (frontend), orchestrated per `docs/AGENT_PLAYBOOK.md`.
**Decisions:** `docs/DECISIONS.md` (2026-08-29 v1.1 entries). **Ledger:**
`docs/TASKS-v1.1.md`.

v1.1 does **not** add an identity provider, OAuth, SSO, email/SMTP, per-project
ACLs, directory-level revert, or git-like branching. It adds the minimum that a
closed-network team needs: who can do what, who changed a case, and a way to put
the case back to an earlier snapshot without erasing the timeline.

---

## 1. Goals

1. **Email + password authentication** on every page and every `/api/v1` route
   except login and health.
2. **Three roles** with instance-wide privileges (every logged-in user sees every
   project).
3. **Append-only case history.** Create, edit, move, trash, restore, and revert
   each write an event. The timeline is never rewritten or deleted by a revert.
4. **Early version control via snapshots.** Revert restores a chosen snapshot as
   the new current state and **appends** that restored state as a new event.
   Product-owner example: if the case went A → B → C and someone reverts C back
   to A, history is **A → B → C → A**.

---

## 2. Scope

### In scope

- `users` and `sessions` tables; Argon2id password hashes; httpOnly session
  cookie; logout invalidates the session row.
- Bootstrap Admin from env (`BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`)
  **only when the users table is empty**.
- Admin-provisioned accounts (email, display name, role, temporary password).
  No public registration. No password-reset email.
- Users change their own password; Admins set a new password for anyone.
- **Deactivate** users (they cannot log in). No hard-delete of user rows in
  v1.1, so history always has a stable actor id.
- Roles: **Admin**, **Member**, **Viewer** (matrix in §4).
- Per-case history API + History panel on the case detail page.
- Revert-to-snapshot from any event on that case (permission: Member+).
- Seed: optional demo users in `db:seed` (documented passwords in DEVELOPMENT.md
  only). Existing WEB/API cases are **not** backfilled with fake authors.
- Docs: SETUP (bootstrap env, closed-network login), USER_GUIDE (roles, history,
  revert), API.md contract expansion.

### Out of scope (still the later roadmap)

- Test result reporting, search by step text, import/export.
- Richer version control (branching, cherry-pick of a single field, directory
  revert).
- OAuth/SSO/SMTP, per-project roles, audit log of user-admin actions in the UI
  (server can still 204; no User History screen in v1.1).

---

## 3. Authentication (boring on purpose)

| Topic | Rule |
| --- | --- |
| Identity | Email (unique, case-insensitive) + display name + password |
| Hash | Argon2id (memory-hard; no plaintext, no reversible encryption) |
| Session | Opaque token stored hashed in `sessions`; cookie `opentcm_session` httpOnly, SameSite=Lax, Secure when `HTTPS=true` |
| Lifetime | 7 days from last authenticated request (sliding) or explicit logout |
| Health | `GET /api/v1/health` stays **unauthenticated** (Docker HEALTHCHECK) |
| Everything else | 401 `UNAUTHENTICATED` without a valid session |
| First Admin | On app boot / migrate path: if `users` is empty and both bootstrap env vars are set, create one Admin. If users is empty and env is missing, `/login` shows “ask an operator to set BOOTSTRAP_*” — no open registration. |
| Existing POC data | WEB/API seed cases remain; they have no history until someone mutates them while logged in |

Password rules: minimum 8 characters after trim. No complexity theater.

---

## 4. Roles (instance-wide)

| Capability | Viewer | Member | Admin |
| --- | --- | --- | --- |
| Log in / out, change own password | yes | yes | yes |
| Read projects, tree, cases, trash, **history** | yes | yes | yes |
| Create / edit / move / trash / restore cases | no | yes | yes |
| **Revert** a case to a history snapshot | no | yes | yes |
| Directory create / rename / move / delete | no | yes | yes |
| Bulk trash / bulk restore | no | yes | yes |
| Permanent purge | no | no | yes |
| Create / rename / delete projects, change prefix | no | no | yes |
| Create / deactivate users, set role, set password | no | no | yes |

Forbidden actions return **403 `FORBIDDEN`**. Viewers hitting write endpoints must
not leak whether a case id exists beyond the usual 404 rules (same 404/403
pattern as today for missing vs wrong project: unauthenticated is 401 first).

---

## 5. History and revert (binding)

### Event model

Table `test_case_events` (name in schema may be `test_case_history`; API says
`events`):

- `id`, `test_case_id` (FK, `ON DELETE CASCADE` — purge removes events with the
  case), `actor_id` (FK users, `ON DELETE RESTRICT` so users cannot be hard-deleted),
  `actor_email`, `actor_display_name` (copied at write time so later rename does
  not rewrite the timeline),
- `action`: `created` | `updated` | `moved` | `trashed` | `restored` | `reverted`
- `reverted_event_id` — set only when `action = reverted`; points at the event
  whose snapshot was restored
- `snapshot` JSON: `{ title, description, directoryId, steps: [{ action, expectedResult }], deletedAt }`
  — the **full case state immediately after** this event applied
- `created_at`

Bulk trash/restore: **one event per case**, same as a single-case action.

Writes that change a case (create, PUT, move, trash, restore, revert) MUST insert
the event in the **same transaction** as the mutation. A successful mutation
without a history row is a bug.

Seeded cases start with **zero** events.

### Timeline display (product)

Events are listed oldest → newest. Each row shows: relative time, actor display
name, action label, and a one-line summary (e.g. title after an update, destination
folder after a move). Expanding a row shows the snapshot (markdown-rendered steps
optional; a compact field list is enough).

**Revert C to A:** user picks event A on a case whose current snapshot is C.
Server loads snapshot A, applies it to `test_cases` + `test_steps` (+ `deleted_at`
if A was trashed/active), inserts event D with `action=reverted`,
`reverted_event_id=A`, `snapshot` = snapshot A. Timeline is A, B, C, D where D
**is** state A. The UI may label D “Reverted to this version” while still
presenting the restored content as A — the sequence the product owner required is
**A → B → C → A**.

Revert never deletes or edits events A, B, or C.

Reverting a revert is allowed (restore B after A→B→C→A yields A→B→C→A→B).

Viewer: read timeline, no Revert button. Member/Admin: Revert with a confirm
dialog naming the target event’s time and actor.

### Out of history

Directory/project/user-admin actions are not in this timeline. Permanent purge
destroys the case and its events (CASCADE). There is no tombstone list of purged
cases in v1.1.

---

## 6. Data model (additions)

```sql
CREATE TABLE users (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         TEXT NOT NULL,          -- stored lowercased; UNIQUE
  display_name  TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 80),
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'member', 'viewer')),
  deactivated_at TIMESTAMPTZ,         -- NULL = can log in
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (email)
);

CREATE TABLE sessions (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL UNIQUE,   -- SHA-256 of the cookie value
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON sessions (user_id);
CREATE INDEX ON sessions (expires_at);

CREATE TABLE test_case_events (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  test_case_id       BIGINT NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
  actor_id           BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_email        TEXT NOT NULL,
  actor_display_name TEXT NOT NULL,
  action             TEXT NOT NULL CHECK (action IN (
                       'created','updated','moved','trashed','restored','reverted')),
  reverted_event_id  BIGINT REFERENCES test_case_events(id) ON DELETE RESTRICT,
  snapshot           JSONB NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON test_case_events (test_case_id, created_at);
```

`reverted_event_id` must belong to the **same** `test_case_id` (enforced in
application code; optional CHECK via trigger if cheap).

---

## 7. API additions (contract summary)

Full schemas land in `docs/API.md` in task A1-2 (freeze). Summary:

| Method & path | Who | Purpose |
| --- | --- | --- |
| `POST /api/v1/auth/login` | public | `{ email, password }` → Set-Cookie + `{ user }` |
| `POST /api/v1/auth/logout` | any auth | clear cookie, delete session |
| `GET /api/v1/auth/me` | any auth | current user |
| `POST /api/v1/auth/password` | any auth | change own password `{ currentPassword, newPassword }` |
| `GET/POST /api/v1/users` | Admin | list / create `{ email, displayName, role, password }` |
| `PATCH /api/v1/users/:id` | Admin | displayName, role, deactivate (`deactivatedAt`), setPassword |
| `GET /api/v1/test-cases/:id/events` | any auth | oldest-first timeline (paginated if needed; default all, cap 500) |
| `POST /api/v1/test-cases/:id/revert` | Member+ | `{ eventId }` restore that event’s snapshot; 201 event + case |

Existing case/directory/project routes: require session; enforce §4. Error codes
added: `UNAUTHENTICATED`, `FORBIDDEN`, `INVALID_CREDENTIALS`, `USER_DEACTIVATED`,
`EMAIL_TAKEN`. Revert of unknown/`wrong-case` event: `404` / `409`.

---

## 8. UI

1. **`/login`** — email, password, error for bad credentials / deactivated.
   Unauthenticated visits to any other page redirect here with `next=` return
   path. Authenticated visit to `/login` redirects to `/`.
2. **Header** — display name, role badge, Log out. Admin: “Users” link.
3. **Users (Admin)** — table of users; create dialog; deactivate / reactivate;
   set password; change role. Cannot deactivate the last remaining Admin.
   Cannot deactivate yourself if you are the last Admin.
4. **Case detail — History** — timeline §5; Revert (Member+) with confirm.
5. **Role-aware chrome** — hide New case, Select, directory write actions,
   project settings, purge for roles that cannot use them (still 403 if called).

---

## 9. Docs & bootstrap

- `.env.example`: `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`, `HTTPS`.
- SETUP.md: first boot with bootstrap env; then **unset the password env** (or
  leave it — bootstrap is a no-op once any user exists); login; create Members.
- USER_GUIDE: roles, history, revert example (A→B→C→A).
- Security note stays: this is still a closed-network app; basic auth is not a
  substitute for putting the host on a trusted LAN.

---

## 10. Milestones

See `docs/TASKS-v1.1.md`. Short version:

| Milestone | Outcome |
| --- | --- |
| **A1 — Contract** | Migration `0001_auth_history.sql`; API.md + Zod freeze |
| **A2 — Auth API** | Login/session/users/RBAC on all existing routes |
| **A3 — History API** | Event writes on mutations; list; revert A→B→C→A test |
| **A4 — UI** | Login, header session, users admin, history/revert |
| **A5 — Docs & harden** | SETUP/USER_GUIDE, e2e gate (login → edit → revert), axe |

A2 and A3 are Grok; A4 is Composer after A1 freeze (can start login shell against
fixtures if freeze is done before A2 lands). A3 should land before Composer wires
History to the live API.
