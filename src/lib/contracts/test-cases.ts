import { z } from "zod";

import { directoryPathSegmentSchema } from "./directories";
import {
  DESCRIPTION_MAX,
  descriptionSchema,
  directoryIdFilterSchema,
  idParamSchema,
  idSchema,
  isoDateTimeSchema,
  markdownTextSchema,
  paginatedSchema,
  paginationQuerySchema,
  searchQuerySchema,
  STEPS_MAX,
  STEP_TEXT_MAX,
  timestampsSchema,
  titleSchema,
} from "./shared";

export const testStepSchema = z.object({
  id: idSchema,
  position: z.number().int().positive(),
  action: markdownTextSchema,
  expectedResult: z.string().trim().max(STEP_TEXT_MAX).nullable(),
});

export type TestStep = z.infer<typeof testStepSchema>;

/** Step payload for create/replace — order of the array is 1-based position. */
export const testStepInputSchema = z.strictObject({
  action: markdownTextSchema,
  expectedResult: z.string().trim().max(STEP_TEXT_MAX).nullable().optional(),
});

export type TestStepInput = z.infer<typeof testStepInputSchema>;

export const testCaseSummarySchema = timestampsSchema.extend({
  id: idSchema,
  projectId: idSchema,
  directoryId: idSchema.nullable(),
  caseNumber: z.number().int().positive(),
  displayNumber: z.string().min(1),
  title: titleSchema,
  stepCount: z.number().int().min(0),
  deletedAt: isoDateTimeSchema.nullable(),
});

export type TestCaseSummary = z.infer<typeof testCaseSummarySchema>;

export const testCaseSchema = timestampsSchema.extend({
  id: idSchema,
  projectId: idSchema,
  directoryId: idSchema.nullable(),
  caseNumber: z.number().int().positive(),
  displayNumber: z.string().min(1),
  title: titleSchema,
  description: descriptionSchema,
  steps: z.array(testStepSchema),
  directoryPath: z.array(directoryPathSegmentSchema),
  deletedAt: isoDateTimeSchema.nullable(),
});

export type TestCase = z.infer<typeof testCaseSchema>;

export const testCaseListResponseSchema = paginatedSchema(
  testCaseSummarySchema,
);

export type TestCaseListResponse = z.infer<typeof testCaseListResponseSchema>;

export const testCaseListQuerySchema = paginationQuerySchema.extend({
  projectId: idParamSchema,
  directoryId: z
    .union([
      z.literal("").transform((): null => null),
      z.literal("null").transform((): null => null),
      idParamSchema,
    ])
    .optional(),
  q: searchQuerySchema.optional(),
});

export type TestCaseListQuery = z.infer<typeof testCaseListQuerySchema>;

export const trashListQuerySchema = paginationQuerySchema.extend({
  directoryId: z
    .union([
      z.literal("").transform((): null => null),
      z.literal("null").transform((): null => null),
      idParamSchema,
    ])
    .optional(),
  q: searchQuerySchema.optional(),
});

export type TrashListQuery = z.infer<typeof trashListQuerySchema>;

export const createTestCaseBodySchema = z.strictObject({
  projectId: idSchema,
  title: titleSchema,
  description: z.string().trim().max(DESCRIPTION_MAX).nullable().optional(),
  directoryId: directoryIdFilterSchema.optional(),
  steps: z.array(testStepInputSchema).max(STEPS_MAX).optional(),
});

export type CreateTestCaseBody = z.infer<typeof createTestCaseBodySchema>;

export const putTestCaseBodySchema = z.strictObject({
  title: titleSchema,
  description: descriptionSchema,
  directoryId: directoryIdFilterSchema,
  steps: z.array(testStepInputSchema).max(STEPS_MAX),
});

export type PutTestCaseBody = z.infer<typeof putTestCaseBodySchema>;

export const moveTestCaseBodySchema = z.strictObject({
  directoryId: directoryIdFilterSchema,
});

export type MoveTestCaseBody = z.infer<typeof moveTestCaseBodySchema>;

export const testCaseIdParamSchema = z.object({
  id: idParamSchema,
});

export const testCaseDisplayNumberParamSchema = z.object({
  displayNumber: z.string().regex(/^[A-Z][A-Z0-9]{1,9}-\d+$/),
});

export const softDeleteResponseSchema = testCaseSchema;

export type SoftDeleteResponse = z.infer<typeof softDeleteResponseSchema>;
