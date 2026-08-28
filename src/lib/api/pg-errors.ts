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
