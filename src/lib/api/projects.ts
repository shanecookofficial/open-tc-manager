import { asc, eq, sql } from "drizzle-orm";

import type { CreateProjectBody, PatchProjectBody } from "@/lib/contracts";
import { db } from "@/lib/db";
import { projects, testCases } from "@/lib/db/schema";

import { ApiError, notFound } from "./errors";
import type { DbExecutor } from "./numbering";
import { isUniqueViolation } from "./pg-errors";
import { serializeProject } from "./serialize";

export async function requireProject(
  id: number,
  executor: DbExecutor = db,
  forUpdate = false,
) {
  const query = executor.select().from(projects).where(eq(projects.id, id));
  const [row] = forUpdate
    ? await query.for("update").limit(1)
    : await query.limit(1);
  if (!row) {
    notFound("Project", id);
  }
  return row;
}

export async function listProjects() {
  const rows = await db.select().from(projects).orderBy(asc(projects.name));
  return { items: rows.map(serializeProject) };
}

export async function createProject(body: CreateProjectBody) {
  try {
    const [row] = await db
      .insert(projects)
      .values({ name: body.name, prefix: body.prefix })
      .returning();
    return serializeProject(row);
  } catch (error) {
    throwProjectUnique(error, body);
  }
}

export async function updateProject(id: number, body: PatchProjectBody) {
  await requireProject(id);
  try {
    const [row] = await db
      .update(projects)
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.prefix !== undefined ? { prefix: body.prefix } : {}),
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id))
      .returning();
    if (!row) {
      notFound("Project", id);
    }
    return serializeProject(row);
  } catch (error) {
    throwProjectUnique(error, {
      name: body.name,
      prefix: body.prefix,
    });
  }
}

export async function deleteProject(id: number) {
  await requireProject(id);

  const [countRow] = await db
    .select({ n: sql<number>`cast(count(*) as integer)` })
    .from(testCases)
    .where(eq(testCases.projectId, id));

  const caseCount = Number(countRow?.n ?? 0);
  if (caseCount > 0) {
    throw new ApiError(
      "PROJECT_NOT_EMPTY",
      `Project ${id} still has ${caseCount} test cases (including trash) and cannot be deleted.`,
    );
  }

  await db.delete(projects).where(eq(projects.id, id));
}

function throwProjectUnique(
  error: unknown,
  fields: { name?: string; prefix?: string },
): never {
  if (isUniqueViolation(error, "projects_prefix_unique")) {
    throw new ApiError(
      "PREFIX_TAKEN",
      `Prefix ${fields.prefix} is already used by another project.`,
    );
  }
  if (isUniqueViolation(error, "projects_name_unique")) {
    throw new ApiError(
      "NAME_TAKEN",
      `A project named "${fields.name}" already exists.`,
    );
  }
  throw error;
}
