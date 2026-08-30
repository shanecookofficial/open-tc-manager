# OpenTCM HTTP API

**Version:** v1.1 (A1-2 freeze candidate; v1 resource JSON shapes are unchanged)  
**Base path:** `/api/v1`  
**Format:** JSON, UTF-8  
**Auth:** session cookie `opentcm_session` required on **every** route except
`POST /api/v1/auth/login` and `GET /api/v1/health`. See §1.10.

This document is the contract both agents build against. The executable twin is
`src/lib/contracts/` (Zod schemas + inferred types + `fixtures.ts`). Changing
anything here requires a `contract-change` PR that updates this file, the Zod
schemas, and the fixtures together (`docs/AGENT_PLAYBOOK.md` §4).

v1.1 **adds** auth, users, case history, and revert. Existing project /
directory / case / trash / health request and response bodies are **not**
renamed or reshaped. The only behavioral addition on those routes is that they
now require a session and enforce the role matrix in §1.11.

---

## 1. Conventions

### 1.1 IDs, numbers, timestamps

- Resource `id` values are JSON **numbers** (PostgreSQL `BIGINT IDENTITY`,
  always well inside the JS safe-integer range).
- Per-project case numbers are JSON numbers starting at `1`. They are assigned
  atomically from `projects.next_case_number` (`UPDATE … RETURNING`) and are
  **never reused**, including after trash or permanent delete.
- The human-facing identifier is `displayNumber`: `"${prefix}-${caseNumber}"`
  (e.g. `WEB-42`). It is computed on read. Editing a project's prefix
  re-renders every display number; stored `caseNumber` integers do not change.
  The API does **not** require a confirmation flag for prefix changes — the UI
  shows the warning.
- Timestamps are ISO-8601 UTC with a `Z` suffix, millisecond precision
  (`2026-08-28T12:00:00.000Z`).

### 1.2 Trimming and limits

Write endpoints persist **trimmed** strings. The database CHECKs are the
backstop; the API rejects values that would fail them.

| Field                       | Rule                                                                        |
| --------------------------- | --------------------------------------------------------------------------- |
| `name` (project, directory) | trimmed length 1–120                                                        |
| `prefix`                    | `^[A-Z][A-Z0-9]{1,9}$` (already uppercase; the server does not coerce case) |
| `title`                     | trimmed length 1–200                                                        |
| `description`               | optional; max 100 000 characters; empty / omitted → `null`                  |
| `action`                    | trimmed length ≥ 1; max 20 000                                              |
| `expectedResult`            | optional; max 20 000; empty / omitted → `null`                              |
| `steps`                     | 0–500 items; array order is 1-based `position`                              |
| `q`                         | optional search string; trimmed; max 200                                    |
| `email`                     | trimmed; stored and compared **lowercased**; valid email; max 254           |
| `displayName`               | trimmed length 1–80                                                         |
| `password`                  | trimmed length 8–256. No complexity rules.                                  |

### 1.3 Error envelope

Every error body is:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Test case 99 does not exist."
  }
}
```

`code` is one of the closed enum below. `message` is human-readable (safe to
show in a toast). There are no additional fields (`details`, `issues`, …) in
v1 — validation failures put the field name in `message`.

| HTTP | `code`                 | When                                                                                                     |
| ---- | ---------------------- | -------------------------------------------------------------------------------------------------------- |
| 400  | `VALIDATION_ERROR`     | Body, query, or path failed the Zod schema (unknown keys on strict request bodies included).             |
| 404  | `NOT_FOUND`            | Project, directory, or case does not exist.                                                              |
| 409  | `CONFLICT`             | Generic uniqueness / invariant not covered by a more specific code.                                      |
| 409  | `PREFIX_TAKEN`         | Another project already uses this prefix.                                                                |
| 409  | `NAME_TAKEN`           | Another project already uses this name.                                                                  |
| 409  | `SIBLING_NAME_TAKEN`   | A directory with this name already exists among the same parent's children (including two root folders). |
| 409  | `PROJECT_NOT_EMPTY`    | `DELETE /projects/:id` when any test case exists (active **or** trashed).                                |
| 409  | `DIRECTORY_NOT_EMPTY`  | `DELETE /directories/:id` with no `mode` while the subtree still has **active** cases.                   |
| 409  | `CYCLE_DETECTED`       | Moving a directory under itself or one of its descendants.                                               |
| 409  | `CASE_NOT_TRASHED`     | Permanent delete (single or as part of purge `ids`) targeting a case that is not in the trash.           |
| 409  | `CASE_NOT_IN_TRASH`    | Restore targeting a case that is not in the trash.                                                       |
| 409  | `CASE_ALREADY_TRASHED` | Soft-delete / bulk-trash targeting a case already in the trash.                                          |
| 409  | `CROSS_PROJECT`        | Directory or case moved/created under a parent that belongs to a different project.                      |
| 401  | `UNAUTHENTICATED`      | Protected route with a missing, expired, or unknown session cookie.                                      |
| 401  | `INVALID_CREDENTIALS`  | `POST /auth/login` when the email is unknown or the password does not match.                             |
| 403  | `FORBIDDEN`            | Valid session, but the user's role cannot perform the action (PLAN-v1.1 §4).                             |
| 403  | `USER_DEACTIVATED`     | `POST /auth/login` for a deactivated account. Wrong password on that account is still `INVALID_CREDENTIALS`. |
| 409  | `EMAIL_TAKEN`          | `POST /users` or `POST /auth/setup-admin` when that lowercased email already exists.                     |
| 403  | `SETUP_REQUIRED`       | Session is valid but the bootstrap Admin has not created their account yet. Only `/auth/me`, `/auth/logout`, and `/auth/setup-admin` are allowed. |
| 409  | `ROLE_LOCKED`          | Edit or delete the locked Admin role.                                                                    |
| 409  | `ROLE_IN_USE`          | Delete a role that still has users.                                                                      |
| 503  | `DATABASE_UNAVAILABLE` | Health check cannot reach Postgres.                                                                      |
| 500  | `INTERNAL_ERROR`       | Unexpected server failure.                                                                               |

A non-numeric `:id` path segment is `400 VALIDATION_ERROR`, not `404`.

### 1.4 Pagination envelope

Used by `GET /test-cases` and `GET /projects/:id/trash`.

Query:

| Param      | Default | Rules               |
| ---------- | ------- | ------------------- |
| `page`     | `1`     | 1-based integer ≥ 1 |
| `pageSize` | `50`    | integer 1–200       |

Success body:

```json
{
  "page": 1,
  "pageSize": 50,
  "totalItems": 12,
  "totalPages": 1,
  "items": []
}
```

- `totalPages` is `0` when `totalItems` is `0`, otherwise
  `ceil(totalItems / pageSize)`.
- A `page` past the end returns `200` with `items: []` and the real
  `totalItems` / `totalPages` (not `404`).
- **Active list sort:** `caseNumber` ascending.
- **Trash list sort:** `deletedAt` descending, then `caseNumber` ascending.

### 1.5 `directoryId` and `q` filters

On list, trash, and bulk `filter`:

- **`directoryId` omitted** — do not filter by directory (whole project).
- **`directoryId` null** — only cases at the project root
  (`directory_id IS NULL`). In a query string this is `directoryId=` (empty)
  or `directoryId=null`. In JSON bodies it is `"directoryId": null`.
- **`directoryId` a number** — only that directory. **Not recursive:** cases
  in descendant folders are not included.
- **`q`** — case-insensitive substring match against `title` **or**
  `displayNumber` (so `WEB-7`, `web-7`, and `login` all work). Empty `q` is
  ignored.

The same rules apply to bulk `{ "all": true, "filter": { … } }`. An omitted
or empty `filter` means “the whole project” (active cases for trash, trashed
cases for restore/purge).

### 1.6 Bulk-selection envelope

XOR, never both:

```json
{ "ids": [1, 2, 3] }
```

```json
{ "all": true, "filter": { "directoryId": 4, "q": "login" } }
```

- `ids` must be non-empty.
- Sending `ids` and `all` together is `400 VALIDATION_ERROR`.
- Extra keys are `400 VALIDATION_ERROR` (strict bodies).
- `{ "all": true }` with no `filter` selects everything in scope.
- **All bulk operations are transactional.** If any targeted id is missing,
  in the wrong project, or in the wrong trash state, the request fails with
  `404` / `409` and **no row is changed**.
- Bulk success body is always `{ "count": <n> }` — the number of rows
  actually updated/deleted.

`POST /test-cases/bulk-trash` and `POST /test-cases/bulk-restore` are not
project-scoped in the URL, so they require `projectId` **alongside** the XOR
envelope:

```json
{ "projectId": 1, "ids": [13, 14] }
```

```json
{ "projectId": 1, "all": true, "filter": { "q": "retired" } }
```

`POST /projects/:id/trash/purge` takes the XOR envelope only; the project
comes from the path.

### 1.7 Active vs trashed case endpoints

Unless noted, case **mutation** endpoints operate on **active** cases.

- `GET /test-cases/:id` and `GET /test-cases/number/:displayNumber` return the
  case **whether or not it is trashed** (`deletedAt` is set when it is). This
  lets `/cases/WEB-13` render a “in the trash” banner.
- `GET /test-cases` returns only active cases.
- `GET /projects/:id/trash` returns only trashed cases.
- `PUT`, `PATCH …/move`, and `DELETE` (soft) on a trashed case →
  `409 CASE_ALREADY_TRASHED`.
- `POST …/restore` on an active case → `409 CASE_NOT_IN_TRASH`.
- `DELETE …/permanent` on an active case → `409 CASE_NOT_TRASHED`.

### 1.8 Step replacement

`PUT /test-cases/:id` accepts the full ordered `steps` array and **replaces**
the list in one transaction. Request steps have `action` + optional
`expectedResult` only — no `id`, no `position`. Positions are `index + 1`.

**Step ids are not stable across PUT.** Clients must not round-trip step ids.
(The deferred unique on `(test_case_id, position)` exists so the server can
reorder in-place when it chooses; the contract still looks like a replace.)

A case may have zero steps.

### 1.9 HTTP details

- Request `Content-Type: application/json` on methods with a body. The
  server still parses the body as JSON when `Content-Type` is omitted;
  malformed JSON is `400 VALIDATION_ERROR` (`Invalid JSON body`), never 500.
- Unknown paths under `/api/v1` return **404** with the standard error
  envelope (`NOT_FOUND`), not Next.js HTML.
- Create endpoints return **201** and a `Location` header pointing at the
  resource (`/api/v1/projects/1`, `/api/v1/directories/4`,
  `/api/v1/test-cases/11`, `/api/v1/users/2`). Revert returns **201** with
  `Location` pointing at the case (`/api/v1/test-cases/:id`).
- Single-resource deletes of projects and permanently-deleted cases return
  **204** with an empty body. Directory delete returns **200** with counts
  (the UI toast needs them). Soft-delete returns **200** with the trashed
  case. Logout and change-password return **204**.

### 1.10 Authentication

**Public (no session):**

- `POST /api/v1/auth/login`
- `GET /api/v1/health`

**Everything else** under `/api/v1` — including unknown paths and
`POST /auth/logout` — requires a valid session. Missing, expired, or unknown
cookie → **401 `UNAUTHENTICATED`**.
Deactivated users cannot keep a session: a request with a cookie whose user
is deactivated is **401 `UNAUTHENTICATED`** (logout is implied). Pages outside
`/api/v1` follow the same rule at the UI layer (`/login` is the only public
page).

**Cookie**

| Trait | Value |
| --- | --- |
| Name | `opentcm_session` |
| Value | opaque token (not the stored `sessions.token_hash`; the server stores SHA-256 of this value) |
| Flags | `HttpOnly`; `SameSite=Lax`; `Path=/`; `Secure` when env `HTTPS=true` |
| Lifetime | 7 days (`Max-Age=604800`) from the last authenticated request (**sliding**). Login sets the cookie; each authenticated API request may refresh `expires_at` and re-send `Set-Cookie`. Logout deletes the session row and clears the cookie (`Max-Age=0`). |

Clients that call the API from the browser must send credentials (`fetch` with
`credentials: "include"`). There is no `Authorization` header in v1.1.

Per-endpoint **Errors** lists in §2–§5 and §6 omit the global **401
`UNAUTHENTICATED`** and role **403 `FORBIDDEN`** unless a specific role rule
is the interesting case. Those two codes still apply.

### 1.11 Roles

Instance-wide (every logged-in user can **read** every project). Fresh
instances ship **Admin**, **Member**, and **Viewer**. Admin is locked.
Member and Viewer may be deleted when unused. Admins can create custom
roles with any subset of: `cases.write`, `cases.revert`,
`directories.write`, `cases.bulk`, `trash.purge`, `projects.write`.
User and role administration stays **Admin-only** (not grantable on a
custom role).

Default matrix:

| Capability | Viewer | Member | Admin |
| --- | --- | --- | --- |
| Log in / out, `GET /auth/me`, change own password | yes | yes | yes |
| Read projects, tree, cases, trash, **history** | yes | yes | yes |
| Create / edit / move / trash / restore cases | no | yes | yes |
| **Revert** a case to a history snapshot | no | yes | yes |
| Directory create / rename / move / delete | no | yes | yes |
| Bulk trash / bulk restore | no | yes | yes |
| Permanent purge | no | no | yes |
| Create / rename / delete projects, change prefix | no | no | yes |
| Users and roles admin | no | no | yes |

Forbidden actions return **403 `FORBIDDEN`**. Unauthenticated is **401** first
(do not leak whether a case id exists to an anonymous caller). Viewers hitting
write endpoints use the same 404-vs-403 pattern as today for missing vs
wrong-project once authenticated: unknown id stays **404**; known id they
cannot mutate is **403**.

---

## 2. Projects

### `GET /api/v1/projects`

List every project, sorted by `name` ascending. Not paginated (instances are
expected to have a handful of projects).

**Success `200`**

```json
{
  "items": [
    {
      "id": 2,
      "name": "Payments API",
      "prefix": "API",
      "nextCaseNumber": 4,
      "createdAt": "2026-08-01T09:00:00.000Z",
      "updatedAt": "2026-08-20T16:45:00.000Z"
    },
    {
      "id": 1,
      "name": "Web App",
      "prefix": "WEB",
      "nextCaseNumber": 16,
      "createdAt": "2026-08-01T09:00:00.000Z",
      "updatedAt": "2026-08-28T12:00:00.000Z"
    }
  ]
}
```

**Errors:** `500 INTERNAL_ERROR`.

---

### `POST /api/v1/projects`

**Body**

```json
{ "name": "Web App", "prefix": "WEB" }
```

`nextCaseNumber` starts at `1`. Prefix must already be uppercase.

**Success `201`**

```json
{
  "id": 1,
  "name": "Web App",
  "prefix": "WEB",
  "nextCaseNumber": 1,
  "createdAt": "2026-08-28T12:00:00.000Z",
  "updatedAt": "2026-08-28T12:00:00.000Z"
}
```

**Errors**

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Prefix must be 2–10 uppercase letters/digits and start with a letter"
  }
}
```

```json
{
  "error": {
    "code": "PREFIX_TAKEN",
    "message": "Prefix WEB is already used by another project."
  }
}
```

```json
{
  "error": {
    "code": "NAME_TAKEN",
    "message": "A project named \"Web App\" already exists."
  }
}
```

---

### `PATCH /api/v1/projects/:id`

Rename and/or change prefix. At least one field required. Changing `prefix`
does not rewrite `case_number` integers; subsequent reads return the new
`displayNumber`. After the change, `GET /test-cases/number/<oldPrefix>-n`
is **404 NOT_FOUND**; `GET /test-cases/number/<newPrefix>-n` returns the
same case. The stored integer is unchanged.

**Body (either or both)**

```json
{ "name": "Web Application", "prefix": "WWW" }
```

**Success `200`** — full `Project` (e.g. `prefix` is now `WWW`,
`nextCaseNumber` unchanged).

**Errors:** `400 VALIDATION_ERROR`, `404 NOT_FOUND`, `409 PREFIX_TAKEN`,
`409 NAME_TAKEN`.

```json
{ "error": { "code": "NOT_FOUND", "message": "Project 99 does not exist." } }
```

---

### `DELETE /api/v1/projects/:id`

Allowed only when the project has **zero test cases** (active and trashed).
Empty directories are removed by `ON DELETE CASCADE`.

**Success `204`** — empty body.

**Errors:** `400 VALIDATION_ERROR`, `404 NOT_FOUND`,

```json
{
  "error": {
    "code": "PROJECT_NOT_EMPTY",
    "message": "Project 1 still has 15 test cases (including trash) and cannot be deleted."
  }
}
```

---

### `GET /api/v1/projects/:id/tree`

Directory tree for the sidebar, plus project-level counts. Directory
`activeCaseCount` is **direct** (non-recursive). Counts exclude trashed
cases. Child directories at each level are sorted by `name` ascending.

**Success `200`**

```json
{
  "projectId": 1,
  "name": "Web App",
  "prefix": "WEB",
  "activeCaseCount": 12,
  "rootCaseCount": 1,
  "trashCount": 3,
  "directories": [
    {
      "id": 1,
      "name": "Authentication",
      "parentId": null,
      "activeCaseCount": 2,
      "children": [
        {
          "id": 2,
          "name": "Login",
          "parentId": 1,
          "activeCaseCount": 2,
          "children": [
            {
              "id": 3,
              "name": "MFA",
              "parentId": 2,
              "activeCaseCount": 1,
              "children": []
            }
          ]
        }
      ]
    },
    {
      "id": 4,
      "name": "Checkout",
      "parentId": null,
      "activeCaseCount": 6,
      "children": []
    }
  ]
}
```

`rootCaseCount` is active cases with `directoryId: null` (the implicit
project root). The “All test cases” sidebar row uses `activeCaseCount`.

**Errors:** `400 VALIDATION_ERROR`, `404 NOT_FOUND`.

---

## 3. Directories

### `POST /api/v1/directories`

**Body**

```json
{ "projectId": 1, "name": "Authentication", "parentId": null }
```

`parentId` omitted or `null` creates a root folder. `parentId` must belong to
the same project.

**Success `201`**

```json
{
  "id": 1,
  "projectId": 1,
  "parentId": null,
  "name": "Authentication",
  "createdAt": "2026-08-28T12:00:00.000Z",
  "updatedAt": "2026-08-28T12:00:00.000Z"
}
```

**Errors:** `400 VALIDATION_ERROR`, `404 NOT_FOUND` (project or parent),
`409 SIBLING_NAME_TAKEN`, `409 CROSS_PROJECT`.

```json
{
  "error": {
    "code": "SIBLING_NAME_TAKEN",
    "message": "A folder named \"Authentication\" already exists here."
  }
}
```

---

### `PATCH /api/v1/directories/:id`

Rename and/or move. At least one of `name`, `parentId`. `parentId: null`
moves to the project root.

**Body**

```json
{ "name": "Auth", "parentId": null }
```

**Success `200`** — full `Directory`.

**Errors:** `400 VALIDATION_ERROR`, `404 NOT_FOUND`, `409 SIBLING_NAME_TAKEN`,
`409 CYCLE_DETECTED`, `409 CROSS_PROJECT`.

```json
{
  "error": {
    "code": "CYCLE_DETECTED",
    "message": "Cannot move a folder into itself or one of its descendants."
  }
}
```

Moving a directory does **not** change any case numbers.

---

### `DELETE /api/v1/directories/:id`

Query: optional `mode`.

| `mode`                    | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| omitted                   | Succeeds only if the subtree has **no active** cases. Empty sub-directories are deleted with the parent (FK cascade). Trashed cases in the subtree get `directory_id = NULL` (`ON DELETE SET NULL`) and later restore to the project root.                                                                                                                                                                                                  |
| `trash_contents`          | Soft-delete every **active** case in the subtree, then delete the directory tree. Those cases end up trashed with `directoryId: null` (their folders are gone), so restore is to root.                                                                                                                                                                                                                                                      |
| `move_contents_to_parent` | Immediate child directories are reparented to this directory's parent (or root). Active cases **directly in this directory** move with them. Nested cases stay in their (now reparented) folders. Then this directory is deleted. Trashed cases that still pointed here become `directoryId: null` (they do **not** follow to the parent). Sibling-name collisions on the moved folders abort the whole request (`409 SIBLING_NAME_TAKEN`). |

Unknown `mode` → `400 VALIDATION_ERROR`.

**Success `200`**

```json
{
  "id": 4,
  "deleted": true,
  "mode": "trash_contents",
  "trashedCaseCount": 6,
  "movedCaseCount": 0,
  "movedDirectoryCount": 0
}
```

`mode` is `null` when the query param was omitted. Counts that do not apply
are `0`.

**Errors:** `400 VALIDATION_ERROR`, `404 NOT_FOUND`, `409 DIRECTORY_NOT_EMPTY`,
`409 SIBLING_NAME_TAKEN`.

```json
{
  "error": {
    "code": "DIRECTORY_NOT_EMPTY",
    "message": "Folder \"Checkout\" still has 6 active test cases. Pass mode=trash_contents or mode=move_contents_to_parent."
  }
}
```

---

## 4. Test cases (active)

### `GET /api/v1/test-cases`

Query: `projectId` (required), `directoryId`, `q`, `page`, `pageSize`
(see §1.4–§1.5). Active cases only.

**Success `200`** — pagination envelope of summaries:

```json
{
  "page": 1,
  "pageSize": 50,
  "totalItems": 2,
  "totalPages": 1,
  "items": [
    {
      "id": 1,
      "projectId": 1,
      "directoryId": 2,
      "caseNumber": 1,
      "displayNumber": "WEB-1",
      "title": "Login with valid credentials",
      "stepCount": 3,
      "deletedAt": null,
      "createdAt": "2026-08-01T09:00:00.000Z",
      "updatedAt": "2026-08-20T16:45:00.000Z"
    }
  ]
}
```

**Errors:** `400 VALIDATION_ERROR` (missing `projectId`, bad page, …),
`404 NOT_FOUND` (unknown `projectId` or `directoryId`).

---

### `POST /api/v1/test-cases`

Assigns `caseNumber` from the project's counter inside the same transaction
as the insert. `directoryId` omitted or `null` → project root. `steps`
omitted → `[]`.

**Body**

```json
{
  "projectId": 1,
  "title": "Login with valid credentials",
  "description": "Happy-path login for a verified shopper.",
  "directoryId": 2,
  "steps": [
    {
      "action": "Open `/login`.",
      "expectedResult": "The email and password fields are empty."
    },
    {
      "action": "Submit valid credentials.",
      "expectedResult": null
    }
  ]
}
```

**Success `201`** — full `TestCase` (see GET-by-id example). `caseNumber` is
the value consumed from the counter; `nextCaseNumber` on the project is now
that value + 1.

**Errors:** `400 VALIDATION_ERROR` (empty title, empty action, …),
`404 NOT_FOUND`, `409 CROSS_PROJECT` (directory belongs to another project).

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "title: String must contain at least 1 character(s)"
  }
}
```

---

### `GET /api/v1/test-cases/:id`

Full case including ordered steps and a breadcrumb `directoryPath` (from the
root folder down to the containing folder; `[]` when `directoryId` is
`null`). Returns trashed cases.

**Success `200`**

```json
{
  "id": 1,
  "projectId": 1,
  "directoryId": 2,
  "caseNumber": 1,
  "displayNumber": "WEB-1",
  "title": "Login with valid credentials",
  "description": "Happy-path login for a verified shopper.",
  "steps": [
    {
      "id": 101,
      "position": 1,
      "action": "Open `/login`.",
      "expectedResult": "The email and password fields are empty. The **Sign in** button is disabled."
    },
    {
      "id": 102,
      "position": 2,
      "action": "Type `ada@example.test` into **Email** and `correct-horse` into **Password**.",
      "expectedResult": "**Sign in** becomes enabled."
    },
    {
      "id": 103,
      "position": 3,
      "action": "Press **Enter** (do not click the button).",
      "expectedResult": "Redirect to `/dashboard`. Header shows `Ada Lovelace`."
    }
  ],
  "directoryPath": [
    { "id": 1, "name": "Authentication" },
    { "id": 2, "name": "Login" }
  ],
  "deletedAt": null,
  "createdAt": "2026-08-01T09:00:00.000Z",
  "updatedAt": "2026-08-20T16:45:00.000Z"
}
```

**Errors:** `400 VALIDATION_ERROR`, `404 NOT_FOUND`.

---

### `GET /api/v1/test-cases/number/:displayNumber`

`:displayNumber` is a single path segment matching
`^[A-Z][A-Z0-9]{1,9}-\d+$` (e.g. `WEB-42`). The prefix is looked up
case-sensitively against `projects.prefix`. Same body as GET-by-id.
Returns trashed cases.

**Errors:** `400 VALIDATION_ERROR` (malformed segment), `404 NOT_FOUND`
(unknown prefix, or that project has no such `caseNumber` — including
numbers that were never assigned).

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Test case WEB-99 does not exist."
  }
}
```

---

### `PUT /api/v1/test-cases/:id`

Full update of an **active** case: metadata + atomic step-list replacement.
`directoryId` is required (`null` = root). `description` is required and may
be `null`. `steps` is required and may be `[]`. Does not change `caseNumber`.

**Body**

```json
{
  "title": "Login with valid credentials",
  "description": "Updated description.",
  "directoryId": 2,
  "steps": [
    { "action": "Open `/login`.", "expectedResult": "Login form is shown." },
    { "action": "Submit valid credentials.", "expectedResult": null }
  ]
}
```

**Success `200`** — full `TestCase` with **new** step ids and positions
`1…n`.

**Errors:** `400 VALIDATION_ERROR`, `404 NOT_FOUND`,
`409 CASE_ALREADY_TRASHED`, `409 CROSS_PROJECT`.

```json
{
  "error": {
    "code": "CASE_ALREADY_TRASHED",
    "message": "Test case 13 is in the trash. Restore it before editing."
  }
}
```

---

### `PATCH /api/v1/test-cases/:id/move`

Change `directoryId` only. Does not change `caseNumber`. Active cases only.

**Body**

```json
{ "directoryId": 4 }
```

```json
{ "directoryId": null }
```

**Success `200`** — full `TestCase` (updated `directoryId` + `directoryPath`).

**Errors:** `400 VALIDATION_ERROR`, `404 NOT_FOUND`,
`409 CASE_ALREADY_TRASHED`, `409 CROSS_PROJECT`.

---

### `DELETE /api/v1/test-cases/:id`

**Soft delete.** Sets `deletedAt` to now. The case disappears from the
active list, search, and tree counts, and appears in trash. `caseNumber` is
kept.

**Success `200`** — full `TestCase` with `deletedAt` set.

**Errors:** `400 VALIDATION_ERROR`, `404 NOT_FOUND`,
`409 CASE_ALREADY_TRASHED`.

---

### `POST /api/v1/test-cases/bulk-trash`

Soft-delete many **active** cases. See §1.6.

**Body**

```json
{ "projectId": 1, "ids": [9, 12] }
```

```json
{ "projectId": 1, "all": true, "filter": { "directoryId": 4, "q": "expired" } }
```

**Success `200`**

```json
{ "count": 2 }
```

**Errors:** `400 VALIDATION_ERROR`, `404 NOT_FOUND` (project, or any id not
an active case in that project), `409 CASE_ALREADY_TRASHED` (any id already
trashed). No partial updates.

---

## 5. Trash

### `GET /api/v1/projects/:id/trash`

Paginated trashed cases. Same `directoryId` / `q` / `page` / `pageSize`
semantics as the active list. `directoryId` filters on the case's **current**
`directoryId` (which is `null` after the original folder was deleted).

**Success `200`** — pagination envelope of summaries (`deletedAt` non-null).
Sorted by `deletedAt` desc, `caseNumber` asc.

**Errors:** `400 VALIDATION_ERROR`, `404 NOT_FOUND`.

---

### `POST /api/v1/test-cases/:id/restore`

Clear `deletedAt`. If `directoryId` still points at an existing directory in
the same project, the case returns there; otherwise `directoryId` is set to
`null` (project root). This is the restore-to-root fallback — it also covers
cases that were already at root.

**Success `200`** — full active `TestCase` (`deletedAt: null`).

**Errors:** `400 VALIDATION_ERROR`, `404 NOT_FOUND`,

```json
{
  "error": {
    "code": "CASE_NOT_IN_TRASH",
    "message": "Test case 1 is not in the trash."
  }
}
```

---

### `POST /api/v1/test-cases/bulk-restore`

Same envelope as bulk-trash (`projectId` + XOR). Operates only on **trashed**
cases matching the filter / ids. Each case is restored with the same
root-fallback rule as single restore.

**Success `200`:** `{ "count": 3 }`

**Errors:** `400 VALIDATION_ERROR`, `404 NOT_FOUND`, `409 CASE_NOT_IN_TRASH`.
No partial updates.

---

### `DELETE /api/v1/test-cases/:id/permanent`

Hard-delete one **trashed** case (steps cascade). Cannot be undone.

**Success `204`** — empty body.

**Errors:** `400 VALIDATION_ERROR`, `404 NOT_FOUND`,

```json
{
  "error": {
    "code": "CASE_NOT_TRASHED",
    "message": "Test case 1 is not in the trash and cannot be permanently deleted."
  }
}
```

HTTP status for that body is **409**.

---

### `POST /api/v1/projects/:id/trash/purge`

Bulk permanent delete of **trashed** cases in that project. Active cases are
untouchable: an `ids` list that includes any active (or unknown, or
other-project) id fails the whole request.

**Body**

```json
{ "ids": [13, 14] }
```

```json
{ "all": true, "filter": { "q": "retired" } }
```

```json
{ "all": true }
```

`{ "all": true }` with no filter purges **every trashed case in the
project** and still cannot touch an active case.

**Success `200`:** `{ "count": 2 }`

**Errors:** `400 VALIDATION_ERROR`, `404 NOT_FOUND` (project, or an id that
does not exist in this project's trash), `409 CASE_NOT_TRASHED` (an id that
exists but is active). No partial deletes.

---

## 6. Health

### `GET /api/v1/health`

Deploy/readiness check. Performs a trivial DB round-trip (`SELECT 1`).
**Unauthenticated** — Docker HEALTHCHECK and load balancers must keep working
without a session cookie.

**Success `200`**

```json
{ "status": "ok", "database": "connected" }
```

**Error `503`**

```json
{
  "error": {
    "code": "DATABASE_UNAVAILABLE",
    "message": "Could not connect to PostgreSQL."
  }
}
```

---

## 7. Auth

Cookie details: §1.10. Password hashes are never returned.

### `POST /api/v1/auth/login`

**Public.** Email is trimmed and lowercased. Password is trimmed; minimum 8
characters (shorter → `400 VALIDATION_ERROR`, not `INVALID_CREDENTIALS`).

**Body**

```json
{ "email": "ada@opentcm.local", "password": "correct-horse" }
```

**Success `200`** — body plus `Set-Cookie: opentcm_session=…` (flags in §1.10).
Creates a `sessions` row. Sliding expiry starts now.

```json
{
  "user": {
    "id": 1,
    "email": "ada@opentcm.local",
    "displayName": "Ada Lovelace",
    "role": "admin",
    "deactivatedAt": null,
    "mustSetupAccount": false,
    "createdAt": "2026-08-01T09:00:00.000Z",
    "updatedAt": "2026-08-28T12:00:00.000Z"
  }
}
```

**Errors**

```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Email or password is incorrect."
  }
}
```

```json
{
  "error": {
    "code": "USER_DEACTIVATED",
    "message": "This account has been deactivated."
  }
}
```

Unknown email and wrong password both use `INVALID_CREDENTIALS` (do not leak
whether the email exists). If the password is correct but `deactivatedAt` is
set, the response is `403 USER_DEACTIVATED` and **no** session is created.

---

### `POST /api/v1/auth/logout`

**Any authenticated role.** Deletes the session row for this cookie and
clears `opentcm_session` (`Set-Cookie` with `Max-Age=0`).

**Success `204`** — empty body.

**Errors:** `401 UNAUTHENTICATED` (missing, expired, or unknown cookie). Extra
JSON keys on a body are `400 VALIDATION_ERROR` if a body is sent; clients
should send an empty POST.

---

### `GET /api/v1/auth/me`

**Any authenticated role.** Current user from the session.

**Success `200`** — same `{ "user": User }` envelope as login.

**Errors:** `401 UNAUTHENTICATED`.

---

### `POST /api/v1/auth/setup-admin`

**Authenticated**, and only while `user.mustSetupAccount` is `true` (the
bootstrap Admin created on first boot). Replaces that user's email, display
name, and password, then clears the flag. Same user id (history `actor_id`
does not change). The new email must differ from the temporary one; the new
password must differ from the temporary password.

**Body**

```json
{
  "email": "ada@opentcm.example",
  "displayName": "Ada Lovelace",
  "password": "correct-horse"
}
```

**Success `200`** — `{ "user": User }` with `mustSetupAccount: false`.

**Errors:** `400 VALIDATION_ERROR` (same email, same password, or schema),
`401 UNAUTHENTICATED`, `403 FORBIDDEN` (setup already completed),
`403 SETUP_REQUIRED` is **not** returned here (this route is exempt),
`409 EMAIL_TAKEN`.

Until setup completes, every other authenticated `/api/v1` route returns
`403 SETUP_REQUIRED`. HTML app routes redirect to `/setup-admin`.

---

### `POST /api/v1/auth/password`

**Any authenticated role.** Change the caller's own password. Does **not**
invalidate other sessions in v1.1.

**Body**

```json
{ "currentPassword": "correct-horse", "newPassword": "new-correct-horse" }
```

**Success `204`** — empty body.

**Errors:** `400 VALIDATION_ERROR` (too-short new password), `401
UNAUTHENTICATED`,

```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Current password is incorrect."
  }
}
```

Admins set **someone else's** password with `PATCH /users/:id` (`password`
field), not this route.

---

## 8. Users (Admin)

No public registration. List is not paginated (instances have a handful of
users). Sorted by `email` ascending. Deactivated users are included.

### `GET /api/v1/users`

**Admin.**

**Success `200`**

```json
{
  "items": [
    {
      "id": 1,
      "email": "ada@opentcm.local",
      "displayName": "Ada Lovelace",
      "role": "admin",
      "deactivatedAt": null,
      "mustSetupAccount": false,
      "createdAt": "2026-08-01T09:00:00.000Z",
      "updatedAt": "2026-08-28T12:00:00.000Z"
    }
  ]
}
```

**Errors:** `401 UNAUTHENTICATED`, `403 FORBIDDEN` (Member/Viewer).

---

### `POST /api/v1/users`

**Admin.** Creates an account. Email is stored lowercased. The temporary
password is the only time the server sees it in plaintext besides login /
password-change.

**Body**

```json
{
  "email": "charles@opentcm.local",
  "displayName": "Charles Babbage",
  "role": "member",
  "password": "temporary-password"
}
```

`role` is a role **slug** (`admin`, `member`, `viewer`, or a custom slug).
Unknown slugs are `404 NOT_FOUND`.

**Success `201`** — full `User`. `Location: /api/v1/users/:id`.
`deactivatedAt` is `null`.

**Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `403 FORBIDDEN`,

```json
{
  "error": {
    "code": "EMAIL_TAKEN",
    "message": "A user with that email already exists."
  }
}
```

`EMAIL_TAKEN` is case-insensitive (`Ada@…` vs `ada@…`).

---

### `PATCH /api/v1/users/:id`

**Admin.** At least one field required. Omitted fields are unchanged.

**Body (any non-empty subset)**

```json
{
  "displayName": "Ada L.",
  "role": "admin",
  "deactivatedAt": "2026-08-29T09:00:00.000Z",
  "password": "new-temporary-password"
}
```

| Field | Meaning |
| --- | --- |
| `displayName` | New display name (1–80 trimmed). History events already written keep the old denormalized name. |
| `role` | Existing role slug |
| `deactivatedAt` | ISO-8601 timestamp → deactivate (store this instant). `null` → reactivate. Omit → leave as-is. |
| `password` | Set a new password for this user. Does not invalidate existing sessions in v1.1. |

**Success `200`** — full `User`.

**Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `403 FORBIDDEN`,
`404 NOT_FOUND`, `409 EMAIL_TAKEN` (not applicable unless email becomes
patchable later — v1.1 does **not** change email),

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "Cannot deactivate or demote the last remaining Admin."
  }
}
```

Last-Admin protection (A2): cannot set `deactivatedAt` to a timestamp, and
cannot change `role` away from `admin`, when this user is the only remaining
active Admin (including “cannot deactivate yourself if you are the last
Admin”). Reactivating a user is always allowed.

---

### `GET /api/v1/roles` / `POST /api/v1/roles`

**Admin.** List or create instance roles. `POST` body:
`{ name, description?, permissions[] }`. Slug is derived from the name.
`admin` cannot be created this way.

### `PATCH /api/v1/roles/:id` / `DELETE /api/v1/roles/:id`

**Admin.** Edit name/description/permissions, or delete. Locked Admin →
`409 ROLE_LOCKED`. Delete while users still have the role → `409 ROLE_IN_USE`.
Member and Viewer may be deleted when unused.

---

## 9. Case history and revert

Append-only timeline per test case (PLAN-v1.1 §5). Events are never updated
or deleted by a revert. Permanent purge of a case **CASCADE**-deletes its
events.

Every successful case mutation (create, PUT, move, trash, restore, revert,
and **each** case in bulk trash/restore) inserts one event in the **same
transaction**. A successful mutation without a history row is a bug. Seeded
WEB/API cases start with **zero** events until someone mutates them while
logged in.

`snapshot` is the **full case state immediately after** the event applied:

```json
{
  "title": "Login with valid credentials",
  "description": "Happy-path login for a verified shopper.",
  "directoryId": 2,
  "steps": [
    {
      "action": "Open `/login`.",
      "expectedResult": "The email and password fields are empty. The **Sign in** button is disabled."
    }
  ],
  "deletedAt": null
}
```

Snapshot steps have `action` + `expectedResult` only (no `id`, no
`position`; array order is position). `deletedAt` is `null` when the case is
active after this event.

`actorEmail` and `actorDisplayName` are copied at write time so a later
rename does not rewrite history. `actorId` remains the stable user id
(`ON DELETE RESTRICT`).

### `GET /api/v1/test-cases/:id/events`

**Any authenticated role** (Viewer included). Newest → oldest.

Query: optional `limit` (integer 1–500, default **500**). If the case has
more than `limit` events, the **most recent** `limit` events are returned,
already ordered newest → oldest (no extra reverse).

Returns trashed cases' history as well (same as GET-by-id). Unknown case →
`404 NOT_FOUND`.

**Success `200`**

```json
{
  "items": [
    {
      "id": 1,
      "testCaseId": 1,
      "actorId": 1,
      "actorEmail": "ada@opentcm.local",
      "actorDisplayName": "Ada Lovelace",
      "action": "created",
      "revertedEventId": null,
      "snapshot": {
        "title": "Login with valid credentials",
        "description": "Happy-path login for a verified shopper.",
        "directoryId": 2,
        "steps": [
          {
            "action": "Open `/login`.",
            "expectedResult": "The email and password fields are empty. The **Sign in** button is disabled."
          }
        ],
        "deletedAt": null
      },
      "createdAt": "2026-08-01T09:00:00.000Z"
    }
  ]
}
```

`action` is `created` | `updated` | `moved` | `trashed` | `restored` |
`reverted`. `revertedEventId` is set only when `action` is `reverted`; it
points at the event whose snapshot was restored (must be the same
`testCaseId`, enforced in application code).

**Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `404 NOT_FOUND`.

Contract fixtures (`createFixtures().caseEvents`) keep the product-owner
**story** on WEB-1 in chronological order: snapshots **A, B, C, A** —
create, two updates, then revert of C back to A. The fourth event has
`action: "reverted"`, `revertedEventId` equal to the first event's id,
and a snapshot deep-equal to the first. `GET …/events` returns that same
story newest-first: **A, C, B, A**.

---

### `POST /api/v1/test-cases/:id/revert`

**Member+.** Restore the snapshot of `eventId` as the current case (title,
description, directory, steps, and `deletedAt`) and **append** a new event
with `action: "reverted"`. Events A, B, and C are not deleted or rewritten.
If the case went A → B → C and the client reverts to A, the append-only
story is **A → B → C → A**. `GET …/events` lists that newest-first
(**A, C, B, A**). Reverting a revert is allowed.

**Body**

```json
{ "eventId": 1 }
```

**Success `201`** — the new event plus the case after restore.
`Location: /api/v1/test-cases/:id`.

```json
{
  "event": {
    "id": 4,
    "testCaseId": 1,
    "actorId": 1,
    "actorEmail": "ada@opentcm.local",
    "actorDisplayName": "Ada Lovelace",
    "action": "reverted",
    "revertedEventId": 1,
    "snapshot": {},
    "createdAt": "2026-08-29T09:00:00.000Z"
  },
  "case": {}
}
```

(`snapshot` and `case` are full objects; `{}` above is a placeholder. See
GET events and GET-by-id for shapes. The reverted event's `snapshot`
deep-equals the target event's `snapshot`.)

**Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `403 FORBIDDEN`
(Viewer), `404 NOT_FOUND` (unknown case, **or** unknown `eventId`),

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "Event 9 does not belong to test case 1."
  }
}
```

Wrong-case `eventId` (the event exists but `testCaseId` differs) is **409
`CONFLICT`**. Revert is allowed on a trashed case (the restored snapshot
decides whether the case stays trashed).

---

## 10. Resource shapes (summary)

These match `src/lib/contracts/`. Field names are camelCase in JSON.

**Project** — `id`, `name`, `prefix`, `nextCaseNumber`, `createdAt`, `updatedAt`

**Directory** — `id`, `projectId`, `parentId` (`null` = root), `name`,
`createdAt`, `updatedAt`

**TestCaseSummary** — `id`, `projectId`, `directoryId`, `caseNumber`,
`displayNumber`, `title`, `stepCount`, `deletedAt`, `createdAt`, `updatedAt`

**TestCase** — summary fields except `stepCount`, plus `description`,
`steps[]` (`id`, `position`, `action`, `expectedResult`), `directoryPath[]`
(`id`, `name`)

**ProjectTree** — `projectId`, `name`, `prefix`, `activeCaseCount`,
`rootCaseCount`, `trashCount`, `directories[]` (recursive `TreeNode`: `id`,
`name`, `parentId`, `activeCaseCount`, `children[]`)

**User** — `id`, `email`, `displayName`, `role` (slug), optional `roleName`
and `permissions[]`, `deactivatedAt` (`null` = can log in),
`mustSetupAccount` (bootstrap Admin must create their account), `createdAt`,
`updatedAt`. Never includes `password` / `passwordHash`. Admin always
serializes with every grantable permission.

**Role** — `id`, `slug`, `name`, `description`, `builtIn`, `locked`,
`permissions[]`, `createdAt`, `updatedAt`.

**SessionUserResponse** — `{ user: User }` (login and me)

**TestCaseEvent** — `id`, `testCaseId`, `actorId`, `actorEmail`,
`actorDisplayName`, `action`, `revertedEventId`, `snapshot`
(`title`, `description`, `directoryId`, `steps[]` of `{ action,
expectedResult }`, `deletedAt`), `createdAt` (no `updatedAt`; events are
immutable)

**RevertTestCaseResponse** — `{ event: TestCaseEvent, case: TestCase }`

---

## 11. Endpoint index

| Method   | Path                                       | Auth                         | Success                              |
| -------- | ------------------------------------------ | ---------------------------- | ------------------------------------ |
| `POST`   | `/api/v1/auth/login`                       | public                       | 200 `{ user }` + Set-Cookie          |
| `POST`   | `/api/v1/auth/logout`                      | any auth                     | 204                                  |
| `GET`    | `/api/v1/auth/me`                          | any auth                     | 200 `{ user }`                       |
| `POST`   | `/api/v1/auth/setup-admin`                 | any auth (setup only)        | 200 `{ user }`                       |
| `POST`   | `/api/v1/auth/password`                    | any auth                     | 204                                  |
| `GET`    | `/api/v1/users`                            | Admin                        | 200 `{ items }`                      |
| `POST`   | `/api/v1/users`                            | Admin                        | 201 `User`                           |
| `PATCH`  | `/api/v1/users/:id`                        | Admin                        | 200 `User`                           |
| `GET`    | `/api/v1/roles`                            | Admin                        | 200 `{ items }`                      |
| `POST`   | `/api/v1/roles`                            | Admin                        | 201 `Role`                           |
| `PATCH`  | `/api/v1/roles/:id`                        | Admin                        | 200 `Role`                           |
| `DELETE` | `/api/v1/roles/:id`                        | Admin                        | 204 (not Admin; 409 if in use)       |
| `GET`    | `/api/v1/projects`                         | any auth                     | 200 `{ items }`                      |
| `POST`   | `/api/v1/projects`                         | `projects.write`             | 201 `Project`                        |
| `PATCH`  | `/api/v1/projects/:id`                     | `projects.write`             | 200 `Project`                        |
| `DELETE` | `/api/v1/projects/:id`                     | `projects.write`             | 204                                  |
| `GET`    | `/api/v1/projects/:id/tree`                | any auth                     | 200 `ProjectTree`                    |
| `POST`   | `/api/v1/directories`                      | `directories.write`          | 201 `Directory`                      |
| `PATCH`  | `/api/v1/directories/:id`                  | `directories.write`          | 200 `Directory`                      |
| `DELETE` | `/api/v1/directories/:id?mode=`            | `directories.write`          | 200 `DirectoryDeleteResponse`        |
| `GET`    | `/api/v1/test-cases`                       | any auth                     | 200 paginated summaries              |
| `POST`   | `/api/v1/test-cases`                       | `cases.write`                | 201 `TestCase`                       |
| `GET`    | `/api/v1/test-cases/:id`                   | any auth                     | 200 `TestCase`                       |
| `GET`    | `/api/v1/test-cases/number/:displayNumber` | any auth                     | 200 `TestCase`                       |
| `PUT`    | `/api/v1/test-cases/:id`                   | `cases.write`                | 200 `TestCase`                       |
| `PATCH`  | `/api/v1/test-cases/:id/move`              | `cases.write`                | 200 `TestCase`                       |
| `DELETE` | `/api/v1/test-cases/:id`                   | `cases.write`                | 200 `TestCase` (trashed)             |
| `POST`   | `/api/v1/test-cases/bulk-trash`            | `cases.bulk`                 | 200 `{ count }`                      |
| `GET`    | `/api/v1/test-cases/:id/events`            | any auth                     | 200 `{ items }` (newest-first)       |
| `POST`   | `/api/v1/test-cases/:id/revert`            | `cases.revert`               | 201 `{ event, case }`                |
| `GET`    | `/api/v1/projects/:id/trash`               | any auth                     | 200 paginated summaries              |
| `POST`   | `/api/v1/test-cases/:id/restore`           | `cases.write`                | 200 `TestCase`                       |
| `POST`   | `/api/v1/test-cases/bulk-restore`          | `cases.bulk`                 | 200 `{ count }`                      |
| `DELETE` | `/api/v1/test-cases/:id/permanent`         | `trash.purge`                | 204                                  |
| `POST`   | `/api/v1/projects/:id/trash/purge`         | `trash.purge`                | 200 `{ count }`                      |
| `GET`    | `/api/v1/health`                           | public                       | 200 `{ status, database }`           |
