import { afterEach, describe, expect, it } from "vitest";

import { POST as LOGIN } from "@/app/api/v1/auth/login/route";
import { POST as LOGOUT } from "@/app/api/v1/auth/logout/route";
import { GET as ME } from "@/app/api/v1/auth/me/route";
import { POST as CHANGE_PASSWORD } from "@/app/api/v1/auth/password/route";
import { POST as SETUP_ADMIN } from "@/app/api/v1/auth/setup-admin/route";
import { GET as HEALTH } from "@/app/api/v1/health/route";
import { GET as PROJECTS } from "@/app/api/v1/projects/route";
import {
  DEV_BOOTSTRAP_ADMIN_EMAIL,
  DEV_BOOTSTRAP_ADMIN_PASSWORD,
  bootstrapAdminIfEmpty,
} from "@/lib/api/auth";
import { hashPassword } from "@/lib/api/password";
import { resolveSessionFromToken } from "@/lib/api/session";
import {
  cookieCleared,
  invoke,
  sessionTokenFromResponse,
  uniqueEmail,
} from "@/lib/api/test-helpers";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  errorBodySchema,
  healthResponseSchema,
  sessionUserResponseSchema,
  userSchema,
} from "@/lib/contracts";
import { db, pool, users } from "@/lib/db";

const createdUserIds: number[] = [];

function setNodeEnv(value: string | undefined) {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) {
    delete env.NODE_ENV;
    return;
  }
  env.NODE_ENV = value;
}

afterEach(async () => {
  const ids = createdUserIds.splice(0);
  if (ids.length === 0) {
    return;
  }
  await pool.query(`DELETE FROM users WHERE id = ANY($1::bigint[])`, [ids]);
});

async function insertUser(input: {
  email: string;
  password: string;
  displayName?: string;
  role?: "admin" | "member" | "viewer";
  deactivatedAt?: Date | null;
}): Promise<{ id: number; email: string; password: string }> {
  const [row] = await db
    .insert(users)
    .values({
      email: input.email,
      displayName: input.displayName ?? "Test User",
      passwordHash: await hashPassword(input.password),
      role: input.role ?? "member",
      deactivatedAt: input.deactivatedAt ?? null,
    })
    .returning({ id: users.id, email: users.email });
  if (!row) {
    throw new Error("Failed to insert test user");
  }
  createdUserIds.push(row.id);
  return { id: row.id, email: row.email, password: input.password };
}

async function login(
  email: string,
  password: string,
): Promise<ReturnType<typeof invoke>> {
  return invoke(LOGIN, {
    method: "POST",
    path: "/api/v1/auth/login",
    body: { email, password },
  });
}

describe("GET /api/v1/health (public)", () => {
  it("stays unauthenticated and does not require a session cookie", async () => {
    const result = await invoke(HEALTH, { path: "/api/v1/health" });
    expect(result.status).toBe(200);
    expect(healthResponseSchema.parse(result.json)).toEqual({
      status: "ok",
      database: "connected",
    });
  });
});

describe("bootstrap Admin", () => {
  it("is a no-op when any user already exists", async () => {
    await insertUser({
      email: uniqueEmail("existing"),
      password: "existing-password",
      role: "admin",
    });

    const previous = process.env.BOOTSTRAP_ADMIN_EMAIL;
    const previousPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    process.env.BOOTSTRAP_ADMIN_EMAIL = uniqueEmail("bootstrap");
    process.env.BOOTSTRAP_ADMIN_PASSWORD = "bootstrap-password";
    try {
      const before = await pool.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM users",
      );
      expect(await bootstrapAdminIfEmpty()).toBe("skipped");
      const after = await pool.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM users",
      );
      expect(after.rows[0].n).toBe(before.rows[0].n);
    } finally {
      if (previous === undefined) {
        delete process.env.BOOTSTRAP_ADMIN_EMAIL;
      } else {
        process.env.BOOTSTRAP_ADMIN_EMAIL = previous;
      }
      if (previousPassword === undefined) {
        delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
      } else {
        process.env.BOOTSTRAP_ADMIN_PASSWORD = previousPassword;
      }
    }
  });

  it("creates an Admin only when users is empty, and only once", async () => {
    const previousEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
    const previousPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    const email = uniqueEmail("bootonce");
    const password = "bootstrap-password";
    process.env.BOOTSTRAP_ADMIN_EMAIL = email;
    process.env.BOOTSTRAP_ADMIN_PASSWORD = password;

    await pool.query("DELETE FROM sessions");
    await pool.query("DELETE FROM users");
    createdUserIds.length = 0;

    try {
      expect(await bootstrapAdminIfEmpty()).toBe("created");
      expect(await bootstrapAdminIfEmpty()).toBe("skipped");

      const { rows } = await pool.query<{
        id: string;
        email: string;
        role: string;
        display_name: string;
      }>("SELECT id, email, role, display_name FROM users");
      expect(rows).toHaveLength(1);
      expect(rows[0].email).toBe(email);
      expect(rows[0].role).toBe("admin");
      expect(rows[0].display_name).toBe("Admin");
      createdUserIds.push(Number(rows[0].id));

      const result = await login(email, password);
      expect(result.status).toBe(200);
      const body = sessionUserResponseSchema.parse(result.json);
      expect(body.user.email).toBe(email);
      expect(body.user.role).toBe("admin");
      expect(body.user.mustSetupAccount).toBe(true);
    } finally {
      if (previousEmail === undefined) {
        delete process.env.BOOTSTRAP_ADMIN_EMAIL;
      } else {
        process.env.BOOTSTRAP_ADMIN_EMAIL = previousEmail;
      }
      if (previousPassword === undefined) {
        delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
      } else {
        process.env.BOOTSTRAP_ADMIN_PASSWORD = previousPassword;
      }
    }
  });

  it("is a no-op when env is missing outside development", async () => {
    const previousEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
    const previousPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    const previousNodeEnv = process.env.NODE_ENV;

    delete process.env.BOOTSTRAP_ADMIN_EMAIL;
    delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
    setNodeEnv("test");

    await pool.query("DELETE FROM sessions");
    await pool.query("DELETE FROM users");
    createdUserIds.length = 0;

    try {
      expect(await bootstrapAdminIfEmpty()).toBe("env-missing");
      const { rows } = await pool.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM users",
      );
      expect(rows[0].n).toBe(0);
    } finally {
      setNodeEnv(previousNodeEnv);
      if (previousEmail === undefined) {
        delete process.env.BOOTSTRAP_ADMIN_EMAIL;
      } else {
        process.env.BOOTSTRAP_ADMIN_EMAIL = previousEmail;
      }
      if (previousPassword === undefined) {
        delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
      } else {
        process.env.BOOTSTRAP_ADMIN_PASSWORD = previousPassword;
      }
    }
  });

  it("creates admin@opentcm.io in development when env is unset", async () => {
    const previousEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
    const previousPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    const previousNodeEnv = process.env.NODE_ENV;

    delete process.env.BOOTSTRAP_ADMIN_EMAIL;
    delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
    setNodeEnv("development");

    await pool.query("DELETE FROM sessions");
    await pool.query("DELETE FROM users");
    createdUserIds.length = 0;

    try {
      expect(await bootstrapAdminIfEmpty()).toBe("created");
      const { rows } = await pool.query<{
        id: string;
        email: string;
        role: string;
      }>("SELECT id, email, role FROM users");
      expect(rows).toHaveLength(1);
      expect(rows[0].email).toBe(DEV_BOOTSTRAP_ADMIN_EMAIL);
      expect(rows[0].role).toBe("admin");
      createdUserIds.push(Number(rows[0].id));

      const result = await login(
        DEV_BOOTSTRAP_ADMIN_EMAIL,
        DEV_BOOTSTRAP_ADMIN_PASSWORD,
      );
      expect(result.status).toBe(200);
      expect(
        sessionUserResponseSchema.parse(result.json).user.mustSetupAccount,
      ).toBe(true);
    } finally {
      setNodeEnv(previousNodeEnv);
      if (previousEmail === undefined) {
        delete process.env.BOOTSTRAP_ADMIN_EMAIL;
      } else {
        process.env.BOOTSTRAP_ADMIN_EMAIL = previousEmail;
      }
      if (previousPassword === undefined) {
        delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
      } else {
        process.env.BOOTSTRAP_ADMIN_PASSWORD = previousPassword;
      }
    }
  });
});

describe("POST /api/v1/auth/setup-admin", () => {
  it("blocks the rest of the API until the bootstrap Admin creates an account", async () => {
    const previousEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
    const previousPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    const bootstrapEmail = uniqueEmail("temp-admin");
    const bootstrapPassword = "opentcm-admin";
    process.env.BOOTSTRAP_ADMIN_EMAIL = bootstrapEmail;
    process.env.BOOTSTRAP_ADMIN_PASSWORD = bootstrapPassword;

    await pool.query("DELETE FROM sessions");
    await pool.query("DELETE FROM users");
    createdUserIds.length = 0;

    try {
      expect(await bootstrapAdminIfEmpty()).toBe("created");
      const loggedIn = await login(bootstrapEmail, bootstrapPassword);
      expect(loggedIn.status).toBe(200);
      const token = sessionTokenFromResponse(loggedIn.headers);
      expect(token).toBeTruthy();
      const bootstrapUser = sessionUserResponseSchema.parse(loggedIn.json).user;
      createdUserIds.push(bootstrapUser.id);
      expect(bootstrapUser.mustSetupAccount).toBe(true);

      const projects = await invoke(PROJECTS, {
        path: "/api/v1/projects",
        cookie: token,
      });
      expect(projects.status).toBe(403);
      expect(errorBodySchema.parse(projects.json).error.code).toBe(
        "SETUP_REQUIRED",
      );

      const me = await invoke(ME, { path: "/api/v1/auth/me", cookie: token });
      expect(me.status).toBe(200);

      const sameEmail = await invoke(SETUP_ADMIN, {
        method: "POST",
        path: "/api/v1/auth/setup-admin",
        cookie: token,
        body: {
          email: bootstrapEmail,
          displayName: "Ada Lovelace",
          password: "new-admin-password",
        },
      });
      expect(sameEmail.status).toBe(400);

      const samePassword = await invoke(SETUP_ADMIN, {
        method: "POST",
        path: "/api/v1/auth/setup-admin",
        cookie: token,
        body: {
          email: uniqueEmail("ada"),
          displayName: "Ada Lovelace",
          password: bootstrapPassword,
        },
      });
      expect(samePassword.status).toBe(400);

      const nextEmail = uniqueEmail("ada");
      const created = await invoke(SETUP_ADMIN, {
        method: "POST",
        path: "/api/v1/auth/setup-admin",
        cookie: token,
        body: {
          email: nextEmail,
          displayName: "Ada Lovelace",
          password: "new-admin-password",
        },
      });
      expect(created.status).toBe(200);
      const setupUser = sessionUserResponseSchema.parse(created.json).user;
      expect(setupUser.email).toBe(nextEmail);
      expect(setupUser.displayName).toBe("Ada Lovelace");
      expect(setupUser.mustSetupAccount).toBe(false);
      expect(setupUser.id).toBe(bootstrapUser.id);

      const after = await invoke(PROJECTS, {
        path: "/api/v1/projects",
        cookie: token,
      });
      expect(after.status).toBe(200);

      const again = await invoke(SETUP_ADMIN, {
        method: "POST",
        path: "/api/v1/auth/setup-admin",
        cookie: token,
        body: {
          email: uniqueEmail("other"),
          displayName: "Other",
          password: "another-password",
        },
      });
      expect(again.status).toBe(403);
    } finally {
      if (previousEmail === undefined) {
        delete process.env.BOOTSTRAP_ADMIN_EMAIL;
      } else {
        process.env.BOOTSTRAP_ADMIN_EMAIL = previousEmail;
      }
      if (previousPassword === undefined) {
        delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
      } else {
        process.env.BOOTSTRAP_ADMIN_PASSWORD = previousPassword;
      }
    }
  });
});

describe("POST /api/v1/auth/login", () => {
  it("returns { user } and sets the httpOnly session cookie", async () => {
    const email = uniqueEmail("ada");
    const password = "correct-horse";
    const created = await insertUser({
      email,
      password,
      displayName: "Ada Lovelace",
      role: "admin",
    });

    const result = await login(email, password);
    expect(result.status).toBe(200);
    const body = sessionUserResponseSchema.parse(result.json);
    expect(body.user).toMatchObject({
      id: created.id,
      email,
      displayName: "Ada Lovelace",
      role: "admin",
      deactivatedAt: null,
    });
    const rawUser = (result.json as { user: Record<string, unknown> }).user;
    expect(rawUser.password).toBeUndefined();
    expect(rawUser.passwordHash).toBeUndefined();

    const token = sessionTokenFromResponse(result.headers);
    expect(token).toBeTruthy();
    const setCookie = result.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toMatch(/Path=\//);
    expect(setCookie).toContain(`Max-Age=${SESSION_MAX_AGE_SECONDS}`);
    expect(setCookie).not.toMatch(/Secure/i);

    const { rows } = await pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM sessions WHERE user_id = $1",
      [created.id],
    );
    expect(rows[0].n).toBe(1);
  });

  it("resolveSessionFromToken rejects missing and garbage tokens", async () => {
    expect(await resolveSessionFromToken(undefined)).toBeNull();
    expect(await resolveSessionFromToken("not-a-real-session")).toBeNull();
  });

  it("returns 401 INVALID_CREDENTIALS for a wrong password", async () => {
    const email = uniqueEmail("badpw");
    await insertUser({ email, password: "correct-horse" });

    const result = await login(email, "wrong-password");
    expect(result.status).toBe(401);
    expect(errorBodySchema.parse(result.json)).toMatchObject({
      error: {
        code: "INVALID_CREDENTIALS",
        message: "Email or password is incorrect.",
      },
    });
    expect(sessionTokenFromResponse(result.headers)).toBeUndefined();
  });

  it("returns 401 INVALID_CREDENTIALS for an unknown email", async () => {
    const result = await login(uniqueEmail("nobody"), "correct-horse");
    expect(result.status).toBe(401);
    expect(errorBodySchema.parse(result.json).error.code).toBe(
      "INVALID_CREDENTIALS",
    );
  });

  it("returns 403 USER_DEACTIVATED when the password is correct", async () => {
    const email = uniqueEmail("retired");
    await insertUser({
      email,
      password: "correct-horse",
      deactivatedAt: new Date("2026-08-26T10:00:00.000Z"),
    });

    const result = await login(email, "correct-horse");
    expect(result.status).toBe(403);
    expect(errorBodySchema.parse(result.json)).toMatchObject({
      error: {
        code: "USER_DEACTIVATED",
        message: "This account has been deactivated.",
      },
    });
    expect(sessionTokenFromResponse(result.headers)).toBeUndefined();
  });

  it("still returns INVALID_CREDENTIALS for a deactivated account with a wrong password", async () => {
    const email = uniqueEmail("retired-wrong");
    await insertUser({
      email,
      password: "correct-horse",
      deactivatedAt: new Date(),
    });

    const result = await login(email, "wrong-password");
    expect(result.status).toBe(401);
    expect(errorBodySchema.parse(result.json).error.code).toBe(
      "INVALID_CREDENTIALS",
    );
  });

  it("rejects a too-short password as 400 VALIDATION_ERROR", async () => {
    const result = await login(uniqueEmail("short"), "short");
    expect(result.status).toBe(400);
    expect(errorBodySchema.parse(result.json).error.code).toBe(
      "VALIDATION_ERROR",
    );
  });
});

describe("GET /api/v1/auth/me and POST /api/v1/auth/logout", () => {
  it("returns the current user and logout invalidates the cookie", async () => {
    const email = uniqueEmail("me");
    const created = await insertUser({
      email,
      password: "correct-horse",
      displayName: "Me User",
    });
    const loggedIn = await login(email, "correct-horse");
    const token = sessionTokenFromResponse(loggedIn.headers);
    expect(token).toBeTruthy();

    const me = await invoke(ME, {
      path: "/api/v1/auth/me",
      cookie: token,
    });
    expect(me.status).toBe(200);
    const body = sessionUserResponseSchema.parse(me.json);
    expect(body.user.id).toBe(created.id);
    expect(body.user.email).toBe(email);

    const loggedOut = await invoke(LOGOUT, {
      method: "POST",
      path: "/api/v1/auth/logout",
      cookie: token,
    });
    expect(loggedOut.status).toBe(204);
    expect(loggedOut.text).toBe("");
    expect(cookieCleared(loggedOut.headers)).toBe(true);

    const meAfter = await invoke(ME, {
      path: "/api/v1/auth/me",
      cookie: token,
    });
    expect(meAfter.status).toBe(401);
    expect(errorBodySchema.parse(meAfter.json).error.code).toBe(
      "UNAUTHENTICATED",
    );

    const logoutAgain = await invoke(LOGOUT, {
      method: "POST",
      path: "/api/v1/auth/logout",
      cookie: token,
    });
    expect(logoutAgain.status).toBe(401);
  });

  it("returns 401 UNAUTHENTICATED without a session cookie", async () => {
    const me = await invoke(ME, { path: "/api/v1/auth/me" });
    expect(me.status).toBe(401);
    expect(errorBodySchema.parse(me.json).error.code).toBe("UNAUTHENTICATED");

    const logout = await invoke(LOGOUT, {
      method: "POST",
      path: "/api/v1/auth/logout",
    });
    expect(logout.status).toBe(401);
    expect(errorBodySchema.parse(logout.json).error.code).toBe(
      "UNAUTHENTICATED",
    );
  });

  it("rejects extra JSON keys on logout as VALIDATION_ERROR", async () => {
    const email = uniqueEmail("logout-body");
    await insertUser({ email, password: "correct-horse" });
    const loggedIn = await login(email, "correct-horse");
    const token = sessionTokenFromResponse(loggedIn.headers);

    const result = await invoke(LOGOUT, {
      method: "POST",
      path: "/api/v1/auth/logout",
      cookie: token,
      body: { extra: true },
    });
    expect(result.status).toBe(400);
    expect(errorBodySchema.parse(result.json).error.code).toBe(
      "VALIDATION_ERROR",
    );
  });

  it("treats an existing session as 401 after the user is deactivated", async () => {
    const email = uniqueEmail("later-deactivated");
    const created = await insertUser({ email, password: "correct-horse" });
    const loggedIn = await login(email, "correct-horse");
    const token = sessionTokenFromResponse(loggedIn.headers);

    await pool.query(`UPDATE users SET deactivated_at = now() WHERE id = $1`, [
      created.id,
    ]);

    const me = await invoke(ME, {
      path: "/api/v1/auth/me",
      cookie: token,
    });
    expect(me.status).toBe(401);
    expect(errorBodySchema.parse(me.json).error.code).toBe("UNAUTHENTICATED");
  });
});

describe("POST /api/v1/auth/password", () => {
  it("changes the caller's password and does not invalidate other sessions", async () => {
    const email = uniqueEmail("pwchange");
    await insertUser({ email, password: "correct-horse" });

    const sessionA = await login(email, "correct-horse");
    const sessionB = await login(email, "correct-horse");
    const tokenA = sessionTokenFromResponse(sessionA.headers);
    const tokenB = sessionTokenFromResponse(sessionB.headers);
    expect(tokenA).toBeTruthy();
    expect(tokenB).toBeTruthy();
    expect(tokenA).not.toBe(tokenB);

    const wrong = await invoke(CHANGE_PASSWORD, {
      method: "POST",
      path: "/api/v1/auth/password",
      cookie: tokenA,
      body: {
        currentPassword: "not-the-password",
        newPassword: "new-correct-horse",
      },
    });
    expect(wrong.status).toBe(401);
    expect(errorBodySchema.parse(wrong.json)).toMatchObject({
      error: {
        code: "INVALID_CREDENTIALS",
        message: "Current password is incorrect.",
      },
    });

    const changed = await invoke(CHANGE_PASSWORD, {
      method: "POST",
      path: "/api/v1/auth/password",
      cookie: tokenA,
      body: {
        currentPassword: "correct-horse",
        newPassword: "new-correct-horse",
      },
    });
    expect(changed.status).toBe(204);
    expect(changed.text).toBe("");

    const oldLogin = await login(email, "correct-horse");
    expect(oldLogin.status).toBe(401);

    const newLogin = await login(email, "new-correct-horse");
    expect(newLogin.status).toBe(200);
    userSchema.parse(sessionUserResponseSchema.parse(newLogin.json).user);

    const meA = await invoke(ME, { path: "/api/v1/auth/me", cookie: tokenA });
    const meB = await invoke(ME, { path: "/api/v1/auth/me", cookie: tokenB });
    expect(meA.status).toBe(200);
    expect(meB.status).toBe(200);
  });
});
