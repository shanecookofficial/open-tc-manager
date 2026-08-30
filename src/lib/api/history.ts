import { asc, eq } from "drizzle-orm";

import type { CaseEventAction, CaseEventSnapshot, User } from "@/lib/contracts";
import {
  testCaseEvents,
  testSteps,
  type TestCase as TestCaseRow,
  type TestCaseEvent as TestCaseEventRow,
} from "@/lib/db/schema";

import { ApiError } from "./errors";
import type { DbExecutor } from "./numbering";
import { toIso } from "./serialize";

/** Session user fields copied onto each history row at write time. */
export type EventActor = Pick<User, "id" | "email" | "displayName">;

export function requireActor(user: User | null): EventActor {
  if (!user) {
    throw new ApiError("UNAUTHENTICATED", "Sign in to continue.");
  }
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
  };
}

export function snapshotFromRow(
  row: TestCaseRow,
  steps: { action: string; expectedResult: string | null }[],
): CaseEventSnapshot {
  return {
    title: row.title,
    description: row.description,
    directoryId: row.directoryId,
    steps: steps.map((step) => ({
      action: step.action,
      expectedResult: step.expectedResult,
    })),
    deletedAt: row.deletedAt ? toIso(row.deletedAt) : null,
  };
}

export async function snapshotForCase(
  executor: DbExecutor,
  row: TestCaseRow,
): Promise<CaseEventSnapshot> {
  const steps = await executor
    .select({
      action: testSteps.action,
      expectedResult: testSteps.expectedResult,
    })
    .from(testSteps)
    .where(eq(testSteps.testCaseId, row.id))
    .orderBy(asc(testSteps.position));
  return snapshotFromRow(row, steps);
}

export async function recordCaseEvent(
  executor: DbExecutor,
  input: {
    testCaseId: number;
    actor: EventActor;
    action: CaseEventAction;
    snapshot: CaseEventSnapshot;
    revertedEventId?: number | null;
  },
): Promise<TestCaseEventRow> {
  const [row] = await executor
    .insert(testCaseEvents)
    .values({
      testCaseId: input.testCaseId,
      actorId: input.actor.id,
      actorEmail: input.actor.email,
      actorDisplayName: input.actor.displayName,
      action: input.action,
      revertedEventId: input.revertedEventId ?? null,
      snapshot: input.snapshot,
    })
    .returning();
  if (!row) {
    throw new Error("Failed to insert test_case_events row");
  }
  return row;
}

/** Snapshot the case as it stands now and append one history row. */
export async function recordMutationEvent(
  executor: DbExecutor,
  row: TestCaseRow,
  actor: EventActor,
  action: CaseEventAction,
  revertedEventId?: number | null,
): Promise<TestCaseEventRow> {
  const snapshot = await snapshotForCase(executor, row);
  return recordCaseEvent(executor, {
    testCaseId: row.id,
    actor,
    action,
    snapshot,
    revertedEventId,
  });
}
