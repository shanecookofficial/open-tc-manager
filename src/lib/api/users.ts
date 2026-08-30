import { and, asc, eq, isNull, sql } from "drizzle-orm";

import type { CreateUserBody, PatchUserBody, User } from "@/lib/contracts";
import { db, roles, users } from "@/lib/db";

import { ApiError, notFound } from "./errors";
import { hashPassword } from "./password";
import { isUniqueViolation } from "./pg-errors";
import { requireRoleSlug } from "./role-records";
import { serializeUser } from "./serialize";

const LAST_ADMIN_LOCK = 87_104_612;

export async function listUsers(): Promise<{ items: User[] }> {
  const rows = await db
    .select({ user: users, role: roles })
    .from(users)
    .leftJoin(roles, eq(users.role, roles.slug))
    .orderBy(asc(users.email));
  return { items: rows.map((row) => serializeUser(row.user, row.role)) };
}

export async function createUser(body: CreateUserBody): Promise<User> {
  const role = await requireRoleSlug(body.role);
  try {
    const [row] = await db
      .insert(users)
      .values({
        email: body.email,
        displayName: body.displayName,
        passwordHash: await hashPassword(body.password),
        role: body.role,
      })
      .returning();
    if (!row) {
      throw new Error("Failed to create user");
    }
    return serializeUser(row, role);
  } catch (error) {
    if (
      isUniqueViolation(error, "users_email_unique") ||
      isUniqueViolation(error, "users_email_lower_unique")
    ) {
      throw new ApiError(
        "EMAIL_TAKEN",
        "A user with that email already exists.",
      );
    }
    throw error;
  }
}

export async function updateUser(
  id: number,
  body: PatchUserBody,
): Promise<User> {
  const passwordHash =
    body.password !== undefined ? await hashPassword(body.password) : undefined;

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${LAST_ADMIN_LOCK})`);

    const [target] = await tx
      .select()
      .from(users)
      .where(eq(users.id, id))
      .for("update")
      .limit(1);
    if (!target) {
      notFound("User", id);
    }

    const wouldDeactivate =
      body.deactivatedAt !== undefined && body.deactivatedAt !== null;
    if (body.role !== undefined) {
      await requireRoleSlug(body.role);
    }

    const wouldDemote = body.role !== undefined && body.role !== "admin";
    if (
      (wouldDeactivate || wouldDemote) &&
      target.role === "admin" &&
      target.deactivatedAt === null
    ) {
      const [countRow] = await tx
        .select({ n: sql<number>`cast(count(*) as integer)` })
        .from(users)
        .where(and(eq(users.role, "admin"), isNull(users.deactivatedAt)));
      if (Number(countRow?.n ?? 0) <= 1) {
        throw new ApiError(
          "CONFLICT",
          "Cannot deactivate or demote the last remaining Admin.",
        );
      }
    }

    const [row] = await tx
      .update(users)
      .set({
        ...(body.displayName !== undefined
          ? { displayName: body.displayName }
          : {}),
        ...(body.role !== undefined ? { role: body.role } : {}),
        ...(body.deactivatedAt !== undefined
          ? {
              deactivatedAt:
                body.deactivatedAt === null
                  ? null
                  : new Date(body.deactivatedAt),
            }
          : {}),
        ...(passwordHash !== undefined ? { passwordHash } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    if (!row) {
      notFound("User", id);
    }
    const assigned = await requireRoleSlug(row.role);
    return serializeUser(row, assigned);
  });
}
