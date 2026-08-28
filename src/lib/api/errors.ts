import { z } from "zod";

import type { ErrorBody, ErrorCode } from "@/lib/contracts";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PREFIX_TAKEN: 409,
  NAME_TAKEN: 409,
  SIBLING_NAME_TAKEN: 409,
  PROJECT_NOT_EMPTY: 409,
  DIRECTORY_NOT_EMPTY: 409,
  CYCLE_DETECTED: 409,
  CASE_NOT_TRASHED: 409,
  CASE_NOT_IN_TRASH: 409,
  CASE_ALREADY_TRASHED: 409,
  CROSS_PROJECT: 409,
  DATABASE_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};

/** Domain error thrown by route handlers and mapped to the contract envelope. */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
  }
}

type ZodIssueLike = {
  path: PropertyKey[];
  message: string;
  code?: string;
  errors?: ZodIssueLike[][];
};

/**
 * First Zod issue as `fieldPath: message` so the UI can map it to a field.
 * Nested union issues (e.g. bulk XOR envelope) are unwrapped.
 */
export function formatZodError(error: z.ZodError): string {
  const issue = unwrapIssue(error.issues[0]);
  if (!issue) {
    return "Invalid request";
  }
  const path = issue.path.map(String).join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}

function unwrapIssue(
  issue: ZodIssueLike | undefined,
): ZodIssueLike | undefined {
  if (!issue) {
    return undefined;
  }
  if (
    issue.code === "invalid_union" &&
    issue.errors &&
    issue.errors.length > 0
  ) {
    for (const branch of issue.errors) {
      const nested = unwrapIssue(branch[0]);
      if (nested && nested.path.length > 0) {
        return nested;
      }
    }
    return unwrapIssue(issue.errors[0]?.[0]) ?? issue;
  }
  return issue;
}

export function notFound(entity: string, id: number | string): never {
  throw new ApiError("NOT_FOUND", `${entity} ${id} does not exist.`);
}

export function errorBody(code: ErrorCode, message: string): ErrorBody {
  return { error: { code, message } };
}

export function toErrorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return Response.json(errorBody(error.code, error.message), {
      status: error.status,
    });
  }

  if (error instanceof z.ZodError) {
    return Response.json(errorBody("VALIDATION_ERROR", formatZodError(error)), {
      status: 400,
    });
  }

  console.error(error);
  return Response.json(
    errorBody("INTERNAL_ERROR", "An unexpected error occurred."),
    { status: 500 },
  );
}
