import { eq, sql } from "drizzle-orm";

import {
  emailSchema,
  passwordSchema,
  type ChangePasswordBody,
  type LoginBody,
  type User,
} from "@/lib/contracts";
import { db, users } from "@/lib/db";

import { resolveBootstrapCredentials } from "@/lib/auth/bootstrap-credentials";

import { ApiError } from "./errors";
import { hashPassword, verifyPassword } from "./password";
import { ensureBuiltInRoles, getRoleBySlug } from "./role-records";
import { serializeUser } from "./serialize";
import {
  clearSessionCookie,
  createSession,
  destroySession,
  sessionCookieHeader,
} from "./session";

export {
  DEV_BOOTSTRAP_ADMIN_EMAIL,
  DEV_BOOTSTRAP_ADMIN_PASSWORD,
  resolveBootstrapCredentials,
} from "@/lib/auth/bootstrap-credentials";

/** Advisory lock so two boots cannot create two bootstrap Admins. */
const BOOTSTRAP_LOCK = 87_104_611;

export type BootstrapResult = "created" | "skipped" | "env-missing";

/**
 * Create the first Admin from BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD
 * only when `users` is empty. Missing env is a no-op in production; in
 * development the documented `admin@opentcm.io` account is created instead.
 * Invalid env throws so operators notice. Safe to call on every boot and
 * from login. Does not create projects or cases.
 */
export async function bootstrapAdminIfEmpty(): Promise<BootstrapResult> {
  await ensureBuiltInRoles();
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${BOOTSTRAP_LOCK})`);

    const [existing] = await tx.select({ id: users.id }).from(users).limit(1);
    if (existing) {
      return "skipped";
    }

    const credentials = resolveBootstrapCredentials();
    if (!credentials) {
      return "env-missing";
    }

    const email = emailSchema.parse(credentials.email);
    const password = passwordSchema.parse(credentials.password);

    await tx.insert(users).values({
      email,
      displayName: "Admin",
      passwordHash: await hashPassword(password),
      role: "admin",
    });

    return "created";
  });
}

export async function login(
  body: LoginBody,
): Promise<{ user: User; cookie: string }> {
  await bootstrapAdminIfEmpty();

  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.email, body.email))
    .limit(1);

  if (!row || !(await verifyPassword(row.passwordHash, body.password))) {
    throw new ApiError(
      "INVALID_CREDENTIALS",
      "Email or password is incorrect.",
    );
  }

  if (row.deactivatedAt) {
    throw new ApiError(
      "USER_DEACTIVATED",
      "This account has been deactivated.",
    );
  }

  const { token } = await createSession(row.id);
  const role = await getRoleBySlug(row.role);
  return {
    user: serializeUser(row, role),
    cookie: sessionCookieHeader(token),
  };
}

export async function logoutSession(
  sessionId: number,
): Promise<{ cookie: string }> {
  await destroySession(sessionId);
  return { cookie: clearSessionCookie() };
}

export async function changeOwnPassword(
  userId: number,
  body: ChangePasswordBody,
): Promise<void> {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) {
    throw new ApiError("UNAUTHENTICATED", "Sign in to continue.");
  }

  if (!(await verifyPassword(row.passwordHash, body.currentPassword))) {
    throw new ApiError("INVALID_CREDENTIALS", "Current password is incorrect.");
  }

  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(body.newPassword),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}
