import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import type {
  CreateDirectoryBody,
  DirectoryDeleteMode,
  DirectoryDeleteResponse,
  PatchDirectoryBody,
  ProjectTree,
  TreeNode,
} from "@/lib/contracts";
import { db } from "@/lib/db";
import { directories, testCases } from "@/lib/db/schema";

import { ApiError, notFound } from "./errors";
import type { DbExecutor } from "./numbering";
import { isUniqueViolation } from "./pg-errors";
import { requireProject } from "./projects";
import { serializeDirectory } from "./serialize";
import { collectSubtreeIds } from "./tree-utils";

export async function requireDirectory(id: number, executor: DbExecutor = db) {
  const [row] = await executor
    .select()
    .from(directories)
    .where(eq(directories.id, id))
    .limit(1);
  if (!row) {
    notFound("Directory", id);
  }
  return row;
}

async function requireParentInProject(
  parentId: number,
  projectId: number,
  executor: DbExecutor = db,
) {
  const parent = await requireDirectory(parentId, executor);
  if (parent.projectId !== projectId) {
    throw new ApiError(
      "CROSS_PROJECT",
      "That folder belongs to a different project.",
    );
  }
  return parent;
}

function cycleDetected(): never {
  throw new ApiError(
    "CYCLE_DETECTED",
    "Cannot move a folder into itself or one of its descendants.",
  );
}

async function assertNoCycle(
  executor: DbExecutor,
  directoryId: number,
  newParentId: number | null,
) {
  if (newParentId === null) {
    return;
  }
  if (newParentId === directoryId) {
    cycleDetected();
  }
  let current: number | null = newParentId;
  const seen = new Set<number>();
  while (current !== null) {
    if (current === directoryId) {
      cycleDetected();
    }
    if (seen.has(current)) {
      cycleDetected();
    }
    seen.add(current);
    const [row] = await executor
      .select({ parentId: directories.parentId })
      .from(directories)
      .where(eq(directories.id, current))
      .limit(1);
    current = row?.parentId ?? null;
  }
}

function throwSiblingName(error: unknown, name: string): never {
  if (
    isUniqueViolation(error, "directories_project_id_parent_id_name_unique")
  ) {
    throw new ApiError(
      "SIBLING_NAME_TAKEN",
      `A folder named "${name}" already exists here.`,
    );
  }
  throw error;
}

export async function getProjectTree(projectId: number): Promise<ProjectTree> {
  const project = await requireProject(projectId);
  const dirs = await db
    .select()
    .from(directories)
    .where(eq(directories.projectId, projectId))
    .orderBy(asc(directories.name));

  const caseRows = await db
    .select({
      directoryId: testCases.directoryId,
      deletedAt: testCases.deletedAt,
    })
    .from(testCases)
    .where(eq(testCases.projectId, projectId));

  const counts = new Map<number | null, number>();
  let trashCount = 0;
  let activeCaseCount = 0;
  for (const row of caseRows) {
    if (row.deletedAt !== null) {
      trashCount += 1;
      continue;
    }
    activeCaseCount += 1;
    counts.set(row.directoryId, (counts.get(row.directoryId) ?? 0) + 1);
  }

  const childrenOf = (parentId: number | null): TreeNode[] =>
    dirs
      .filter((dir) => dir.parentId === parentId)
      .map((dir) => ({
        id: dir.id,
        name: dir.name,
        parentId: dir.parentId,
        activeCaseCount: counts.get(dir.id) ?? 0,
        children: childrenOf(dir.id),
      }));

  return {
    projectId: project.id,
    name: project.name,
    prefix: project.prefix,
    activeCaseCount,
    rootCaseCount: counts.get(null) ?? 0,
    trashCount,
    directories: childrenOf(null),
  };
}

export async function createDirectory(body: CreateDirectoryBody) {
  await requireProject(body.projectId);
  const parentId = body.parentId ?? null;
  if (parentId !== null) {
    await requireParentInProject(parentId, body.projectId);
  }

  try {
    const [row] = await db
      .insert(directories)
      .values({
        projectId: body.projectId,
        parentId,
        name: body.name,
      })
      .returning();
    return serializeDirectory(row);
  } catch (error) {
    throwSiblingName(error, body.name);
  }
}

export async function updateDirectory(id: number, body: PatchDirectoryBody) {
  const current = await requireDirectory(id);
  const nextName = body.name ?? current.name;
  const nextParentId =
    body.parentId !== undefined ? body.parentId : current.parentId;

  if (body.parentId !== undefined) {
    if (body.parentId !== null) {
      await requireParentInProject(body.parentId, current.projectId);
    }
    await assertNoCycle(db, id, body.parentId);
  }

  try {
    const [row] = await db
      .update(directories)
      .set({
        name: nextName,
        parentId: nextParentId,
        updatedAt: new Date(),
      })
      .where(eq(directories.id, id))
      .returning();
    if (!row) {
      notFound("Directory", id);
    }
    return serializeDirectory(row);
  } catch (error) {
    throwSiblingName(error, nextName);
  }
}

async function countActiveInSubtree(
  executor: DbExecutor,
  subtreeIds: number[],
): Promise<number> {
  const [row] = await executor
    .select({ n: sql<number>`cast(count(*) as integer)` })
    .from(testCases)
    .where(
      and(
        inArray(testCases.directoryId, subtreeIds),
        isNull(testCases.deletedAt),
      ),
    );
  return Number(row?.n ?? 0);
}

export async function deleteDirectory(
  id: number,
  mode: DirectoryDeleteMode | undefined,
): Promise<DirectoryDeleteResponse> {
  const directory = await requireDirectory(id);

  return db.transaction(async (tx) => {
    const dirs = await tx
      .select({
        id: directories.id,
        parentId: directories.parentId,
        name: directories.name,
        projectId: directories.projectId,
      })
      .from(directories)
      .where(eq(directories.projectId, directory.projectId));

    const subtreeIds = collectSubtreeIds(dirs, id);
    const emptyResponse = (
      counts: Omit<DirectoryDeleteResponse, "id" | "deleted" | "mode">,
    ): DirectoryDeleteResponse => ({
      id,
      deleted: true,
      mode: mode ?? null,
      trashedCaseCount: counts.trashedCaseCount,
      movedCaseCount: counts.movedCaseCount,
      movedDirectoryCount: counts.movedDirectoryCount,
    });

    if (mode === undefined) {
      const active = await countActiveInSubtree(tx, subtreeIds);
      if (active > 0) {
        throw new ApiError(
          "DIRECTORY_NOT_EMPTY",
          `Folder "${directory.name}" still has ${active} active test cases. Pass mode=trash_contents or mode=move_contents_to_parent.`,
        );
      }
      await tx.delete(directories).where(eq(directories.id, id));
      return emptyResponse({
        trashedCaseCount: 0,
        movedCaseCount: 0,
        movedDirectoryCount: 0,
      });
    }

    if (mode === "trash_contents") {
      const now = new Date();
      const trashed = await tx
        .update(testCases)
        .set({ deletedAt: now, updatedAt: now })
        .where(
          and(
            inArray(testCases.directoryId, subtreeIds),
            isNull(testCases.deletedAt),
          ),
        )
        .returning({ id: testCases.id });

      await tx.delete(directories).where(eq(directories.id, id));
      return emptyResponse({
        trashedCaseCount: trashed.length,
        movedCaseCount: 0,
        movedDirectoryCount: 0,
      });
    }

    // move_contents_to_parent
    const destinationParentId = directory.parentId;
    const movingDirs = dirs.filter((dir) => dir.parentId === id);
    const destinationSiblings = dirs.filter(
      (dir) =>
        dir.id !== id &&
        dir.parentId === destinationParentId &&
        dir.projectId === directory.projectId,
    );
    const siblingNames = new Set(destinationSiblings.map((dir) => dir.name));
    for (const child of movingDirs) {
      if (siblingNames.has(child.name)) {
        throw new ApiError(
          "SIBLING_NAME_TAKEN",
          `A folder named "${child.name}" already exists here.`,
        );
      }
    }

    const now = new Date();
    if (movingDirs.length > 0) {
      await tx
        .update(directories)
        .set({ parentId: destinationParentId, updatedAt: now })
        .where(eq(directories.parentId, id));
    }

    const movedCases = await tx
      .update(testCases)
      .set({ directoryId: destinationParentId, updatedAt: now })
      .where(and(eq(testCases.directoryId, id), isNull(testCases.deletedAt)))
      .returning({ id: testCases.id });

    await tx.delete(directories).where(eq(directories.id, id));
    return emptyResponse({
      trashedCaseCount: 0,
      movedCaseCount: movedCases.length,
      movedDirectoryCount: movingDirs.length,
    });
  });
}
