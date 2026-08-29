import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { pool } from "@/lib/db";

/** Postgres SQLSTATE for unique_violation. */
const UNIQUE_VIOLATION = "23505";
/** Postgres SQLSTATE for check_violation. */
const CHECK_VIOLATION = "23514";
/** Postgres SQLSTATE for foreign_key_violation (RESTRICT and missing refs). */
const FOREIGN_KEY_VIOLATION = "23503";

const EMPTY_SNAPSHOT = {
  title: "A case",
  description: null,
  directoryId: null,
  steps: [] as { action: string; expectedResult: string | null }[],
  deletedAt: null,
};

async function insertProject(
  name = "Web App",
  prefix = "WEB",
): Promise<number> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO projects (name, prefix) VALUES ($1, $2) RETURNING id`,
    [name, prefix],
  );
  return Number(result.rows[0].id);
}

async function insertDirectory(
  projectId: number,
  name: string,
  parentId: number | null = null,
): Promise<number> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO directories (project_id, parent_id, name) VALUES ($1, $2, $3) RETURNING id`,
    [projectId, parentId, name],
  );
  return Number(result.rows[0].id);
}

async function insertCase(
  projectId: number,
  caseNumber: number,
  title = "A case",
  directoryId: number | null = null,
  deletedAt: string | null = null,
): Promise<number> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO test_cases (project_id, case_number, title, directory_id, deleted_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [projectId, caseNumber, title, directoryId, deletedAt],
  );
  return Number(result.rows[0].id);
}

async function insertStep(
  testCaseId: number,
  position: number,
  action = "Do the thing",
): Promise<number> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO test_steps (test_case_id, position, action) VALUES ($1, $2, $3) RETURNING id`,
    [testCaseId, position, action],
  );
  return Number(result.rows[0].id);
}

async function insertUser(
  email: string,
  displayName = "Ada Lovelace",
  role = "member",
  passwordHash = "placeholder-hash",
): Promise<number> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (email, display_name, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [email, displayName, passwordHash, role],
  );
  return Number(result.rows[0].id);
}

async function insertEvent(
  testCaseId: number,
  actorId: number,
  action = "created",
  snapshot: typeof EMPTY_SNAPSHOT = EMPTY_SNAPSHOT,
  actorEmail = "ada@opentcm.local",
  actorDisplayName = "Ada Lovelace",
  revertedEventId: number | null = null,
): Promise<number> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO test_case_events
       (test_case_id, actor_id, actor_email, actor_display_name, action, reverted_event_id, snapshot)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     RETURNING id`,
    [
      testCaseId,
      actorId,
      actorEmail,
      actorDisplayName,
      action,
      revertedEventId,
      JSON.stringify(snapshot),
    ],
  );
  return Number(result.rows[0].id);
}

describe("schema constraints", () => {
  beforeEach(async () => {
    await pool.query(
      `TRUNCATE TABLE test_case_events, sessions, users, test_steps, test_cases, directories, projects RESTART IDENTITY CASCADE`,
    );
  });

  afterAll(async () => {
    await pool.query(
      `TRUNCATE TABLE test_case_events, sessions, users, test_steps, test_cases, directories, projects RESTART IDENTITY CASCADE`,
    );
  });

  describe("projects.prefix", () => {
    it.each([
      ["W", "too short (1 char)"],
      ["TOOLONGPREX", "too long (11 chars)"],
      ["web", "lowercase"],
      ["Web", "mixed case"],
      ["W-1", "hyphen"],
      ["W_1", "underscore"],
      ["1WEB", "starts with a digit"],
    ])("rejects %s (%s)", async (prefix) => {
      await expect(insertProject("Bad prefix", prefix)).rejects.toMatchObject({
        code: CHECK_VIOLATION,
      });
    });

    it("accepts 2–10 uppercase alphanumeric prefixes starting with a letter", async () => {
      await insertProject("A", "AB");
      await insertProject("B", "A1");
      await insertProject("C", "WEB42");
      await insertProject("D", "ABCDEFGHIJ");
    });

    it("rejects a duplicate prefix", async () => {
      await insertProject("One", "WEB");
      await expect(insertProject("Two", "WEB")).rejects.toMatchObject({
        code: UNIQUE_VIOLATION,
      });
    });

    it("rejects a duplicate name", async () => {
      await insertProject("Web App", "WEB");
      await expect(insertProject("Web App", "API")).rejects.toMatchObject({
        code: UNIQUE_VIOLATION,
      });
    });

    it("rejects a whitespace-only name", async () => {
      await expect(insertProject("   ", "WEB")).rejects.toMatchObject({
        code: CHECK_VIOLATION,
      });
    });
  });

  describe("per-project case numbers", () => {
    it("rejects two cases with the same number in the same project", async () => {
      const projectId = await insertProject();
      await insertCase(projectId, 1, "First");
      await expect(insertCase(projectId, 1, "Second")).rejects.toMatchObject({
        code: UNIQUE_VIOLATION,
      });
    });

    it("allows the same case number in two different projects", async () => {
      const web = await insertProject("Web", "WEB");
      const api = await insertProject("Api", "API");
      await insertCase(web, 1, "Web one");
      await insertCase(api, 1, "Api one");
    });
  });

  describe("directory sibling names", () => {
    it("rejects two root directories with the same name in the same project", async () => {
      const projectId = await insertProject();
      await insertDirectory(projectId, "Auth", null);
      await expect(
        insertDirectory(projectId, "Auth", null),
      ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
    });

    it("rejects two siblings with the same name under a non-null parent", async () => {
      const projectId = await insertProject();
      const parent = await insertDirectory(projectId, "Auth");
      await insertDirectory(projectId, "Login", parent);
      await expect(
        insertDirectory(projectId, "Login", parent),
      ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
    });

    it("allows the same name under different parents (and in different projects)", async () => {
      const web = await insertProject("Web", "WEB");
      const api = await insertProject("Api", "API");
      const auth = await insertDirectory(web, "Auth");
      const billing = await insertDirectory(web, "Billing");
      await insertDirectory(web, "Login", auth);
      await insertDirectory(web, "Login", billing);
      await insertDirectory(api, "Auth", null);
    });
  });

  describe("test_steps position uniqueness", () => {
    it("rejects two steps with the same position on the same case", async () => {
      const projectId = await insertProject();
      const caseId = await insertCase(projectId, 1);
      await insertStep(caseId, 1);
      await expect(insertStep(caseId, 1, "Again")).rejects.toMatchObject({
        code: UNIQUE_VIOLATION,
      });
    });

    it("allows swapping two positions inside a transaction (deferred unique)", async () => {
      const projectId = await insertProject();
      const caseId = await insertCase(projectId, 1);
      const stepA = await insertStep(caseId, 1, "A");
      const stepB = await insertStep(caseId, 2, "B");

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `UPDATE test_steps SET position = $1 WHERE id = $2`,
          [2, stepA],
        );
        await client.query(
          `UPDATE test_steps SET position = $1 WHERE id = $2`,
          [1, stepB],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }

      const { rows } = await pool.query<{ id: string; position: number }>(
        `SELECT id, position FROM test_steps ORDER BY position`,
      );
      expect(Number(rows[0].id)).toBe(stepB);
      expect(rows[0].position).toBe(1);
      expect(Number(rows[1].id)).toBe(stepA);
      expect(rows[1].position).toBe(2);
    });
  });

  describe("cascades and SET NULL", () => {
    it("deleting a project removes its directories, cases, and steps", async () => {
      const projectId = await insertProject();
      const dirId = await insertDirectory(projectId, "Auth");
      const caseId = await insertCase(projectId, 1, "A case", dirId);
      await insertStep(caseId, 1);

      await pool.query(`DELETE FROM projects WHERE id = $1`, [projectId]);

      const leftover = await pool.query(
        `SELECT
           (SELECT count(*)::int FROM directories) AS directories,
           (SELECT count(*)::int FROM test_cases) AS test_cases,
           (SELECT count(*)::int FROM test_steps) AS test_steps`,
      );
      expect(leftover.rows[0]).toEqual({
        directories: 0,
        test_cases: 0,
        test_steps: 0,
      });
    });

    it("deleting a case removes its steps", async () => {
      const projectId = await insertProject();
      const caseId = await insertCase(projectId, 1);
      await insertStep(caseId, 1);
      await insertStep(caseId, 2, "Then this");

      await pool.query(`DELETE FROM test_cases WHERE id = $1`, [caseId]);

      const { rows } = await pool.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM test_steps`,
      );
      expect(rows[0].count).toBe(0);
    });

    it("deleting a directory sets a trashed case's directory_id to NULL (case remains)", async () => {
      const projectId = await insertProject();
      const dirId = await insertDirectory(projectId, "Obsolete");
      const caseId = await insertCase(
        projectId,
        1,
        "Old flow",
        dirId,
        "2026-08-28T00:00:00Z",
      );
      await insertStep(caseId, 1);

      await pool.query(`DELETE FROM directories WHERE id = $1`, [dirId]);

      const { rows } = await pool.query<{
        id: string;
        directory_id: string | null;
        deleted_at: Date | null;
      }>(`SELECT id, directory_id, deleted_at FROM test_cases WHERE id = $1`, [
        caseId,
      ]);
      expect(rows).toHaveLength(1);
      expect(rows[0].directory_id).toBeNull();
      expect(rows[0].deleted_at).not.toBeNull();

      const steps = await pool.query(
        `SELECT count(*)::int AS count FROM test_steps`,
      );
      expect(steps.rows[0].count).toBe(1);
    });
  });

  describe("users.email uniqueness (lowercase)", () => {
    it("rejects a duplicate lowercased email", async () => {
      await insertUser("ada@opentcm.local");
      await expect(insertUser("ada@opentcm.local")).rejects.toMatchObject({
        code: UNIQUE_VIOLATION,
      });
    });

    it("rejects the same email with different casing via lower(email) unique index", async () => {
      await insertUser("ada@opentcm.local");
      await expect(insertUser("Ada@Opentcm.Local")).rejects.toMatchObject({
        code: UNIQUE_VIOLATION,
      });
      await expect(insertUser("ADA@OPENTCM.LOCAL")).rejects.toMatchObject({
        code: UNIQUE_VIOLATION,
      });
    });

    it("allows two distinct lowercased emails", async () => {
      await insertUser("ada@opentcm.local", "Ada");
      await insertUser("charles@opentcm.local", "Charles");
    });
  });

  describe("users CHECKs", () => {
    it("rejects an unknown role", async () => {
      await expect(
        insertUser("ada@opentcm.local", "Ada", "owner"),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });
    });

    it("rejects a whitespace-only display name", async () => {
      await expect(
        insertUser("ada@opentcm.local", "   "),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });
    });
  });

  describe("test_case_events foreign keys", () => {
    it("RESTRICT: deleting a user who authored events is rejected", async () => {
      const projectId = await insertProject();
      const caseId = await insertCase(projectId, 1);
      const actorId = await insertUser("ada@opentcm.local");
      await insertEvent(caseId, actorId);

      await expect(
        pool.query(`DELETE FROM users WHERE id = $1`, [actorId]),
      ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });

      const leftover = await pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM test_case_events`,
      );
      expect(leftover.rows[0].n).toBe(1);
      const usersLeft = await pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM users`,
      );
      expect(usersLeft.rows[0].n).toBe(1);
    });

    it("CASCADE: deleting a case removes its events; the actor user remains", async () => {
      const projectId = await insertProject();
      const caseId = await insertCase(projectId, 1);
      const actorId = await insertUser("ada@opentcm.local");
      await insertEvent(caseId, actorId);

      await pool.query(`DELETE FROM test_cases WHERE id = $1`, [caseId]);

      const events = await pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM test_case_events`,
      );
      expect(events.rows[0].n).toBe(0);
      const usersLeft = await pool.query<{ id: string }>(
        `SELECT id FROM users WHERE id = $1`,
        [actorId],
      );
      expect(usersLeft.rows).toHaveLength(1);
    });

    it("CASCADE: deleting a user without events still removes their sessions", async () => {
      const actorId = await insertUser("ada@opentcm.local");
      await pool.query(
        `INSERT INTO sessions (user_id, token_hash, expires_at)
         VALUES ($1, $2, now() + interval '7 days')`,
        [actorId, "token-hash-1"],
      );

      await pool.query(`DELETE FROM users WHERE id = $1`, [actorId]);

      const sessions = await pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM sessions`,
      );
      expect(sessions.rows[0].n).toBe(0);
    });
  });
});
