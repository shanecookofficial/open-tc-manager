import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * OpenTCM schema — PLAN.md §5 plus PLAN-v1.1.md §6.
 *
 * Divergences between this file and the checked-in SQL migrations
 * (`drizzle/0000_init.sql`, `drizzle/0001_auth_history.sql`,
 * `drizzle/0002_custom_roles.sql`) that
 * drizzle-kit cannot express:
 *
 * 1. `test_steps` UNIQUE(test_case_id, position) is DEFERRABLE INITIALLY
 *    DEFERRED in the SQL migration only. drizzle-orm 0.45 has no
 *    `.deferrable()` / `.initiallyDeferred()` on unique constraints (that
 *    lands in a later major). The unique itself *is* declared here so the
 *    snapshot stays in sync; the DEFERRABLE clause is a hand-edit of the
 *    generated SQL. Do not regenerate 0000 blindly — re-apply the
 *    DEFERRABLE clause if you do.
 *
 * Everything else (BIGINT identity PKs, prefix regex CHECK, trimmed-length
 * CHECKs, UNIQUE NULLS NOT DISTINCT on directories, ON DELETE CASCADE /
 * SET NULL / RESTRICT, the listing index, users/sessions/test_case_events,
 * and the next_case_number counter column) is expressed in this file and
 * emitted by drizzle-kit.
 *
 * `users.email` is stored lowercased. UNIQUE(email) plus a unique index on
 * `lower(email)` make mixed-case duplicates a uniqueness violation even if
 * a write skipped the application-layer lowercase step.
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

/** Instance roles. `admin` is locked; `member` and `viewer` ship built-in and may be deleted. */
export type RolePermissions = (
  | "cases.write"
  | "cases.revert"
  | "directories.write"
  | "cases.bulk"
  | "trash.purge"
  | "projects.write"
)[];

export const roles = pgTable(
  "roles",
  {
    id: bigint("id", { mode: "number" })
      .generatedAlwaysAsIdentity()
      .primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    builtIn: boolean("built_in").notNull().default(false),
    locked: boolean("locked").notNull().default(false),
    permissions: jsonb("permissions").$type<RolePermissions>().notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("roles_slug_unique").on(table.slug),
    unique("roles_name_unique").on(table.name),
    check(
      "roles_name_trimmed_length",
      sql`length(trim(${table.name})) BETWEEN 1 AND 120`,
    ),
    check("roles_slug_format", sql`${table.slug} ~ '^[a-z][a-z0-9-]{0,39}$'`),
  ],
);

export const users = pgTable(
  "users",
  {
    id: bigint("id", { mode: "number" })
      .generatedAlwaysAsIdentity()
      .primaryKey(),
    // Stored lowercased; UNIQUE(email) plus unique(lower(email)).
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role")
      .notNull()
      .references(() => roles.slug, { onDelete: "restrict" }),
    deactivatedAt: timestamptz("deactivated_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("users_email_unique").on(table.email),
    uniqueIndex("users_email_lower_unique").on(sql`lower(${table.email})`),
    check(
      "users_display_name_trimmed_length",
      sql`length(trim(${table.displayName})) BETWEEN 1 AND 80`,
    ),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: bigint("id", { mode: "number" })
      .generatedAlwaysAsIdentity()
      .primaryKey(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [
    unique("sessions_token_hash_unique").on(table.tokenHash),
    index("sessions_user_id_index").on(table.userId),
    index("sessions_expires_at_index").on(table.expiresAt),
  ],
);

/** Full case state immediately after an event applied (PLAN-v1.1 §5). */
export type CaseEventSnapshot = {
  title: string;
  description: string | null;
  directoryId: number | null;
  steps: { action: string; expectedResult: string | null }[];
  deletedAt: string | null;
};

export const testCaseEvents = pgTable(
  "test_case_events",
  {
    id: bigint("id", { mode: "number" })
      .generatedAlwaysAsIdentity()
      .primaryKey(),
    testCaseId: bigint("test_case_id", { mode: "number" })
      .notNull()
      .references(() => testCases.id, { onDelete: "cascade" }),
    actorId: bigint("actor_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    actorEmail: text("actor_email").notNull(),
    actorDisplayName: text("actor_display_name").notNull(),
    action: text("action").notNull(),
    revertedEventId: bigint("reverted_event_id", { mode: "number" }).references(
      (): AnyPgColumn => testCaseEvents.id,
      { onDelete: "restrict" },
    ),
    snapshot: jsonb("snapshot").$type<CaseEventSnapshot>().notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("test_case_events_test_case_id_created_at_index").on(
      table.testCaseId,
      table.createdAt,
    ),
    check(
      "test_case_events_action",
      sql`${table.action} IN ('created','updated','moved','trashed','restored','reverted')`,
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
export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type TestCaseEvent = typeof testCaseEvents.$inferSelect;
export type NewTestCaseEvent = typeof testCaseEvents.$inferInsert;
