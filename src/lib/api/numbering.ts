import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";

import { notFound } from "./errors";

/** Drizzle db or transaction client — both expose the query builders we use. */
export type DbExecutor = Pick<
  typeof db,
  "select" | "insert" | "update" | "delete"
>;

/**
 * Consume the next per-project case number inside the caller's transaction.
 * `UPDATE … RETURNING` takes a row lock so concurrent creates cannot collide.
 */
export async function allocateCaseNumber(
  executor: DbExecutor,
  projectId: number,
): Promise<number> {
  const [row] = await executor
    .update(projects)
    .set({ nextCaseNumber: sql`${projects.nextCaseNumber} + 1` })
    .where(eq(projects.id, projectId))
    .returning({ nextCaseNumber: projects.nextCaseNumber });

  if (!row) {
    notFound("Project", projectId);
  }

  return row.nextCaseNumber - 1;
}
