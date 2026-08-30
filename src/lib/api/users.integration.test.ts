import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { POST as LOGIN } from "@/app/api/v1/auth/login/route";
import { GET as ME } from "@/app/api/v1/auth/me/route";
import { PATCH as PATCH_USER } from "@/app/api/v1/users/[id]/route";
import { GET as LIST_USERS, POST as POST_USER } from "@/app/api/v1/users/route";
import {
  authenticateAsTestAdmin,
  invoke,
  loginAs,
  uniqueEmail,
} from "@/lib/api/test-helpers";
import {
  errorBodySchema,
  sessionUserResponseSchema,
  userListResponseSchema,
  userSchema,
  type User,
} from "@/lib/contracts";
import { pool } from "@/lib/db";

const createdUserIds: number[] = [];
let admin: User;

beforeAll(async () => {
  const session = await authenticateAsTestAdmin();
  admin = session.user;
});

afterEach(async () => {
  const ids = createdUserIds.splice(0);
  if (ids.length === 0) {
    return;
  }
  await pool.query(`DELETE FROM users WHERE id = ANY($1::bigint[])`, [ids]);
});

async function createUser(body: {
  email?: string;
  displayName?: string;
  role: "admin" | "member" | "viewer";
  password?: string;
}): Promise<User> {
  const result = await invoke(POST_USER, {
    method: "POST",
    path: "/api/v1/users",
    body: {
      email: body.email ?? uniqueEmail(body.role),
      displayName: body.displayName ?? `${body.role} user`,
      role: body.role,
      password: body.password ?? "temporary-password",
    },
  });
  expect(result.status).toBe(201);
  const user = userSchema.parse(result.json);
  createdUserIds.push(user.id);
  return user;
}

describe("GET/POST /api/v1/users", () => {
  it("lists users sorted by email and includes deactivated accounts", async () => {
    const later = await createUser({
      email: uniqueEmail("zeta"),
      displayName: "Zeta",
      role: "member",
    });
    const earlier = await createUser({
      email: uniqueEmail("alpha"),
      displayName: "Alpha",
      role: "viewer",
    });
    const deactivatedAt = "2026-08-29T09:00:00.000Z";
    const retired = await invoke(PATCH_USER, {
      method: "PATCH",
      path: `/api/v1/users/${later.id}`,
      params: { id: String(later.id) },
      body: { deactivatedAt },
    });
    expect(retired.status).toBe(200);
    expect(userSchema.parse(retired.json).deactivatedAt).toBe(deactivatedAt);

    const listed = await invoke(LIST_USERS, { path: "/api/v1/users" });
    expect(listed.status).toBe(200);
    const body = userListResponseSchema.parse(listed.json);
    const emails = body.items.map((item) => item.email);
    expect(emails.indexOf(earlier.email)).toBeGreaterThanOrEqual(0);
    expect(emails.indexOf(later.email)).toBeGreaterThan(
      emails.indexOf(earlier.email),
    );
    const retiredRow = body.items.find((item) => item.id === later.id);
    expect(retiredRow?.deactivatedAt).toBe(deactivatedAt);
  });

  it("creates a user with Location and no password fields", async () => {
    const email = uniqueEmail("charles");
    const result = await invoke(POST_USER, {
      method: "POST",
      path: "/api/v1/users",
      body: {
        email,
        displayName: "Charles Babbage",
        role: "member",
        password: "temporary-password",
      },
    });
    expect(result.status).toBe(201);
    const user = userSchema.parse(result.json);
    createdUserIds.push(user.id);
    expect(user.email).toBe(email);
    expect(user.displayName).toBe("Charles Babbage");
    expect(user.role).toBe("member");
    expect(user.deactivatedAt).toBeNull();
    expect(result.headers.get("Location")).toBe(`/api/v1/users/${user.id}`);
    const raw = result.json as { password?: unknown; passwordHash?: unknown };
    expect(raw.password).toBeUndefined();
    expect(raw.passwordHash).toBeUndefined();
  });

  it("returns EMAIL_TAKEN for a duplicate email ignoring case", async () => {
    const local = uniqueEmail("dup").split("@")[0];
    const email = `${local}@opentcm.test`;
    await createUser({ email, role: "viewer" });

    const result = await invoke(POST_USER, {
      method: "POST",
      path: "/api/v1/users",
      body: {
        email: email.toUpperCase(),
        displayName: "Copy",
        role: "member",
        password: "temporary-password",
      },
    });
    expect(result.status).toBe(409);
    expect(errorBodySchema.parse(result.json)).toMatchObject({
      error: {
        code: "EMAIL_TAKEN",
        message: "A user with that email already exists.",
      },
    });
  });

  it("rejects Member POST /users with 403 FORBIDDEN", async () => {
    const member = await createUser({ role: "member" });
    const { cookie } = await loginAs(member.email, "temporary-password");

    const result = await invoke(POST_USER, {
      method: "POST",
      path: "/api/v1/users",
      cookie,
      body: {
        email: uniqueEmail("blocked"),
        displayName: "Nope",
        role: "viewer",
        password: "temporary-password",
      },
    });
    expect(result.status).toBe(403);
    expect(errorBodySchema.parse(result.json).error.code).toBe("FORBIDDEN");
  });
});

describe("PATCH /api/v1/users/:id", () => {
  it("lets an Admin deactivate a Member", async () => {
    const member = await createUser({ role: "member" });
    const deactivatedAt = "2026-08-29T12:00:00.000Z";
    const result = await invoke(PATCH_USER, {
      method: "PATCH",
      path: `/api/v1/users/${member.id}`,
      params: { id: String(member.id) },
      body: { deactivatedAt },
    });
    expect(result.status).toBe(200);
    const updated = userSchema.parse(result.json);
    expect(updated.deactivatedAt).toBe(deactivatedAt);

    const login = await invoke(LOGIN, {
      method: "POST",
      path: "/api/v1/auth/login",
      unauthenticated: true,
      body: { email: member.email, password: "temporary-password" },
    });
    expect(login.status).toBe(403);
    expect(errorBodySchema.parse(login.json).error.code).toBe(
      "USER_DEACTIVATED",
    );
  });

  it("sets a password via PATCH (not /auth/password) without invalidating sessions", async () => {
    const member = await createUser({
      role: "member",
      password: "temporary-password",
    });
    const { cookie } = await loginAs(member.email, "temporary-password");

    const patched = await invoke(PATCH_USER, {
      method: "PATCH",
      path: `/api/v1/users/${member.id}`,
      params: { id: String(member.id) },
      body: { password: "admin-set-password" },
    });
    expect(patched.status).toBe(200);

    const stillMe = await invoke(ME, {
      path: "/api/v1/auth/me",
      cookie,
    });
    expect(stillMe.status).toBe(200);

    const oldLogin = await invoke(LOGIN, {
      method: "POST",
      path: "/api/v1/auth/login",
      unauthenticated: true,
      body: { email: member.email, password: "temporary-password" },
    });
    expect(oldLogin.status).toBe(401);

    const newLogin = await invoke(LOGIN, {
      method: "POST",
      path: "/api/v1/auth/login",
      unauthenticated: true,
      body: { email: member.email, password: "admin-set-password" },
    });
    expect(newLogin.status).toBe(200);
    sessionUserResponseSchema.parse(newLogin.json);
  });

  it("cannot deactivate or demote the last remaining Admin", async () => {
    const extra = await createUser({
      role: "admin",
      displayName: "Spare Admin",
      password: "spare-admin-password",
    });
    const extraSession = await loginAs(extra.email, "spare-admin-password");

    const listed = await invoke(LIST_USERS, { path: "/api/v1/users" });
    const others = userListResponseSchema
      .parse(listed.json)
      .items.filter(
        (item) =>
          item.role === "admin" &&
          item.deactivatedAt === null &&
          item.id !== extra.id,
      );

    const deactivatedAt = new Date().toISOString();
    for (const other of others) {
      const result = await invoke(PATCH_USER, {
        method: "PATCH",
        path: `/api/v1/users/${other.id}`,
        params: { id: String(other.id) },
        cookie: extraSession.cookie,
        body: { deactivatedAt },
      });
      expect(result.status).toBe(200);
    }

    try {
      const deactivate = await invoke(PATCH_USER, {
        method: "PATCH",
        path: `/api/v1/users/${extra.id}`,
        params: { id: String(extra.id) },
        cookie: extraSession.cookie,
        body: { deactivatedAt: new Date().toISOString() },
      });
      expect(deactivate.status).toBe(409);
      expect(errorBodySchema.parse(deactivate.json)).toMatchObject({
        error: {
          code: "CONFLICT",
          message: "Cannot deactivate or demote the last remaining Admin.",
        },
      });

      const demote = await invoke(PATCH_USER, {
        method: "PATCH",
        path: `/api/v1/users/${extra.id}`,
        params: { id: String(extra.id) },
        cookie: extraSession.cookie,
        body: { role: "member" },
      });
      expect(demote.status).toBe(409);
      expect(errorBodySchema.parse(demote.json).error.code).toBe("CONFLICT");
    } finally {
      await invoke(PATCH_USER, {
        method: "PATCH",
        path: `/api/v1/users/${admin.id}`,
        params: { id: String(admin.id) },
        cookie: extraSession.cookie,
        body: { deactivatedAt: null, role: "admin" },
      });
      await authenticateAsTestAdmin();
    }
  });

  it("returns 404 for an unknown user id", async () => {
    const result = await invoke(PATCH_USER, {
      method: "PATCH",
      path: "/api/v1/users/999999999",
      params: { id: "999999999" },
      body: { displayName: "Ghost" },
    });
    expect(result.status).toBe(404);
    expect(errorBodySchema.parse(result.json).error.code).toBe("NOT_FOUND");
  });

  it("rejects email in the patch body", async () => {
    const member = await createUser({ role: "member" });
    const result = await invoke(PATCH_USER, {
      method: "PATCH",
      path: `/api/v1/users/${member.id}`,
      params: { id: String(member.id) },
      body: { email: uniqueEmail("nope") },
    });
    expect(result.status).toBe(400);
    expect(errorBodySchema.parse(result.json).error.code).toBe(
      "VALIDATION_ERROR",
    );
  });
});
