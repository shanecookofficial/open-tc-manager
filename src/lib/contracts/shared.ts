import { z } from "zod";

/** Matches PLAN §5: uppercase, 2–10 characters, letter first. */
export const PREFIX_PATTERN = /^[A-Z][A-Z0-9]{1,9}$/;

/** Human-facing case id, e.g. `WEB-42`. */
export const DISPLAY_NUMBER_PATTERN = /^[A-Z][A-Z0-9]{1,9}-\d+$/;

export const NAME_MAX = 120;
export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 100_000;
export const STEP_TEXT_MAX = 20_000;
export const STEPS_MAX = 500;
export const QUERY_MAX = 200;
export const PAGE_SIZE_DEFAULT = 50;
export const PAGE_SIZE_MAX = 200;
export const DISPLAY_NAME_MAX = 80;
export const EMAIL_MAX = 254;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 256;
export const EVENTS_LIMIT_DEFAULT = 500;
export const EVENTS_LIMIT_MAX = 500;

/** JSON resource ids (PostgreSQL BIGINT, JS-safe integer). */
export const idSchema = z.number().int().positive();

/** Path-param ids arrive as strings. */
export const idParamSchema = z.coerce.number().int().positive();

export const prefixSchema = z.string().regex(PREFIX_PATTERN, {
  message:
    "Prefix must be 2–10 uppercase letters/digits and start with a letter",
});

export const displayNumberSchema = z.string().regex(DISPLAY_NUMBER_PATTERN, {
  message: "Display number must look like PREFIX-n (e.g. WEB-42)",
});

export const nameSchema = z.string().trim().min(1).max(NAME_MAX);

export const titleSchema = z.string().trim().min(1).max(TITLE_MAX);

export const descriptionSchema = z
  .string()
  .trim()
  .max(DESCRIPTION_MAX)
  .nullable();

export const markdownTextSchema = z.string().trim().min(1).max(STEP_TEXT_MAX);

export const isoDateTimeSchema = z.iso.datetime();

export const timestampsSchema = z.object({
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const errorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "CONFLICT",
  "PREFIX_TAKEN",
  "NAME_TAKEN",
  "SIBLING_NAME_TAKEN",
  "PROJECT_NOT_EMPTY",
  "DIRECTORY_NOT_EMPTY",
  "CYCLE_DETECTED",
  "CASE_NOT_TRASHED",
  "CASE_NOT_IN_TRASH",
  "CASE_ALREADY_TRASHED",
  "CROSS_PROJECT",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "INVALID_CREDENTIALS",
  "USER_DEACTIVATED",
  "EMAIL_TAKEN",
  "DATABASE_UNAVAILABLE",
  "INTERNAL_ERROR",
]);

export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const errorBodySchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string().min(1),
  }),
});

export type ErrorBody = z.infer<typeof errorBodySchema>;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(PAGE_SIZE_MAX)
    .default(PAGE_SIZE_DEFAULT),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export function paginatedSchema<T extends z.ZodType>(itemSchema: T) {
  return z.object({
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(PAGE_SIZE_MAX),
    totalItems: z.number().int().min(0),
    totalPages: z.number().int().min(0),
    items: z.array(itemSchema),
  });
}

export type Paginated<T> = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  items: T[];
};

/**
 * `directoryId` query/filter:
 * - omitted / `undefined` → do not filter by directory (whole project)
 * - `null` → only cases at the project root (`directory_id IS NULL`)
 * - number → only that directory (direct children, not recursive)
 */
export const directoryIdFilterSchema = idSchema.nullable();

export const bulkFilterSchema = z.strictObject({
  directoryId: directoryIdFilterSchema.optional(),
  q: z.string().trim().min(1).max(QUERY_MAX).optional(),
});

export type BulkFilter = z.infer<typeof bulkFilterSchema>;

/** `{ ids }` XOR `{ all: true, filter? }` — unknown extra keys are rejected. */
export const bulkSelectionSchema = z.union([
  z.strictObject({
    ids: z.array(idSchema).min(1),
  }),
  z.strictObject({
    all: z.literal(true),
    filter: bulkFilterSchema.optional(),
  }),
]);

export type BulkSelection = z.infer<typeof bulkSelectionSchema>;

/** Bulk trash/restore: project is not in the URL, so `projectId` is required. */
export const bulkSelectionWithProjectSchema = z.union([
  z.strictObject({
    projectId: idSchema,
    ids: z.array(idSchema).min(1),
  }),
  z.strictObject({
    projectId: idSchema,
    all: z.literal(true),
    filter: bulkFilterSchema.optional(),
  }),
]);

export type BulkSelectionWithProject = z.infer<
  typeof bulkSelectionWithProjectSchema
>;

export const bulkCountResponseSchema = z.object({
  count: z.number().int().min(0),
});

export type BulkCountResponse = z.infer<typeof bulkCountResponseSchema>;

export const searchQuerySchema = z.string().trim().min(1).max(QUERY_MAX);

export const userRoleSchema = z.enum(["admin", "member", "viewer"]);

export type UserRole = z.infer<typeof userRoleSchema>;

/** Stored and compared lowercased. */
export const emailSchema = z
  .string()
  .trim()
  .min(1)
  .max(EMAIL_MAX)
  .toLowerCase()
  .pipe(z.email());

export const displayNameSchema = z.string().trim().min(1).max(DISPLAY_NAME_MAX);

export const passwordSchema = z
  .string()
  .trim()
  .min(PASSWORD_MIN)
  .max(PASSWORD_MAX);
