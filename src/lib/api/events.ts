import { desc, eq } from "drizzle-orm";

import {
  caseEventSnapshotSchema,
  type RevertTestCaseResponse,
  type TestCaseEventListResponse,
  type TestCaseEventsQuery,
} from "@/lib/contracts";
import { db } from "@/lib/db";
import { directories, testCaseEvents, testCases } from "@/lib/db/schema";

import { ApiError, notFound } from "./errors";
import { recordCaseEvent, type EventActor } from "./history";
import type { DbExecutor } from "./numbering";
import { emptyToNull, serializeTestCaseEvent } from "./serialize";
import {
  assembleTestCase,
  replaceTestCaseSteps,
  requireTestCase,
} from "./test-cases";

async function directoryIdForSnapshot(
  executor: DbExecutor,
  projectId: number,
  directoryId: number | null,
): Promise<number | null> {
  if (directoryId === null) {
    return null;
  }
  const [dir] = await executor
    .select({ id: directories.id, projectId: directories.projectId })
    .from(directories)
    .where(eq(directories.id, directoryId))
    .limit(1);
  if (!dir || dir.projectId !== projectId) {
    return null;
  }
  return directoryId;
}

/** Newest → oldest. `query.limit` is the most recent N events in that order. */
export async function listCaseEvents(
  testCaseId: number,
  query: TestCaseEventsQuery,
): Promise<TestCaseEventListResponse> {
  await requireTestCase(testCaseId);
  const recent = await db
    .select()
    .from(testCaseEvents)
    .where(eq(testCaseEvents.testCaseId, testCaseId))
    .orderBy(desc(testCaseEvents.createdAt), desc(testCaseEvents.id))
    .limit(query.limit);
  return { items: recent.map(serializeTestCaseEvent) };}
}

export async function revertTestCase(
  testCaseId: number,
  eventId: number,
  actor: EventActor,
): Promise<RevertTestCaseResponse> {
  return db.transaction(async (tx) => {
    const current = await requireTestCase(testCaseId, tx, true);
    const [target] = await tx
      .select()
      .from(testCaseEvents)
      .where(eq(testCaseEvents.id, eventId))
      .limit(1);
    if (!target) {
      notFound("Event", eventId);
    }
    if (target.testCaseId !== testCaseId) {
      throw new ApiError(
        "CONFLICT",
        `Event ${eventId} does not belong to test case ${testCaseId}.`,
      );
    }

    const snapshot = caseEventSnapshotSchema.parse(target.snapshot);
    const directoryId = await directoryIdForSnapshot(
      tx,
      current.projectId,
      snapshot.directoryId,
    );
    const [updated] = await tx
      .update(testCases)
      .set({
        title: snapshot.title,
        description: emptyToNull(snapshot.description),
        directoryId,
        deletedAt: snapshot.deletedAt ? new Date(snapshot.deletedAt) : null,
        updatedAt: new Date(),
      })
      .where(eq(testCases.id, testCaseId))
      .returning();

    await replaceTestCaseSteps(tx, testCaseId, snapshot.steps);

    const eventRow = await recordCaseEvent(tx, {
      testCaseId,
      actor,
      action: "reverted",
      snapshot,
      revertedEventId: eventId,
    });

    return {
      event: serializeTestCaseEvent(eventRow),
      case: await assembleTestCase(updated, tx),
    };
  });
}
