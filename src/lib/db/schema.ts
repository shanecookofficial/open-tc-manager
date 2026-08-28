import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

/**
 * OpenTCM schema — PLAN.md §5, implemented as closely as drizzle-orm 0.45
 * allows.
 *
 * Divergences between this file and the checked-in SQL migration
 * (`drizzle/0000_init.sql`) that drizzle-kit cannot express:
 *
 * 1. `test_steps` UNIQUE(test_case_id, position) is DEFERRABLE INITIALLY
 *    DEFERRED in the SQL migration only. drizzle-orm 0.45 has no
 *    `.deferrable()` / `.initiallyDeferred()` on unique constraints (that
 *    lands in a later major). The unique itself *is* declared here so the
 *    snapshot stays in sync; the DEFERRABLE clause is a hand-edit of the
 *    generated SQL. Do not regenerate this migration blindly — re-apply the
 *    DEFERRABLE clause if you do.
 *
 * Everything else (BIGINT identity PKs, prefix regex CHECK, trimmed-length
 * CHECKs, UNIQUE NULLS NOT DISTINCT on directories, ON DELETE CASCADE /
 * SET NULL, the (project_id, deleted_at, directory_id) index, and the
 * next_case_number counter column) is expressed in this file and emitted
 * by drizzle-kit.
 */

const timestamptz = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });

export const projects = pgTable(
  "projects",
  {
    id: bigint("id", { mode: "number" })
      .generatedAlwaysAsIdentity()
      .primaryKey(),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    nextCaseNumber: integer("next_case_number").notNull().default(1),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("projects_name_unique").on(table.name),
    unique("projects_prefix_unique").on(table.prefix),
    check(
      "projects_name_trimmed_length",
      sql`length(trim(${table.name})) BETWEEN 1 AND 120`,
    ),
    check(
      "projects_prefix_format",
      sql`${table.prefix} ~ '^[A-Z][A-Z0-9]{1,9}$'`,
    ),
  ],
);

export const directories = pgTable(
  "directories",
  {
    id: bigint("id", { mode: "number" })
      .generatedAlwaysAsIdentity()
      .primaryKey(),
    projectId: bigint("project_id", { mode: "number" })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // NULL = child of the project's implicit root.
    parentId: bigint("parent_id", { mode: "number" }).references(
      (): AnyPgColumn => directories.id,
      { onDelete: "cascade" },
    ),
    name: text("name").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("directories_project_id_parent_id_name_unique")
      .on(table.projectId, table.parentId, table.name)
      .nullsNotDistinct(),
    check(
      "directories_name_trimmed_length",
      sql`length(trim(${table.name})) BETWEEN 1 AND 120`,
    ),
  ],
);

export const testCases = pgTable(
  "test_cases",
  {
    id: bigint("id", { mode: "number" })
      .generatedAlwaysAsIdentity()
      .primaryKey(),
    projectId: bigint("project_id", { mode: "number" })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    caseNumber: integer("case_number").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    // NULL = project root. ON DELETE SET NULL so trashed cases survive
    // their directory being removed and restore to root.
    directoryId: bigint("directory_id", { mode: "number" }).references(
      () => directories.id,
      { onDelete: "set null" },
    ),
    deletedAt: timestamptz("deleted_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("test_cases_project_id_case_number_unique").on(
      table.projectId,
      table.caseNumber,
    ),
    index("test_cases_project_id_deleted_at_directory_id_index").on(
      table.projectId,
      table.deletedAt,
      table.directoryId,
    ),
    check(
      "test_cases_title_trimmed_length",
      sql`length(trim(${table.title})) BETWEEN 1 AND 200`,
    ),
  ],
);

export const testSteps = pgTable(
  "test_steps",
  {
    id: bigint("id", { mode: "number" })
      .generatedAlwaysAsIdentity()
      .primaryKey(),
    testCaseId: bigint("test_case_id", { mode: "number" })
      .notNull()
      .references(() => testCases.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    action: text("action").notNull(),
    expectedResult: text("expected_result"),
  },
  (table) => [
    // DEFERRABLE INITIALLY DEFERRED is applied in the SQL migration only —
    // see file-level comment.
    unique("test_steps_test_case_id_position_unique").on(
      table.testCaseId,
      table.position,
    ),
    check(
      "test_steps_action_trimmed_length",
      sql`length(trim(${table.action})) >= 1`,
    ),
  ],
);

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Directory = typeof directories.$inferSelect;
export type NewDirectory = typeof directories.$inferInsert;
export type TestCase = typeof testCases.$inferSelect;
export type NewTestCase = typeof testCases.$inferInsert;
export type TestStep = typeof testSteps.$inferSelect;
export type NewTestStep = typeof testSteps.$inferInsert;
