import { z } from "zod";

import { testCaseSchema } from "./test-cases";
import {
  descriptionSchema,
  EVENTS_LIMIT_DEFAULT,
  EVENTS_LIMIT_MAX,
  idParamSchema,
  idSchema,
  isoDateTimeSchema,
  markdownTextSchema,
  STEPS_MAX,
  STEP_TEXT_MAX,
  titleSchema,
} from "./shared";

export const caseEventActionSchema = z.enum([
  "created",
  "updated",
  "moved",
  "trashed",
  "restored",
  "reverted",
]);

export type CaseEventAction = z.infer<typeof caseEventActionSchema>;

/** Full case state immediately after the event applied. Steps have no ids. */
export const caseEventSnapshotSchema = z.object({
  title: titleSchema,
  description: descriptionSchema,
  directoryId: idSchema.nullable(),
  steps: z
    .array(
      z.object({
        action: markdownTextSchema,
        expectedResult: z.string().trim().max(STEP_TEXT_MAX).nullable(),
      }),
    )
    .max(STEPS_MAX),
  deletedAt: isoDateTimeSchema.nullable(),
});

export type CaseEventSnapshot = z.infer<typeof caseEventSnapshotSchema>;

export const testCaseEventSchema = z.object({
  id: idSchema,
  testCaseId: idSchema,
  actorId: idSchema,
  actorEmail: z.string().min(1),
  actorDisplayName: z.string().min(1),
  action: caseEventActionSchema,
  revertedEventId: idSchema.nullable(),
  snapshot: caseEventSnapshotSchema,
  createdAt: isoDateTimeSchema,
});

export type TestCaseEvent = z.infer<typeof testCaseEventSchema>;

/** `{ items }` newest → oldest. `limit` is the most recent N, already in that order. */
export const testCaseEventListResponseSchema = z.object({
  items: z.array(testCaseEventSchema),
});

export type TestCaseEventListResponse = z.infer<
  typeof testCaseEventListResponseSchema
>;

export const testCaseEventsQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(EVENTS_LIMIT_MAX)
    .default(EVENTS_LIMIT_DEFAULT),
});

export type TestCaseEventsQuery = z.infer<typeof testCaseEventsQuerySchema>;

export const revertTestCaseBodySchema = z.strictObject({
  eventId: idSchema,
});

export type RevertTestCaseBody = z.infer<typeof revertTestCaseBodySchema>;

export const revertTestCaseResponseSchema = z.object({
  event: testCaseEventSchema,
  case: testCaseSchema,
});

export type RevertTestCaseResponse = z.infer<
  typeof revertTestCaseResponseSchema
>;

export const testCaseEventsParamsSchema = z.object({
  id: idParamSchema,
});
