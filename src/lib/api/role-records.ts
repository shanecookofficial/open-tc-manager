import { asc, eq, sql } from "drizzle-orm";

import type { CreateRoleBody, PatchRoleBody, Role } from "@/lib/contracts";
import {
  ADMIN_PERMISSIONS,
  MEMBER_PERMISSIONS,
  VIEWER_PERMISSIONS,
  userRoleSchema,
} from "@/lib/contracts";
import { db, roles, users } from "@/lib/db";
import type { Role as RoleRow } from "@/lib/db/schema";

import { ApiError, notFound } from "./errors";
import { isUniqueViolation } from "./pg-errors";
import { serializeRole } from "./serialize";

export async function getRoleBySlug(slug: string): Promise<RoleRow | undefined> {
  const [row] = await db.select().from(roles).where(eq(roles.slug, slug)).limit(1);
  return row;
}

export async function requireRoleSlug(slug: string): Promise<RoleRow> {
  const row = await getRoleBySlug(slug);
  if (!row) {
    throw new ApiError("NOT_FOUND", `Role "${slug}" was not found.`);
  }
  return row;
}

/**
 * Insert the locked Admin role if missing. Insert Member and Viewer only when
 * the roles table is empty so an Admin who deleted them is not undone.
 */
export async function ensureBuiltInRoles(): Promise<void> {
  const existing = await db.select({ slug: roles.slug }).from(roles);
  if (existing.length === 0) {
    await db.insert(roles).values([
      {
        slug: "admin",
        name: "Admin",
        description: "Full instance access. Cannot be deleted.",
        builtIn: true,
        locked: true,
        permissions: ADMIN_PERMISSIONS,
      },
      {
        slug: "member",
        name: "Member",
        description: "Create and edit test cases and folders.",
        builtIn: true,
        locked: false,
        permissions: MEMBER_PERMISSIONS,
      },
      {
        slug: "viewer",
        name: "Viewer",
        description: "Read-only access.",
        builtIn: true,
        locked: false,
        permissions: VIEWER_PERMISSIONS,
      },
    ]);
    return;
  }
  if (!existing.some((row) => row.slug === "admin")) {
    await db.insert(roles).values({
      slug: "admin",
      name: "Admin",
      description: "Full instance access. Cannot be deleted.",
      builtIn: true,
      locked: true,
      permissions: ADMIN_PERMISSIONS,
    });
  }
}

export function slugifyRoleName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return userRoleSchema.parse(slug || "role");
}

async function uniqueSlug(base: string): Promise<string> {
  if (base === "admin") {
    throw new ApiError("ROLE_LOCKED", "The Admin role cannot be created or replaced.");
  }
  const taken = new Set(
    (await db.select({ slug: roles.slug }).from(roles)).map((row) => row.slug),
  );
  if (!taken.has(base)) {
    return base;
  }
  for (let n = 2; n < 100; n += 1) {
    const candidate = `${base.slice(0, 38)}-${n}`.slice(0, 40);
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
  throw new ApiError("CONFLICT", "Could not allocate a unique role slug.");
}

export async function listRoles(): Promise<{ items: Role[] }> {
  const rows = await db.select().from(roles).orderBy(asc(roles.locked), asc(roles.name));
  return { items: rows.map(serializeRole) };
}

export async function createRole(body: CreateRoleBody): Promise<Role> {
  const slug = await uniqueSlug(slugifyRoleName(body.name));
  try {
    const [row] = await db
      .insert(roles)
      .values({
        slug,
        name: body.name,
        description: body.description?.trim() ? body.description.trim() : null,
        builtIn: false,
        locked: false,
        permissions: body.permissions,
      })
      .returning();
    if (!row) {
      throw new Error("Failed to create role");
    }
    return serializeRole(row);
  } catch (error) {
    if (isUniqueViolation(error, "roles_name_unique")) {
      throw new ApiError("NAME_TAKEN", "A role with that name already exists.");
    }
    if (isUniqueViolation(error, "roles_slug_unique")) {
      throw new ApiError("CONFLICT", "A role with that slug already exists.");
    }
    throw error;
  }
}

export async function updateRole(id: number, body: PatchRoleBody): Promise<Role> {
  const [target] = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
  if (!target) {
    notFound("Role", id);
  }
  if (target.locked) {
    throw new ApiError("ROLE_LOCKED", "The Admin role cannot be edited.");
  }

  try {
    const [row] = await db
      .update(roles)
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined
          ? {
              description: body.description?.trim()
                ? body.description.trim()
                : null,
            }
          : {}),
        ...(body.permissions !== undefined
          ? { permissions: body.permissions }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(roles.id, id))
      .returning();
    if (!row) {
      notFound("Role", id);
    }
    return serializeRole(row);
  } catch (error) {
    if (isUniqueViolation(error, "roles_name_unique")) {
      throw new ApiError("NAME_TAKEN", "A role with that name already exists.");
    }
    throw error;
  }
}

export async function deleteRole(id: number): Promise<void> {
  const [target] = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
  if (!target) {
    notFound("Role", id);
  }
  if (target.locked) {
    throw new ApiError("ROLE_LOCKED", "The Admin role cannot be deleted.");
  }

  const [countRow] = await db
    .select({ n: sql<number>`cast(count(*) as integer)` })
    .from(users)
    .where(eq(users.role, target.slug));
  if (Number(countRow?.n ?? 0) > 0) {
    throw new ApiError(
      "ROLE_IN_USE",
      `Cannot delete "${target.name}" while users still have that role.`,
    );
  }

  await db.delete(roles).where(eq(roles.id, id));
}
