import type {
  Directory as DirectoryRow,
  Project as ProjectRow,
  TestCase as TestCaseRow,
  TestCaseEvent as TestCaseEventRow,
  TestStep as TestStepRow,
  User as UserRow,
} from "@/lib/db/schema";
import type {
  CaseEventAction,
  Directory,
  DirectoryPathSegment,
  Project,
  TestCase,
  TestCaseEvent,
  TestCaseSummary,
  TestStep,
  User,
  UserRole,
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

export function serializeUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role as UserRole,
    deactivatedAt: row.deactivatedAt ? toIso(row.deactivatedAt) : null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export function serializeTestCaseEvent(row: TestCaseEventRow): TestCaseEvent {
  return {
    id: row.id,
    testCaseId: row.testCaseId,
    actorId: row.actorId,
    actorEmail: row.actorEmail,
    actorDisplayName: row.actorDisplayName,
    action: row.action as CaseEventAction,
    revertedEventId: row.revertedEventId,
    snapshot: row.snapshot,
    createdAt: toIso(row.createdAt),
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
