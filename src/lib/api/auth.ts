import { eq, sql } from "drizzle-orm";

import {
  emailSchema,
  passwordSchema,
  type ChangePasswordBody,
  type LoginBody,
  type User,
} from "@/lib/contracts";
import { db, users } from "@/lib/db";

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

/** Advisory lock so two boots cannot create two bootstrap Admins. */
const BOOTSTRAP_LOCK = 87_104_611;

export type BootstrapResult = "created" | "skipped" | "env-missing";

function envTrimmed(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Create the first Admin from BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD
 * only when `users` is empty. Missing env is a no-op; invalid env throws so
 * operators notice. Safe to call on every boot and from login.
 */
export async function bootstrapAdminIfEmpty(): Promise<BootstrapResult> {
  await ensureBuiltInRoles();
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${BOOTSTRAP_LOCK})`);

    const [existing] = await tx.select({ id: users.id }).from(users).limit(1);
    if (existing) {
      return "skipped";
    }

    const emailRaw = envTrimmed("BOOTSTRAP_ADMIN_EMAIL");
    const passwordRaw = envTrimmed("BOOTSTRAP_ADMIN_PASSWORD");
    if (!emailRaw || !passwordRaw) {
      return "env-missing";
    }

    const email = emailSchema.parse(emailRaw);
    const password = passwordSchema.parse(passwordRaw);

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
