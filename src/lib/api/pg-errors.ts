import type { ErrorCode } from "@/lib/contracts";

/** Walk Drizzle/pg error wrappers to the Postgres SQLSTATE. */
export function getPgError(
  error: unknown,
): { code: string; constraint?: string } | undefined {
  let current: unknown = error;
  for (let i = 0; i < 8 && current && typeof current === "object"; i++) {
    const obj = current as {
      code?: unknown;
      constraint?: unknown;
      cause?: unknown;
    };
    if (typeof obj.code === "string" && /^\d{5}$/.test(obj.code)) {
      return {
        code: obj.code,
        constraint:
          typeof obj.constraint === "string" ? obj.constraint : undefined,
      };
    }
    current = obj.cause;
  }
  return undefined;
}

export function isUniqueViolation(
  error: unknown,
  constraint?: string,
): boolean {
  const pg = getPgError(error);
  if (pg?.code !== "23505") {
    return false;
  }
  if (!constraint) {
    return true;
  }
  return pg.constraint === constraint;
}

export type MappedPgError = { code: ErrorCode; message: string };

/**
 * Map Postgres constraint failures to the contract envelope so CHECK / FK /
 * unique races become 400/404/409 instead of 500 INTERNAL_ERROR.
 */
export function mapPgConstraintError(
  error: unknown,
): MappedPgError | undefined {
  const pg = getPgError(error);
  if (!pg) {
    return undefined;
  }

  if (pg.code === "23514") {
    switch (pg.constraint) {
      case "test_cases_title_trimmed_length":
        return {
          code: "VALIDATION_ERROR",
          message: "title: must be 1–200 characters after trimming",
        };
      case "directories_name_trimmed_length":
      case "projects_name_trimmed_length":
        return {
          code: "VALIDATION_ERROR",
          message: "name: must be 1–120 characters after trimming",
        };
      case "test_steps_action_trimmed_length":
        return {
          code: "VALIDATION_ERROR",
          message: "action: must not be blank",
        };
      case "projects_prefix_format":
        return {
          code: "VALIDATION_ERROR",
          message:
            "prefix: must be 2–10 uppercase letters/digits starting with a letter",
        };
      default:
        return {
          code: "VALIDATION_ERROR",
          message: "Value rejected by a database constraint.",
        };
    }
  }

  if (pg.code === "23503") {
    if (pg.constraint?.includes("directory")) {
      return { code: "NOT_FOUND", message: "Directory does not exist." };
    }
    if (pg.constraint?.includes("project")) {
      return { code: "NOT_FOUND", message: "Project does not exist." };
    }
    if (pg.constraint?.includes("test_case")) {
      return { code: "NOT_FOUND", message: "Test case does not exist." };
    }
    return { code: "NOT_FOUND", message: "Referenced record does not exist." };
  }

  if (pg.code === "23505") {
    switch (pg.constraint) {
      case "directories_project_id_parent_id_name_unique":
        return {
          code: "SIBLING_NAME_TAKEN",
          message: "A folder with that name already exists here.",
        };
      case "projects_prefix_unique":
        return {
          code: "PREFIX_TAKEN",
          message: "That prefix is already used by another project.",
        };
      case "projects_name_unique":
        return {
          code: "NAME_TAKEN",
          message: "A project with that name already exists.",
        };
      default:
        return {
          code: "CONFLICT",
          message: "A uniqueness constraint was violated.",
        };
    }
  }

  return undefined;
}
