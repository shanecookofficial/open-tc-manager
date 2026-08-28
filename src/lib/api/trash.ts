import { and, eq, inArray, isNotNull } from "drizzle-orm";

import type {
  BulkCountResponse,
  BulkFilter,
  BulkSelection,
  BulkSelectionWithProject,
  TrashListQuery,
} from "@/lib/contracts";
import { db } from "@/lib/db";
import {
  directories,
  testCases,
  type TestCase as TestCaseRow,
} from "@/lib/db/schema";

import { ApiError, notFound } from "./errors";
import type { DbExecutor } from "./numbering";
import { requireProject } from "./projects";
import {
  assembleTestCase,
  assertDirectoryFilter,
  buildCaseConditions,
  queryTestCaseSummaries,
  requireTestCase,
  type CaseScope,
} from "./test-cases";

type IdSelection = { ids: number[] };
type AllSelection = { all: true; filter?: BulkFilter };

function isIdSelection(
  selection: BulkSelection | Omit<BulkSelectionWithProject, "projectId">,
): selection is IdSelection {
  return "ids" in selection;
}

async function restoreRow(executor: DbExecutor, row: TestCaseRow) {
  if (row.deletedAt === null) {
    throw new ApiError(
      "CASE_NOT_IN_TRASH",
      `Test case ${row.id} is not in the trash.`,
    );
  }

  let directoryId = row.directoryId;
  if (directoryId !== null) {
    const [dir] = await executor
      .select()
      .from(directories)
      .where(eq(directories.id, directoryId))
      .limit(1);
    if (!dir || dir.projectId !== row.projectId) {
      directoryId = null;
    }
  }

  const [updated] = await executor
    .update(testCases)
    .set({
      deletedAt: null,
      directoryId,
      updatedAt: new Date(),
    })
    .where(eq(testCases.id, row.id))
    .returning();
  return updated;
}

function throwWrongState(
  scope: CaseScope,
  id: number,
  forPurge: boolean,
): never {
  if (scope === "active") {
    throw new ApiError(
      "CASE_ALREADY_TRASHED",
      `Test case ${id} is in the trash. Restore it before editing.`,
    );
  }
  if (forPurge) {
    throw new ApiError(
      "CASE_NOT_TRASHED",
      `Test case ${id} is not in the trash and cannot be permanently deleted.`,
    );
  }
  throw new ApiError(
    "CASE_NOT_IN_TRASH",
    `Test case ${id} is not in the trash.`,
  );
}

async function resolveTargetIds(
  executor: DbExecutor,
  projectId: number,
  selection: IdSelection | AllSelection,
  scope: CaseScope,
  forPurge: boolean,
): Promise<number[]> {
  const project = await requireProject(projectId, executor);

  if (isIdSelection(selection)) {
    const uniqueIds = [...new Set(selection.ids)];
    const rows = await executor
      .select()
      .from(testCases)
      .where(inArray(testCases.id, uniqueIds));
    const byId = new Map(rows.map((row) => [row.id, row]));

    for (const id of selection.ids) {
      const row = byId.get(id);
      if (!row || row.projectId !== projectId) {
        notFound("Test case", id);
      }
      const trashed = row.deletedAt !== null;
      if (scope === "active" && trashed) {
        throwWrongState(scope, id, forPurge);
      }
      if (scope === "trashed" && !trashed) {
        throwWrongState(scope, id, forPurge);
      }
    }
    return uniqueIds;
  }

  await assertDirectoryFilter(
    projectId,
    selection.filter?.directoryId,
    executor,
  );
  const rows = await executor
    .select({ id: testCases.id })
    .from(testCases)
    .where(
      buildCaseConditions({
        projectId,
        prefix: project.prefix,
        scope,
        directoryId: selection.filter?.directoryId,
        q: selection.filter?.q,
      }),
    );
  return rows.map((row) => row.id);
}

export async function listTrash(projectId: number, query: TrashListQuery) {
  const project = await requireProject(projectId);
  return queryTestCaseSummaries(
    project,
    {
      directoryId: query.directoryId,
      q: query.q,
      scope: "trashed",
    },
    { page: query.page, pageSize: query.pageSize },
  );
}

export async function restoreTestCase(id: number) {
  const updated = await db.transaction(async (tx) => {
    const row = await requireTestCase(id, tx);
    return restoreRow(tx, row);
  });
  return assembleTestCase(updated);
}

export async function permanentlyDeleteTestCase(id: number) {
  const row = await requireTestCase(id);
  if (row.deletedAt === null) {
    throw new ApiError(
      "CASE_NOT_TRASHED",
      `Test case ${id} is not in the trash and cannot be permanently deleted.`,
    );
  }
  await db.delete(testCases).where(eq(testCases.id, id));
}

export async function bulkTrash(
  body: BulkSelectionWithProject,
): Promise<BulkCountResponse> {
  return db.transaction(async (tx) => {
    const ids = await resolveTargetIds(
      tx,
      body.projectId,
      body,
      "active",
      false,
    );
    if (ids.length === 0) {
      return { count: 0 };
    }
    const now = new Date();
    const updated = await tx
      .update(testCases)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          inArray(testCases.id, ids),
          eq(testCases.projectId, body.projectId),
        ),
      )
      .returning({ id: testCases.id });
    return { count: updated.length };
  });
}

export async function bulkRestore(
  body: BulkSelectionWithProject,
): Promise<BulkCountResponse> {
  return db.transaction(async (tx) => {
    const ids = await resolveTargetIds(
      tx,
      body.projectId,
      body,
      "trashed",
      false,
    );
    if (ids.length === 0) {
      return { count: 0 };
    }
    const rows = await tx
      .select()
      .from(testCases)
      .where(inArray(testCases.id, ids));
    for (const row of rows) {
      await restoreRow(tx, row);
    }
    return { count: rows.length };
  });
}

export async function purgeTrash(
  projectId: number,
  body: BulkSelection,
): Promise<BulkCountResponse> {
  return db.transaction(async (tx) => {
    const ids = await resolveTargetIds(tx, projectId, body, "trashed", true);
    if (ids.length === 0) {
      return { count: 0 };
    }
    const deleted = await tx
      .delete(testCases)
      .where(
        and(
          inArray(testCases.id, ids),
          eq(testCases.projectId, projectId),
          isNotNull(testCases.deletedAt),
        ),
      )
      .returning({ id: testCases.id });
    return { count: deleted.length };
  });
}
