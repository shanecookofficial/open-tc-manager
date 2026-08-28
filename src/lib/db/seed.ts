/**
 * Idempotent demo seed for local development and integration walkthroughs.
 *
 * Idempotency strategy (safe to run repeatedly):
 * - Projects: upsert by unique `prefix` (WEB, API). Existing rows are reused.
 * - Directories: upsert by `(project_id, parent_id, name)` — the same UNIQUE
 *   constraint the API enforces for sibling names.
 * - Test cases: upsert by `(project_id, case_number)`. Steps are replaced only
 *   when the case row is newly inserted (re-runs never duplicate or mutate cases).
 * - After all inserts, `next_case_number` is set to `max(case_number) + 1` per
 *   project so the counter stays consistent with seeded data.
 *
 * Content mirrors `src/lib/contracts/fixtures.ts` (names, prefixes, markdown)
 * but database ids are assigned by Postgres and will differ from fixture ids.
 */
import "dotenv/config";

import { and, eq, isNull, max, sql } from "drizzle-orm";

import { createFixtures } from "@/lib/contracts/fixtures";

import { db, pool } from "./index";
import { directories, projects, testCases, testSteps } from "./schema";

async function findDirectory(
  projectId: number,
  parentId: number | null,
  name: string,
) {
  const conditions = [
    eq(directories.projectId, projectId),
    eq(directories.name, name),
    parentId === null
      ? isNull(directories.parentId)
      : eq(directories.parentId, parentId),
  ];

  const [row] = await db
    .select()
    .from(directories)
    .where(and(...conditions))
    .limit(1);

  return row;
}

async function findTestCase(projectId: number, caseNumber: number) {
  const [row] = await db
    .select()
    .from(testCases)
    .where(
      and(
        eq(testCases.projectId, projectId),
        eq(testCases.caseNumber, caseNumber),
      ),
    )
    .limit(1);

  return row;
}

async function syncNextCaseNumber(projectId: number) {
  const [result] = await db
    .select({ value: max(testCases.caseNumber) })
    .from(testCases)
    .where(eq(testCases.projectId, projectId));

  const nextCaseNumber = (result?.value ?? 0) + 1;

  await db
    .update(projects)
    .set({ nextCaseNumber, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
}

async function seed() {
  const fixtures = createFixtures();

  const projectIdByFixtureId = new Map<number, number>();
  const directoryIdByFixtureId = new Map<number, number>();

  for (const fixtureProject of fixtures.projects) {
    const [existing] = await db
      .select()
      .from(projects)
      .where(eq(projects.prefix, fixtureProject.prefix))
      .limit(1);

    const project =
      existing ??
      (
        await db
          .insert(projects)
          .values({
            name: fixtureProject.name,
            prefix: fixtureProject.prefix,
            nextCaseNumber: 1,
            createdAt: new Date(fixtureProject.createdAt),
            updatedAt: new Date(fixtureProject.updatedAt),
          })
          .returning()
      )[0];

    projectIdByFixtureId.set(fixtureProject.id, project.id);
  }

  const fixtureDirs = [...fixtures.directories].sort((a, b) => {
    if (a.parentId === null && b.parentId !== null) {
      return -1;
    }
    if (a.parentId !== null && b.parentId === null) {
      return 1;
    }
    return a.id - b.id;
  });

  for (const fixtureDir of fixtureDirs) {
    const projectId = projectIdByFixtureId.get(fixtureDir.projectId);
    if (projectId === undefined) {
      throw new Error(`Unknown fixture project id ${fixtureDir.projectId}`);
    }

    const parentId =
      fixtureDir.parentId === null
        ? null
        : (directoryIdByFixtureId.get(fixtureDir.parentId) ?? null);

    if (fixtureDir.parentId !== null && parentId === null) {
      throw new Error(
        `Parent directory ${fixtureDir.parentId} not seeded before ${fixtureDir.name}`,
      );
    }

    const existing = await findDirectory(projectId, parentId, fixtureDir.name);

    const directory =
      existing ??
      (
        await db
          .insert(directories)
          .values({
            projectId,
            parentId,
            name: fixtureDir.name,
            createdAt: new Date(fixtureDir.createdAt),
            updatedAt: new Date(fixtureDir.updatedAt),
          })
          .returning()
      )[0];

    directoryIdByFixtureId.set(fixtureDir.id, directory.id);
  }

  let insertedCases = 0;

  for (const fixtureCase of fixtures.testCases) {
    const projectId = projectIdByFixtureId.get(fixtureCase.projectId);
    if (projectId === undefined) {
      throw new Error(`Unknown fixture project id ${fixtureCase.projectId}`);
    }

    const existing = await findTestCase(projectId, fixtureCase.caseNumber);
    if (existing) {
      continue;
    }

    const directoryId =
      fixtureCase.directoryId === null
        ? null
        : (directoryIdByFixtureId.get(fixtureCase.directoryId) ?? null);

    if (fixtureCase.directoryId !== null && directoryId === null) {
      throw new Error(
        `Directory ${fixtureCase.directoryId} not found for case ${fixtureCase.displayNumber}`,
      );
    }

    const [insertedCase] = await db
      .insert(testCases)
      .values({
        projectId,
        caseNumber: fixtureCase.caseNumber,
        title: fixtureCase.title,
        description: fixtureCase.description,
        directoryId,
        deletedAt:
          fixtureCase.deletedAt === null
            ? null
            : new Date(fixtureCase.deletedAt),
        createdAt: new Date(fixtureCase.createdAt),
        updatedAt: new Date(fixtureCase.updatedAt),
      })
      .returning();

    if (fixtureCase.steps.length > 0) {
      await db.insert(testSteps).values(
        fixtureCase.steps.map((step) => ({
          testCaseId: insertedCase.id,
          position: step.position,
          action: step.action,
          expectedResult: step.expectedResult,
        })),
      );
    }

    insertedCases += 1;
  }

  for (const projectId of projectIdByFixtureId.values()) {
    await syncNextCaseNumber(projectId);
  }

  const countResult = await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM projects) AS projects,
      (SELECT count(*)::int FROM directories) AS directories,
      (SELECT count(*)::int FROM test_cases) AS test_cases,
      (SELECT count(*)::int FROM test_steps) AS test_steps
  `);

  const counts = countResult.rows[0] as {
    projects: number;
    directories: number;
    test_cases: number;
    test_steps: number;
  };

  console.log(
    `Seed complete (${insertedCases} new case(s)). Row counts:`,
    counts,
  );
}

seed()
  .catch((error: unknown) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
