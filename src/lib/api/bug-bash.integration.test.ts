import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { GET as CATCH_ALL } from "@/app/api/v1/[...path]/route";
import {
  DELETE as DELETE_DIRECTORY,
  PATCH as PATCH_DIRECTORY,
} from "@/app/api/v1/directories/[id]/route";
import { POST as POST_DIRECTORY } from "@/app/api/v1/directories/route";
import { GET as GET_TREE } from "@/app/api/v1/projects/[id]/tree/route";
import { PATCH as PATCH_PROJECT } from "@/app/api/v1/projects/[id]/route";
import { POST as POST_PROJECT } from "@/app/api/v1/projects/route";
import { POST as BULK_TRASH } from "@/app/api/v1/test-cases/bulk-trash/route";
import { POST as RESTORE } from "@/app/api/v1/test-cases/[id]/restore/route";
import {
  DELETE as SOFT_DELETE,
  GET as GET_BY_ID,
  PUT,
} from "@/app/api/v1/test-cases/[id]/route";
import { GET as GET_BY_NUMBER } from "@/app/api/v1/test-cases/number/[displayNumber]/route";
import {
  GET as LIST_CASES,
  POST as POST_CASE,
} from "@/app/api/v1/test-cases/route";
import {
  DESCRIPTION_MAX,
  NAME_MAX,
  STEP_TEXT_MAX,
  TITLE_MAX,
  directorySchema,
  errorBodySchema,
  projectSchema,
  projectTreeSchema,
  testCaseListResponseSchema,
  testCaseSchema,
} from "@/lib/contracts";
import { pool } from "@/lib/db";

import { toErrorResponse } from "./errors";
import { createTestCase as createTestCaseService } from "./test-cases";
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

async function createProject(prefix = uniquePrefix("B")) {
  const result = await invoke(POST_PROJECT, {
    method: "POST",
    path: "/api/v1/projects",
    body: { name: uniqueName("Bash"), prefix },
  });
  expect(result.status).toBe(201);
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

async function createCase(
  projectId: number,
  title: string,
  extra: {
    directoryId?: number | null;
    description?: string | null;
    steps?: { action: string; expectedResult?: string | null }[];
  } = {},
) {
  const result = await invoke(POST_CASE, {
    method: "POST",
    path: "/api/v1/test-cases",
    body: {
      projectId,
      title,
      directoryId: extra.directoryId,
      description: extra.description,
      steps: extra.steps,
    },
  });
  expect(result.status).toBe(201);
  return testCaseSchema.parse(result.json);
}

async function nextCaseNumber(projectId: number): Promise<number> {
  const { rows } = await pool.query<{ next_case_number: number }>(
    `SELECT next_case_number FROM projects WHERE id = $1`,
    [projectId],
  );
  return rows[0].next_case_number;
}

describe("M5-1 boundary content", () => {
  it("accepts a 200-char title and rejects 201", async () => {
    const project = await createProject();
    const ok = await createCase(project.id, "T".repeat(TITLE_MAX));
    expect(ok.title).toHaveLength(TITLE_MAX);

    const tooLong = await invoke(POST_CASE, {
      method: "POST",
      path: "/api/v1/test-cases",
      body: { projectId: project.id, title: "T".repeat(TITLE_MAX + 1) },
    });
    expect(tooLong.status).toBe(400);
    expect(errorBodySchema.parse(tooLong.json).error.code).toBe(
      "VALIDATION_ERROR",
    );
  });

  it("accepts a 120-char directory name and rejects 121", async () => {
    const project = await createProject();
    const ok = await createDir(project.id, "D".repeat(NAME_MAX));
    expect(ok.name).toHaveLength(NAME_MAX);

    const tooLong = await invoke(POST_DIRECTORY, {
      method: "POST",
      path: "/api/v1/directories",
      body: { projectId: project.id, name: "D".repeat(NAME_MAX + 1) },
    });
    expect(tooLong.status).toBe(400);
    expect(errorBodySchema.parse(tooLong.json).error.code).toBe(
      "VALIDATION_ERROR",
    );
  });

  it("rejects whitespace-only title and action as 400, not 500", async () => {
    const project = await createProject();

    const blankTitle = await invoke(POST_CASE, {
      method: "POST",
      path: "/api/v1/test-cases",
      body: { projectId: project.id, title: "   " },
    });
    expect(blankTitle.status).toBe(400);
    expect(errorBodySchema.parse(blankTitle.json).error.code).toBe(
      "VALIDATION_ERROR",
    );

    const blankAction = await invoke(POST_CASE, {
      method: "POST",
      path: "/api/v1/test-cases",
      body: {
        projectId: project.id,
        title: "Has a title",
        steps: [{ action: "\n\t  " }],
      },
    });
    expect(blankAction.status).toBe(400);
    expect(errorBodySchema.parse(blankAction.json).error.code).toBe(
      "VALIDATION_ERROR",
    );

    try {
      await createTestCaseService({ projectId: project.id, title: "   " });
      expect.fail("CHECK should reject a whitespace-only title");
    } catch (error) {
      const response = toErrorResponse(error);
      expect(response.status).toBe(400);
      const body = errorBodySchema.parse(await response.json());
      expect(body.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("rejects 100KB step markdown and accepts description at the 100k cap", async () => {
    const project = await createProject();
    const hugeStep = await invoke(POST_CASE, {
      method: "POST",
      path: "/api/v1/test-cases",
      body: {
        projectId: project.id,
        title: "Huge step",
        steps: [{ action: "A".repeat(100_000) }],
      },
    });
    expect(hugeStep.status).toBe(400);
    expect(errorBodySchema.parse(hugeStep.json).error.message).toMatch(
      /steps\.0\.action/,
    );

    const atCap = await createCase(project.id, "Huge description", {
      description: "D".repeat(DESCRIPTION_MAX),
      steps: [{ action: "A".repeat(STEP_TEXT_MAX) }],
    });
    expect(atCap.description).toHaveLength(DESCRIPTION_MAX);
    expect(atCap.steps[0].action).toHaveLength(STEP_TEXT_MAX);
  });

  it("creates, PUT-reorders, and GETs a case with 100+ steps", async () => {
    const project = await createProject();
    const steps = Array.from({ length: 120 }, (_, i) => ({
      action: `Step ${i + 1} action`,
      expectedResult: i % 3 === 0 ? `Expected ${i + 1}` : null,
    }));
    const created = await createCase(project.id, "Long case", { steps });
    expect(created.steps).toHaveLength(120);
    expect(created.steps.map((s) => s.position)).toEqual(
      Array.from({ length: 120 }, (_, i) => i + 1),
    );

    const reversed = [...steps].reverse();
    const updated = await invoke(PUT, {
      method: "PUT",
      path: `/api/v1/test-cases/${created.id}`,
      params: { id: String(created.id) },
      body: {
        title: created.title,
        description: null,
        directoryId: null,
        steps: reversed,
      },
    });
    expect(updated.status).toBe(200);
    const afterPut = testCaseSchema.parse(updated.json);
    expect(afterPut.steps.map((s) => s.action)).toEqual(
      reversed.map((s) => s.action),
    );
    expect(afterPut.steps.map((s) => s.position)).toEqual(
      Array.from({ length: 120 }, (_, i) => i + 1),
    );

    const fetched = await invoke(GET_BY_ID, {
      path: `/api/v1/test-cases/${created.id}`,
      params: { id: String(created.id) },
    });
    expect(testCaseSchema.parse(fetched.json).steps).toHaveLength(120);
  });
});

describe("M5-1 deep nesting", () => {
  it("builds a 12-level tree and rejects moving a mid-chain folder under a descendant", async () => {
    const project = await createProject();
    const chain: { id: number; name: string }[] = [];
    let parentId: number | null = null;
    for (let level = 1; level <= 12; level += 1) {
      const dir = await createDir(project.id, `L${level}`, parentId);
      chain.push({ id: dir.id, name: dir.name });
      parentId = dir.id;
    }

    const tree = projectTreeSchema.parse(
      (
        await invoke(GET_TREE, {
          path: `/api/v1/projects/${project.id}/tree`,
          params: { id: String(project.id) },
        })
      ).json,
    );
    let node = tree.directories[0];
    expect(node.name).toBe("L1");
    for (let level = 2; level <= 12; level += 1) {
      expect(node.children).toHaveLength(1);
      node = node.children[0];
      expect(node.name).toBe(`L${level}`);
    }
    expect(node.children).toEqual([]);

    const mid = chain[3];
    const deep = chain[10];
    const started = Date.now();
    const cycle = await invoke(PATCH_DIRECTORY, {
      method: "PATCH",
      path: `/api/v1/directories/${mid.id}`,
      params: { id: String(mid.id) },
      body: { parentId: deep.id },
    });
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(cycle.status).toBe(409);
    expect(errorBodySchema.parse(cycle.json).error.code).toBe("CYCLE_DETECTED");
  });
});

describe("M5-1 prefix edits", () => {
  it("404s the old display number after a prefix change and serves the new one", async () => {
    const prefix = uniquePrefix("W");
    const project = await createProject(prefix);
    const created = await createCase(project.id, "Immutable number");
    const oldDisplay = `${prefix}-1`;
    expect(created.displayNumber).toBe(oldDisplay);

    const newPrefix = uniquePrefix("X");
    const patched = await invoke(PATCH_PROJECT, {
      method: "PATCH",
      path: `/api/v1/projects/${project.id}`,
      params: { id: String(project.id) },
      body: { prefix: newPrefix },
    });
    expect(patched.status).toBe(200);
    expect(projectSchema.parse(patched.json).prefix).toBe(newPrefix);

    const stale = await invoke(GET_BY_NUMBER, {
      path: `/api/v1/test-cases/number/${oldDisplay}`,
      params: { displayNumber: oldDisplay },
    });
    expect(stale.status).toBe(404);
    expect(errorBodySchema.parse(stale.json).error.code).toBe("NOT_FOUND");

    const fresh = await invoke(GET_BY_NUMBER, {
      path: `/api/v1/test-cases/number/${newPrefix}-1`,
      params: { displayNumber: `${newPrefix}-1` },
    });
    expect(fresh.status).toBe(200);
    expect(testCaseSchema.parse(fresh.json).id).toBe(created.id);
    expect(testCaseSchema.parse(fresh.json).caseNumber).toBe(1);
  });

  it("keeps numbering and display numbers consistent across concurrent prefix change + create", async () => {
    const prefix = uniquePrefix("P");
    const project = await createProject(prefix);
    await createCase(project.id, "Existing");
    const newPrefix = uniquePrefix("Q");

    const [patched, created] = await Promise.all([
      invoke(PATCH_PROJECT, {
        method: "PATCH",
        path: `/api/v1/projects/${project.id}`,
        params: { id: String(project.id) },
        body: { prefix: newPrefix },
      }),
      invoke(POST_CASE, {
        method: "POST",
        path: "/api/v1/test-cases",
        body: { projectId: project.id, title: "Created during reprefix" },
      }),
    ]);

    expect(patched.status).toBe(200);
    expect(created.status).toBe(201);
    const caseBody = testCaseSchema.parse(created.json);
    expect(caseBody.caseNumber).toBe(2);
    expect(
      caseBody.displayNumber === `${prefix}-2` ||
        caseBody.displayNumber === `${newPrefix}-2`,
    ).toBe(true);

    const oldTwo = await invoke(GET_BY_NUMBER, {
      path: `/api/v1/test-cases/number/${prefix}-2`,
      params: { displayNumber: `${prefix}-2` },
    });
    const newTwo = await invoke(GET_BY_NUMBER, {
      path: `/api/v1/test-cases/number/${newPrefix}-2`,
      params: { displayNumber: `${newPrefix}-2` },
    });
    const hits = [oldTwo, newTwo].filter((r) => r.status === 200);
    expect(hits).toHaveLength(1);
    expect(testCaseSchema.parse(hits[0].json).id).toBe(caseBody.id);
    expect([oldTwo.status, newTwo.status].sort()).toEqual([200, 404]);
  });
});

describe("M5-1 concurrency", () => {
  it("serializes parallel PUTs so steps are never mixed or duplicated", async () => {
    const project = await createProject();
    const created = await createCase(project.id, "Race me", {
      steps: [{ action: "A1" }, { action: "A2" }, { action: "A3" }],
    });

    const payloads = Array.from({ length: 8 }, (_, i) => ({
      title: created.title,
      description: null,
      directoryId: null,
      steps: [
        { action: `W${i}-1` },
        { action: `W${i}-2` },
        { action: `W${i}-3` },
        { action: `W${i}-4` },
      ],
    }));

    const results = await Promise.all(
      payloads.map((body) =>
        invoke(PUT, {
          method: "PUT",
          path: `/api/v1/test-cases/${created.id}`,
          params: { id: String(created.id) },
          body,
        }),
      ),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);

    const fetched = testCaseSchema.parse(
      (
        await invoke(GET_BY_ID, {
          path: `/api/v1/test-cases/${created.id}`,
          params: { id: String(created.id) },
        })
      ).json,
    );
    expect(fetched.steps).toHaveLength(4);
    expect(fetched.steps.map((s) => s.position)).toEqual([1, 2, 3, 4]);
    const writer = fetched.steps[0].action.match(/^W(\d+)-1$/);
    expect(writer).not.toBeNull();
    const n = writer![1];
    expect(fetched.steps.map((s) => s.action)).toEqual([
      `W${n}-1`,
      `W${n}-2`,
      `W${n}-3`,
      `W${n}-4`,
    ]);
  });

  it("lets bulk-trash { all } and a concurrent restore complete without mixed state", async () => {
    const project = await createProject();
    const active = await Promise.all(
      ["A", "B", "C", "D"].map((title) => createCase(project.id, title)),
    );
    const toRestore = await createCase(project.id, "Already trashed");
    await invoke(SOFT_DELETE, {
      method: "DELETE",
      path: `/api/v1/test-cases/${toRestore.id}`,
      params: { id: String(toRestore.id) },
    });

    const [trashAll, restored] = await Promise.all([
      invoke(BULK_TRASH, {
        method: "POST",
        path: "/api/v1/test-cases/bulk-trash",
        body: { projectId: project.id, all: true },
      }),
      invoke(RESTORE, {
        method: "POST",
        path: `/api/v1/test-cases/${toRestore.id}/restore`,
        params: { id: String(toRestore.id) },
      }),
    ]);

    expect(trashAll.status).toBe(200);
    expect(restored.status).toBe(200);
    expect(testCaseSchema.parse(restored.json).deletedAt).toBeNull();

    const { rows } = await pool.query<{
      id: string;
      deleted_at: Date | null;
    }>(`SELECT id, deleted_at FROM test_cases WHERE project_id = $1`, [
      project.id,
    ]);
    const byId = new Map(rows.map((r) => [Number(r.id), r.deleted_at]));
    for (const item of active) {
      expect(byId.get(item.id)).not.toBeNull();
    }
    expect(byId.get(toRestore.id)).toBeNull();
  });

  it("does not leave an escaped active case when create races trash_contents delete", async () => {
    const project = await createProject();
    const dir = await createDir(project.id, "Soon gone");

    const [deleted, created] = await Promise.all([
      invoke(DELETE_DIRECTORY, {
        method: "DELETE",
        path: `/api/v1/directories/${dir.id}?mode=trash_contents`,
        params: { id: String(dir.id) },
      }),
      invoke(POST_CASE, {
        method: "POST",
        path: "/api/v1/test-cases",
        body: {
          projectId: project.id,
          title: "Created into vanishing folder",
          directoryId: dir.id,
        },
      }),
    ]);

    expect([200, 404, 409].includes(deleted.status)).toBe(true);
    expect([201, 404].includes(created.status)).toBe(true);
    if (created.status === 201) {
      const createdCase = testCaseSchema.parse(created.json);
      const { rows } = await pool.query<{
        deleted_at: Date | null;
        directory_id: string | null;
      }>(`SELECT deleted_at, directory_id FROM test_cases WHERE id = $1`, [
        createdCase.id,
      ]);
      const stillThere = await pool.query(
        `SELECT count(*)::int AS n FROM directories WHERE id = $1`,
        [dir.id],
      );
      const dirGone = stillThere.rows[0].n === 0;
      if (dirGone) {
        expect(rows[0].deleted_at).not.toBeNull();
      }
    }
  });

  it("surfaces concurrent sibling-name creates as SIBLING_NAME_TAKEN, not 500", async () => {
    const project = await createProject();
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        invoke(POST_DIRECTORY, {
          method: "POST",
          path: "/api/v1/directories",
          body: { projectId: project.id, name: "SameName", parentId: null },
        }),
      ),
    );
    const created = results.filter((r) => r.status === 201);
    const conflicts = results.filter((r) => r.status === 409);
    const failures = results.filter((r) => r.status >= 500);
    expect(created).toHaveLength(1);
    expect(conflicts).toHaveLength(5);
    expect(failures).toHaveLength(0);
    for (const conflict of conflicts) {
      expect(errorBodySchema.parse(conflict.json).error.code).toBe(
        "SIBLING_NAME_TAKEN",
      );
    }
  });
});

describe("M5-1 pagination and search edges", () => {
  it("rejects pageSize 0, negative, and 201; page past the end is empty 200", async () => {
    const project = await createProject();
    await createCase(project.id, "Only one");

    for (const pageSize of ["0", "-1", "201"]) {
      const result = await invoke(LIST_CASES, {
        path: `/api/v1/test-cases?projectId=${project.id}&pageSize=${pageSize}`,
      });
      expect(result.status).toBe(400);
      expect(errorBodySchema.parse(result.json).error.code).toBe(
        "VALIDATION_ERROR",
      );
    }

    const pastEnd = testCaseListResponseSchema.parse(
      (
        await invoke(LIST_CASES, {
          path: `/api/v1/test-cases?projectId=${project.id}&page=9&pageSize=50`,
        })
      ).json,
    );
    expect(pastEnd.items).toEqual([]);
    expect(pastEnd.totalItems).toBe(1);
    expect(pastEnd.totalPages).toBe(1);
  });

  it("treats SQL/regex metacharacters and unicode in q, titles, and markdown as literals", async () => {
    const project = await createProject();
    const title = `100%_off \\'drop 登录 🔐`;
    const created = await createCase(project.id, title, {
      description: "Table `%` and `_` and emoji 🧪",
      steps: [{ action: "Look for `'%_\\` and 登录" }],
    });
    expect(created.title).toBe(title);

    async function search(q: string) {
      return testCaseListResponseSchema.parse(
        (
          await invoke(LIST_CASES, {
            path: `/api/v1/test-cases?projectId=${project.id}&q=${encodeURIComponent(q)}`,
          })
        ).json,
      );
    }

    expect((await search("%")).items).toHaveLength(1);
    expect((await search("_")).items).toHaveLength(1);
    expect((await search("'")).items).toHaveLength(1);
    expect((await search("\\")).items).toHaveLength(1);
    expect((await search("登录")).items).toHaveLength(1);
    expect((await search("🔐")).items).toHaveLength(1);
    expect((await search("nomatch_xyz")).items).toHaveLength(0);
  });
});

describe("M5-1 numbering", () => {
  it("assigns a high case_number and does not burn numbers on failed creates", async () => {
    const project = await createProject();
    await pool.query(
      `UPDATE projects SET next_case_number = $2 WHERE id = $1`,
      [project.id, 1_000_000],
    );
    const high = await createCase(project.id, "High number");
    expect(high.caseNumber).toBe(1_000_000);
    expect(high.displayNumber).toBe(`${project.prefix}-1000000`);

    const before = await nextCaseNumber(project.id);
    const blank = await invoke(POST_CASE, {
      method: "POST",
      path: "/api/v1/test-cases",
      body: { projectId: project.id, title: "" },
    });
    expect(blank.status).toBe(400);
    expect(await nextCaseNumber(project.id)).toBe(before);

    const missingDir = await invoke(POST_CASE, {
      method: "POST",
      path: "/api/v1/test-cases",
      body: {
        projectId: project.id,
        title: "Missing folder",
        directoryId: 9_999_999_999,
      },
    });
    expect(missingDir.status).toBe(404);
    expect(await nextCaseNumber(project.id)).toBe(before);
  });
});

describe("M5-1 HTTP hygiene", () => {
  it("returns a JSON 404 envelope for unknown /api/v1 paths", async () => {
    const result = await invoke(CATCH_ALL, {
      path: "/api/v1/definitely-not-a-route",
    });
    expect(result.status).toBe(404);
    const body = errorBodySchema.parse(result.json);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toMatch(/definitely-not-a-route/);
  });

  it("rejects malformed JSON as 400 VALIDATION_ERROR, not 500", async () => {
    const result = await invoke(POST_PROJECT, {
      method: "POST",
      path: "/api/v1/projects",
      rawBody: "{ not json",
      headers: { "content-type": "application/json" },
    });
    expect(result.status).toBe(400);
    expect(errorBodySchema.parse(result.json)).toEqual({
      error: { code: "VALIDATION_ERROR", message: "Invalid JSON body" },
    });
  });

  it("parses a JSON body when Content-Type is omitted", async () => {
    const result = await invoke(POST_PROJECT, {
      method: "POST",
      path: "/api/v1/projects",
      rawBody: JSON.stringify({
        name: uniqueName("NoCT"),
        prefix: uniquePrefix("H"),
      }),
    });
    expect(result.status).toBe(201);
    const project = projectSchema.parse(result.json);
    projectIds.push(project.id);
  });
});
