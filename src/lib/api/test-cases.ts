import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";

import type {
  CreateTestCaseBody,
  MoveTestCaseBody,
  PaginationQuery,
  PutTestCaseBody,
  TestCase,
  TestCaseListQuery,
  TestCaseSummary,
  TestStepInput,
} from "@/lib/contracts";
import { db } from "@/lib/db";
import {
  directories,
  projects,
  testCases,
  testSteps,
  type Project as ProjectRow,
  type TestCase as TestCaseRow,
} from "@/lib/db/schema";

import { requireDirectory } from "./directories";
import { ApiError, notFound } from "./errors";
import { allocateCaseNumber, type DbExecutor } from "./numbering";
import { paginated } from "./pagination";
import { requireProject } from "./projects";
import { emptyToNull, serializeSummary, serializeTestCase } from "./serialize";

export type CaseScope = "active" | "trashed";

export type CaseFilter = {
  projectId: number;
  prefix: string;
  scope: CaseScope;
  directoryId?: number | null;
  q?: string;
};

export function parseDisplayNumber(value: string): {
  prefix: string;
  caseNumber: number;
} {
  const dash = value.indexOf("-");
  return {
    prefix: value.slice(0, dash),
    caseNumber: Number(value.slice(dash + 1)),
  };
}

export function buildCaseConditions(filter: CaseFilter) {
  const parts = [
    eq(testCases.projectId, filter.projectId),
    filter.scope === "active"
      ? isNull(testCases.deletedAt)
      : isNotNull(testCases.deletedAt),
  ];

  if (filter.directoryId !== undefined) {
    parts.push(
      filter.directoryId === null
        ? isNull(testCases.directoryId)
        : eq(testCases.directoryId, filter.directoryId),
    );
  }

  if (filter.q) {
    const needle = filter.q.toLowerCase();
    parts.push(
      sql`(
        position(${needle} in lower(${testCases.title})) > 0
        or position(${needle} in lower(${filter.prefix} || '-' || ${testCases.caseNumber}::text)) > 0
      )`,
    );
  }

  return and(...parts);
}

/** List/trash filters: missing directory → 404, even if it exists on another project. */
export async function assertDirectoryFilter(
  projectId: number,
  directoryId: number | null | undefined,
  executor: DbExecutor = db,
) {
  if (directoryId === undefined || directoryId === null) {
    return;
  }
  const [row] = await executor
    .select({ id: directories.id, projectId: directories.projectId })
    .from(directories)
    .where(eq(directories.id, directoryId))
    .limit(1);
  if (!row || row.projectId !== projectId) {
    notFound("Directory", directoryId);
  }
}

/** Mutations: other-project directory is CROSS_PROJECT, missing is 404. */
export async function assertDirectoryForWrite(
  projectId: number,
  directoryId: number | null,
  executor: DbExecutor = db,
) {
  if (directoryId === null) {
    return;
  }
  const directory = await requireDirectory(directoryId, executor);
  if (directory.projectId !== projectId) {
    throw new ApiError(
      "CROSS_PROJECT",
      "That folder belongs to a different project.",
    );
  }
}

export function assertCaseActive(row: TestCaseRow) {
  if (row.deletedAt !== null) {
    throw new ApiError(
      "CASE_ALREADY_TRASHED",
      `Test case ${row.id} is in the trash. Restore it before editing.`,
    );
  }
}

export async function requireTestCase(id: number, executor: DbExecutor = db) {
  const [row] = await executor
    .select()
    .from(testCases)
    .where(eq(testCases.id, id))
    .limit(1);
  if (!row) {
    notFound("Test case", id);
  }
  return row;
}

export async function getDirectoryPath(
  directoryId: number | null,
  executor: DbExecutor = db,
) {
  if (directoryId === null) {
    return [];
  }
  const path: { id: number; name: string }[] = [];
  let currentId: number | null = directoryId;
  const seen = new Set<number>();
  while (currentId !== null) {
    if (seen.has(currentId)) {
      break;
    }
    seen.add(currentId);
    const [dir] = await executor
      .select()
      .from(directories)
      .where(eq(directories.id, currentId))
      .limit(1);
    if (!dir) {
      break;
    }
    path.unshift({ id: dir.id, name: dir.name });
    currentId = dir.parentId;
  }
  return path;
}

export async function assembleTestCase(
  row: TestCaseRow,
  executor: DbExecutor = db,
): Promise<TestCase> {
  const project = await requireProject(row.projectId, executor);
  const steps = await executor
    .select()
    .from(testSteps)
    .where(eq(testSteps.testCaseId, row.id))
    .orderBy(asc(testSteps.position));
  const directoryPath = await getDirectoryPath(row.directoryId, executor);
  return serializeTestCase(row, project.prefix, steps, directoryPath);
}

async function insertSteps(
  executor: DbExecutor,
  testCaseId: number,
  steps: TestStepInput[],
) {
  if (steps.length === 0) {
    return;
  }
  await executor.insert(testSteps).values(
    steps.map((step, index) => ({
      testCaseId,
      position: index + 1,
      action: step.action,
      expectedResult: emptyToNull(step.expectedResult ?? null),
    })),
  );
}

export async function queryTestCaseSummaries(
  project: ProjectRow,
  filter: {
    directoryId?: number | null;
    q?: string;
    scope: CaseScope;
  },
  paging: PaginationQuery,
) {
  await assertDirectoryFilter(project.id, filter.directoryId);
  const where = buildCaseConditions({
    projectId: project.id,
    prefix: project.prefix,
    scope: filter.scope,
    directoryId: filter.directoryId,
    q: filter.q,
  });

  const [countRow] = await db
    .select({ n: sql<number>`cast(count(*) as integer)` })
    .from(testCases)
    .where(where);
  const totalItems = Number(countRow?.n ?? 0);

  const orderBy =
    filter.scope === "active"
      ? [asc(testCases.caseNumber)]
      : [desc(testCases.deletedAt), asc(testCases.caseNumber)];

  const rows = await db
    .select({
      case: testCases,
      stepCount: sql<number>`cast(count(${testSteps.id}) as integer)`,
    })
    .from(testCases)
    .leftJoin(testSteps, eq(testSteps.testCaseId, testCases.id))
    .where(where)
    .groupBy(testCases.id)
    .orderBy(...orderBy)
    .limit(paging.pageSize)
    .offset((paging.page - 1) * paging.pageSize);

  const items: TestCaseSummary[] = rows.map((row) =>
    serializeSummary(row.case, project.prefix, Number(row.stepCount)),
  );

  return paginated(paging, totalItems, items);
}

export async function listActiveTestCases(query: TestCaseListQuery) {
  const project = await requireProject(query.projectId);
  return queryTestCaseSummaries(
    project,
    {
      directoryId: query.directoryId,
      q: query.q,
      scope: "active",
    },
    { page: query.page, pageSize: query.pageSize },
  );
}

export async function createTestCase(body: CreateTestCaseBody) {
  const directoryId = body.directoryId ?? null;

  const createdId = await db.transaction(async (tx) => {
    await requireProject(body.projectId, tx);
    await assertDirectoryForWrite(body.projectId, directoryId, tx);
    const caseNumber = await allocateCaseNumber(tx, body.projectId);
    const [row] = await tx
      .insert(testCases)
      .values({
        projectId: body.projectId,
        caseNumber,
        title: body.title,
        description: emptyToNull(body.description),
        directoryId,
      })
      .returning();
    await insertSteps(tx, row.id, body.steps ?? []);
    return row.id;
  });

  return assembleTestCase(await requireTestCase(createdId));
}

export async function getTestCaseById(id: number) {
  return assembleTestCase(await requireTestCase(id));
}

export async function getTestCaseByDisplayNumber(display: string) {
  const { prefix, caseNumber } = parseDisplayNumber(display);
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.prefix, prefix))
    .limit(1);
  if (!project) {
    throw new ApiError("NOT_FOUND", `Test case ${display} does not exist.`);
  }
  const [row] = await db
    .select()
    .from(testCases)
    .where(
      and(
        eq(testCases.projectId, project.id),
        eq(testCases.caseNumber, caseNumber),
      ),
    )
    .limit(1);
  if (!row) {
    throw new ApiError("NOT_FOUND", `Test case ${display} does not exist.`);
  }
  return assembleTestCase(row);
}

export async function updateTestCase(id: number, body: PutTestCaseBody) {
  await db.transaction(async (tx) => {
    const current = await requireTestCase(id, tx);
    assertCaseActive(current);
    await assertDirectoryForWrite(current.projectId, body.directoryId, tx);
    await tx
      .update(testCases)
      .set({
        title: body.title,
        description: emptyToNull(body.description),
        directoryId: body.directoryId,
        updatedAt: new Date(),
      })
      .where(eq(testCases.id, id));
    await tx.delete(testSteps).where(eq(testSteps.testCaseId, id));
    await insertSteps(tx, id, body.steps);
  });
  return assembleTestCase(await requireTestCase(id));
}

export async function moveTestCase(id: number, body: MoveTestCaseBody) {
  const current = await requireTestCase(id);
  assertCaseActive(current);
  await assertDirectoryForWrite(current.projectId, body.directoryId);
  const [row] = await db
    .update(testCases)
    .set({ directoryId: body.directoryId, updatedAt: new Date() })
    .where(eq(testCases.id, id))
    .returning();
  return assembleTestCase(row);
}

export async function softDeleteTestCase(id: number) {
  const current = await requireTestCase(id);
  assertCaseActive(current);
  const now = new Date();
  const [row] = await db
    .update(testCases)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(testCases.id, id))
    .returning();
  return assembleTestCase(row);
}
