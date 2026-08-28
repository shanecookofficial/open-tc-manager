import type {
  Directory as DirectoryRow,
  Project as ProjectRow,
  TestCase as TestCaseRow,
  TestStep as TestStepRow,
} from "@/lib/db/schema";
import type {
  Directory,
  DirectoryPathSegment,
  Project,
  TestCase,
  TestCaseSummary,
  TestStep,
} from "@/lib/contracts";

export function toIso(date: Date): string {
  return date.toISOString();
}

export function emptyToNull(value: string | null | undefined): string | null {
  if (value == null || value.length === 0) {
    return null;
  }
  return value;
}

export function displayNumber(prefix: string, caseNumber: number): string {
  return `${prefix}-${caseNumber}`;
}

export function serializeProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    nextCaseNumber: row.nextCaseNumber,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export function serializeDirectory(row: DirectoryRow): Directory {
  return {
    id: row.id,
    projectId: row.projectId,
    parentId: row.parentId,
    name: row.name,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export function serializeStep(row: TestStepRow): TestStep {
  return {
    id: row.id,
    position: row.position,
    action: row.action,
    expectedResult: row.expectedResult,
  };
}

export function serializeSummary(
  row: TestCaseRow,
  prefix: string,
  stepCount: number,
): TestCaseSummary {
  return {
    id: row.id,
    projectId: row.projectId,
    directoryId: row.directoryId,
    caseNumber: row.caseNumber,
    displayNumber: displayNumber(prefix, row.caseNumber),
    title: row.title,
    stepCount,
    deletedAt: row.deletedAt ? toIso(row.deletedAt) : null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export function serializeTestCase(
  row: TestCaseRow,
  prefix: string,
  steps: TestStepRow[],
  directoryPath: DirectoryPathSegment[],
): TestCase {
  return {
    id: row.id,
    projectId: row.projectId,
    directoryId: row.directoryId,
    caseNumber: row.caseNumber,
    displayNumber: displayNumber(prefix, row.caseNumber),
    title: row.title,
    description: row.description,
    steps: steps.map(serializeStep),
    directoryPath,
    deletedAt: row.deletedAt ? toIso(row.deletedAt) : null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}
