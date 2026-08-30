import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { DELETE, PATCH } from "@/app/api/v1/directories/[id]/route";
import { POST as POST_DIRECTORY } from "@/app/api/v1/directories/route";
import { GET as GET_TREE } from "@/app/api/v1/projects/[id]/tree/route";
import { POST as POST_PROJECT } from "@/app/api/v1/projects/route";
import {
  directoryDeleteResponseSchema,
  directorySchema,
  errorBodySchema,
  projectSchema,
  projectTreeSchema,
} from "@/lib/contracts";
import { db, pool } from "@/lib/db";
import { testCases } from "@/lib/db/schema";

import { allocateCaseNumber } from "./numbering";
import {
  authenticateAsTestAdmin,
  invoke,
  uniqueName,
  uniquePrefix,
} from "./test-helpers";

const projectIds: number[] = [];

beforeAll(async () => {
  await authenticateAsTestAdmin();
});

afterEach(async () => {
  for (const id of projectIds.splice(0)) {
    await pool.query("DELETE FROM projects WHERE id = $1", [id]);
  }
});

async function createProject() {
  const result = await invoke(POST_PROJECT, {
    method: "POST",
    path: "/api/v1/projects",
    body: { name: uniqueName("Dir"), prefix: uniquePrefix("D") },
  });
  const project = projectSchema.parse(result.json);
  projectIds.push(project.id);
  return project;
}

async function createDir(
  projectId: number,
  name: string,
  parentId: number | null = null,
) {
  const result = await invoke(POST_DIRECTORY, {
    method: "POST",
    path: "/api/v1/directories",
    body: { projectId, name, parentId },
  });
  expect(result.status).toBe(201);
  return directorySchema.parse(result.json);
}

async function insertCase(
  projectId: number,
  title: string,
  directoryId: number | null,
  deletedAt: Date | null = null,
) {
  return db.transaction(async (tx) => {
    const n = await allocateCaseNumber(tx, projectId);
    const [row] = await tx
      .insert(testCases)
      .values({ projectId, caseNumber: n, title, directoryId, deletedAt })
      .returning();
    return row;
  });
}

describe("POST /api/v1/directories", () => {
  it("creates a root folder and a nested child", async () => {
    const project = await createProject();
    const auth = await createDir(project.id, "Authentication");
    expect(auth.parentId).toBeNull();
    expect(auth.projectId).toBe(project.id);

    const login = await createDir(project.id, "Login", auth.id);
    expect(login.parentId).toBe(auth.id);
  });

  it("rejects a duplicate sibling name at root", async () => {
    const project = await createProject();
    await createDir(project.id, "Auth");
    const result = await invoke(POST_DIRECTORY, {
      method: "POST",
      path: "/api/v1/directories",
      body: { projectId: project.id, name: "Auth", parentId: null },
    });
    expect(result.status).toBe(409);
    expect(errorBodySchema.parse(result.json).error.code).toBe(
      "SIBLING_NAME_TAKEN",
    );
  });

  it("rejects a parent from another project as CROSS_PROJECT", async () => {
    const a = await createProject();
    const b = await createProject();
    const folder = await createDir(a.id, "Auth");
    const result = await invoke(POST_DIRECTORY, {
      method: "POST",
      path: "/api/v1/directories",
      body: { projectId: b.id, name: "Login", parentId: folder.id },
    });
    expect(result.status).toBe(409);
    expect(errorBodySchema.parse(result.json).error.code).toBe("CROSS_PROJECT");
  });
});

describe("PATCH /api/v1/directories/:id", () => {
  it("renames and moves a folder to root", async () => {
    const project = await createProject();
    const auth = await createDir(project.id, "Authentication");
    const login = await createDir(project.id, "Login", auth.id);

    const result = await invoke(PATCH, {
      method: "PATCH",
      path: `/api/v1/directories/${login.id}`,
      params: { id: String(login.id) },
      body: { name: "Sign-in", parentId: null },
    });
    expect(result.status).toBe(200);
    const updated = directorySchema.parse(result.json);
    expect(updated.name).toBe("Sign-in");
    expect(updated.parentId).toBeNull();
  });

  it("rejects moving a folder into itself", async () => {
    const project = await createProject();
    const auth = await createDir(project.id, "Authentication");
    const result = await invoke(PATCH, {
      method: "PATCH",
      path: `/api/v1/directories/${auth.id}`,
      params: { id: String(auth.id) },
      body: { parentId: auth.id },
    });
    expect(result.status).toBe(409);
    expect(errorBodySchema.parse(result.json).error.code).toBe(
      "CYCLE_DETECTED",
    );
  });

  it("rejects moving a folder under its own descendant", async () => {
    const project = await createProject();
    const auth = await createDir(project.id, "Authentication");
    const login = await createDir(project.id, "Login", auth.id);
    const mfa = await createDir(project.id, "MFA", login.id);

    const result = await invoke(PATCH, {
      method: "PATCH",
      path: `/api/v1/directories/${auth.id}`,
      params: { id: String(auth.id) },
      body: { parentId: mfa.id },
    });
    expect(result.status).toBe(409);
    expect(errorBodySchema.parse(result.json).error.code).toBe(
      "CYCLE_DETECTED",
    );
  });
});

describe("GET /api/v1/projects/:id/tree", () => {
  it("nests directories, sorts by name, and excludes trashed cases from counts", async () => {
    const project = await createProject();
    const checkout = await createDir(project.id, "Checkout");
    const auth = await createDir(project.id, "Authentication");
    const login = await createDir(project.id, "Login", auth.id);

    await insertCase(project.id, "Root case", null);
    await insertCase(project.id, "Auth case", auth.id);
    await insertCase(project.id, "Login case", login.id);
    await insertCase(project.id, "Checkout case", checkout.id);
    await insertCase(project.id, "Trashed", auth.id, new Date());

    const result = await invoke(GET_TREE, {
      path: `/api/v1/projects/${project.id}/tree`,
      params: { id: String(project.id) },
    });
    expect(result.status).toBe(200);
    const tree = projectTreeSchema.parse(result.json);
    expect(tree.activeCaseCount).toBe(4);
    expect(tree.rootCaseCount).toBe(1);
    expect(tree.trashCount).toBe(1);
    expect(tree.directories.map((d) => d.name)).toEqual([
      "Authentication",
      "Checkout",
    ]);
    const authNode = tree.directories[0];
    expect(authNode.activeCaseCount).toBe(1);
    expect(authNode.children).toHaveLength(1);
    expect(authNode.children[0].name).toBe("Login");
    expect(authNode.children[0].activeCaseCount).toBe(1);
    expect(tree.directories[1].activeCaseCount).toBe(1);
  });
});

describe("DELETE /api/v1/directories/:id", () => {
  it("deletes an empty directory", async () => {
    const project = await createProject();
    const dir = await createDir(project.id, "Empty");
    const result = await invoke(DELETE, {
      method: "DELETE",
      path: `/api/v1/directories/${dir.id}`,
      params: { id: String(dir.id) },
    });
    expect(result.status).toBe(200);
    const body = directoryDeleteResponseSchema.parse(result.json);
    expect(body).toMatchObject({
      id: dir.id,
      deleted: true,
      mode: null,
      trashedCaseCount: 0,
      movedCaseCount: 0,
      movedDirectoryCount: 0,
    });
  });

  it("rejects a nonempty directory when mode is omitted", async () => {
    const project = await createProject();
    const dir = await createDir(project.id, "Checkout");
    await insertCase(project.id, "Pay", dir.id);

    const result = await invoke(DELETE, {
      method: "DELETE",
      path: `/api/v1/directories/${dir.id}`,
      params: { id: String(dir.id) },
    });
    expect(result.status).toBe(409);
    const body = errorBodySchema.parse(result.json);
    expect(body.error.code).toBe("DIRECTORY_NOT_EMPTY");
    expect(body.error.message).toMatch(/trash_contents/);
  });

  it("trash_contents soft-deletes cases and leaves them restorable at root", async () => {
    const project = await createProject();
    const auth = await createDir(project.id, "Authentication");
    const login = await createDir(project.id, "Login", auth.id);
    const nested = await insertCase(project.id, "Nested login", login.id);
    const direct = await insertCase(project.id, "Auth overview", auth.id);

    const result = await invoke(DELETE, {
      method: "DELETE",
      path: `/api/v1/directories/${auth.id}?mode=trash_contents`,
      params: { id: String(auth.id) },
    });
    expect(result.status).toBe(200);
    const body = directoryDeleteResponseSchema.parse(result.json);
    expect(body.mode).toBe("trash_contents");
    expect(body.trashedCaseCount).toBe(2);

    const { rows } = await pool.query<{
      id: string;
      directory_id: string | null;
      deleted_at: Date | null;
    }>(
      `SELECT id, directory_id, deleted_at FROM test_cases WHERE id = ANY($1::bigint[])`,
      [[nested.id, direct.id]],
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.directory_id).toBeNull();
      expect(row.deleted_at).not.toBeNull();
    }

    const leftoverDirs = await pool.query(
      `SELECT count(*)::int AS n FROM directories WHERE project_id = $1`,
      [project.id],
    );
    expect(leftoverDirs.rows[0].n).toBe(0);
  });

  it("move_contents_to_parent reparents children and direct active cases", async () => {
    const project = await createProject();
    const auth = await createDir(project.id, "Authentication");
    const login = await createDir(project.id, "Login", auth.id);
    const direct = await insertCase(project.id, "Auth overview", auth.id);
    const nested = await insertCase(project.id, "Login case", login.id);
    const trashed = await insertCase(
      project.id,
      "Retired",
      auth.id,
      new Date(),
    );

    const result = await invoke(DELETE, {
      method: "DELETE",
      path: `/api/v1/directories/${auth.id}?mode=move_contents_to_parent`,
      params: { id: String(auth.id) },
    });
    expect(result.status).toBe(200);
    const body = directoryDeleteResponseSchema.parse(result.json);
    expect(body.movedCaseCount).toBe(1);
    expect(body.movedDirectoryCount).toBe(1);

    const loginRow = await pool.query<{ parent_id: string | null }>(
      `SELECT parent_id FROM directories WHERE id = $1`,
      [login.id],
    );
    expect(loginRow.rows[0].parent_id).toBeNull();

    const directRow = await pool.query<{ directory_id: string | null }>(
      `SELECT directory_id FROM test_cases WHERE id = $1`,
      [direct.id],
    );
    expect(directRow.rows[0].directory_id).toBeNull();

    const nestedRow = await pool.query<{ directory_id: string | null }>(
      `SELECT directory_id FROM test_cases WHERE id = $1`,
      [nested.id],
    );
    expect(Number(nestedRow.rows[0].directory_id)).toBe(login.id);

    const trashedRow = await pool.query<{
      directory_id: string | null;
      deleted_at: Date | null;
    }>(`SELECT directory_id, deleted_at FROM test_cases WHERE id = $1`, [
      trashed.id,
    ]);
    expect(trashedRow.rows[0].directory_id).toBeNull();
    expect(trashedRow.rows[0].deleted_at).not.toBeNull();
  });

  it("aborts move_contents_to_parent on sibling name collision", async () => {
    const project = await createProject();
    const auth = await createDir(project.id, "Authentication");
    await createDir(project.id, "Login", auth.id);
    await createDir(project.id, "Login");

    const result = await invoke(DELETE, {
      method: "DELETE",
      path: `/api/v1/directories/${auth.id}?mode=move_contents_to_parent`,
      params: { id: String(auth.id) },
    });
    expect(result.status).toBe(409);
    expect(errorBodySchema.parse(result.json).error.code).toBe(
      "SIBLING_NAME_TAKEN",
    );

    const stillThere = await pool.query(
      `SELECT count(*)::int AS n FROM directories WHERE id = $1`,
      [auth.id],
    );
    expect(stillThere.rows[0].n).toBe(1);
  });

  it("rejects an unknown mode", async () => {
    const project = await createProject();
    const dir = await createDir(project.id, "X");
    const result = await invoke(DELETE, {
      method: "DELETE",
      path: `/api/v1/directories/${dir.id}?mode=explode`,
      params: { id: String(dir.id) },
    });
    expect(result.status).toBe(400);
    expect(errorBodySchema.parse(result.json).error.code).toBe(
      "VALIDATION_ERROR",
    );
  });
});
