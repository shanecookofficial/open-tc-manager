import { afterEach, describe, expect, it } from "vitest";

import { PATCH as PATCH_MOVE } from "@/app/api/v1/test-cases/[id]/move/route";
import {
  DELETE,
  GET as GET_BY_ID,
  PUT,
} from "@/app/api/v1/test-cases/[id]/route";
import { GET as GET_BY_NUMBER } from "@/app/api/v1/test-cases/number/[displayNumber]/route";
import { GET, POST } from "@/app/api/v1/test-cases/route";
import { POST as POST_DIRECTORY } from "@/app/api/v1/directories/route";
import { GET as GET_TREE } from "@/app/api/v1/projects/[id]/tree/route";
import { POST as POST_PROJECT } from "@/app/api/v1/projects/route";
import {
  directorySchema,
  errorBodySchema,
  projectSchema,
  projectTreeSchema,
  testCaseListResponseSchema,
  testCaseSchema,
} from "@/lib/contracts";
import { pool } from "@/lib/db";

import { invoke, uniqueName, uniquePrefix } from "./test-helpers";

const projectIds: number[] = [];

afterEach(async () => {
  for (const id of projectIds.splice(0)) {
    await pool.query("DELETE FROM projects WHERE id = $1", [id]);
  }
});

async function createProject(prefix = uniquePrefix("C")) {
  const result = await invoke(POST_PROJECT, {
    method: "POST",
    path: "/api/v1/projects",
    body: { name: uniqueName("Cases"), prefix },
  });
  const project = projectSchema.parse(result.json);
  projectIds.push(project.id);
  return project;
}

async function createDir(projectId: number, name: string) {
  const result = await invoke(POST_DIRECTORY, {
    method: "POST",
    path: "/api/v1/directories",
    body: { projectId, name, parentId: null },
  });
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
  const result = await invoke(POST, {
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

describe("POST /api/v1/test-cases", () => {
  it("creates a case with atomic numbering, steps, and a Location header", async () => {
    const project = await createProject();
    const dir = await createDir(project.id, "Auth");
    const created = await createCase(project.id, "Login happy path", {
      directoryId: dir.id,
      description: "A verified shopper.",
      steps: [
        { action: "Open `/login`.", expectedResult: "Form is empty." },
        { action: "Submit valid credentials." },
      ],
    });

    expect(created.caseNumber).toBe(1);
    expect(created.displayNumber).toBe(`${project.prefix}-1`);
    expect(created.steps).toHaveLength(2);
    expect(created.steps[0].position).toBe(1);
    expect(created.steps[1].expectedResult).toBeNull();
    expect(created.directoryPath).toEqual([{ id: dir.id, name: "Auth" }]);
    expect(created.deletedAt).toBeNull();

    const header = await invoke(POST, {
      method: "POST",
      path: "/api/v1/test-cases",
      body: { projectId: project.id, title: "Second" },
    });
    expect(header.headers.get("Location")).toBe(
      `/api/v1/test-cases/${testCaseSchema.parse(header.json).id}`,
    );
    expect(testCaseSchema.parse(header.json).caseNumber).toBe(2);
  });

  it("allows zero steps", async () => {
    const project = await createProject();
    const created = await createCase(project.id, "Draft");
    expect(created.steps).toEqual([]);
  });

  it("returns fieldPath messages for empty title and empty action", async () => {
    const project = await createProject();
    const missingTitle = await invoke(POST, {
      method: "POST",
      path: "/api/v1/test-cases",
      body: { projectId: project.id, title: "" },
    });
    expect(missingTitle.status).toBe(400);
    const titleError = errorBodySchema.parse(missingTitle.json);
    expect(titleError.error.code).toBe("VALIDATION_ERROR");
    expect(titleError.error.message).toMatch(/^title: /);

    const emptyAction = await invoke(POST, {
      method: "POST",
      path: "/api/v1/test-cases",
      body: {
        projectId: project.id,
        title: "Has a title",
        steps: [{ action: "" }],
      },
    });
    expect(emptyAction.status).toBe(400);
    const actionError = errorBodySchema.parse(emptyAction.json);
    expect(actionError.error.message).toMatch(/^steps\.0\.action: /);
  });
});

describe("GET /api/v1/test-cases", () => {
  it("paginates, searches title and display number, and excludes trash", async () => {
    const prefix = uniquePrefix("S");
    const project = await createProject(prefix);
    const dir = await createDir(project.id, "Auth");
    await createCase(project.id, "Alpha walrus login", { directoryId: dir.id });
    const second = await createCase(project.id, "Beta checkout");
    await createCase(project.id, "Gamma search target");

    const trashed = await createCase(project.id, "Retired walrus");
    await invoke(DELETE, {
      method: "DELETE",
      path: `/api/v1/test-cases/${trashed.id}`,
      params: { id: String(trashed.id) },
    });

    const listed = await invoke(GET, {
      path: `/api/v1/test-cases?projectId=${project.id}&page=1&pageSize=2`,
    });
    expect(listed.status).toBe(200);
    const page1 = testCaseListResponseSchema.parse(listed.json);
    expect(page1.totalItems).toBe(3);
    expect(page1.totalPages).toBe(2);
    expect(page1.items).toHaveLength(2);
    expect(page1.items.map((c) => c.caseNumber)).toEqual([1, 2]);
    expect(page1.items.every((c) => c.deletedAt === null)).toBe(true);

    const page2 = testCaseListResponseSchema.parse(
      (
        await invoke(GET, {
          path: `/api/v1/test-cases?projectId=${project.id}&page=2&pageSize=2`,
        })
      ).json,
    );
    expect(page2.items).toHaveLength(1);
    expect(page2.totalItems).toBe(3);

    const pastEnd = testCaseListResponseSchema.parse(
      (
        await invoke(GET, {
          path: `/api/v1/test-cases?projectId=${project.id}&page=9&pageSize=2`,
        })
      ).json,
    );
    expect(pastEnd.items).toEqual([]);
    expect(pastEnd.totalItems).toBe(3);
    expect(pastEnd.totalPages).toBe(2);

    const byTitle = testCaseListResponseSchema.parse(
      (
        await invoke(GET, {
          path: `/api/v1/test-cases?projectId=${project.id}&q=WALRUS`,
        })
      ).json,
    );
    expect(byTitle.items.map((c) => c.title)).toEqual(["Alpha walrus login"]);

    const byNumber = testCaseListResponseSchema.parse(
      (
        await invoke(GET, {
          path: `/api/v1/test-cases?projectId=${project.id}&q=${prefix}-2`,
        })
      ).json,
    );
    expect(byNumber.items).toHaveLength(1);
    expect(byNumber.items[0].id).toBe(second.id);

    const rootOnly = testCaseListResponseSchema.parse(
      (
        await invoke(GET, {
          path: `/api/v1/test-cases?projectId=${project.id}&directoryId=`,
        })
      ).json,
    );
    expect(rootOnly.items.every((c) => c.directoryId === null)).toBe(true);
    expect(rootOnly.totalItems).toBe(2);

    const inDir = testCaseListResponseSchema.parse(
      (
        await invoke(GET, {
          path: `/api/v1/test-cases?projectId=${project.id}&directoryId=${dir.id}`,
        })
      ).json,
    );
    expect(inDir.totalItems).toBe(1);
    expect(inDir.items[0].title).toBe("Alpha walrus login");
  });

  it("requires projectId", async () => {
    const result = await invoke(GET, { path: "/api/v1/test-cases" });
    expect(result.status).toBe(400);
    expect(errorBodySchema.parse(result.json).error.code).toBe(
      "VALIDATION_ERROR",
    );
  });
});

describe("GET by id and display number", () => {
  it("returns a trashed case with deletedAt set", async () => {
    const project = await createProject();
    const created = await createCase(project.id, "Soon trashed", {
      steps: [{ action: "Do it" }],
    });
    await invoke(DELETE, {
      method: "DELETE",
      path: `/api/v1/test-cases/${created.id}`,
      params: { id: String(created.id) },
    });

    const byId = await invoke(GET_BY_ID, {
      path: `/api/v1/test-cases/${created.id}`,
      params: { id: String(created.id) },
    });
    expect(byId.status).toBe(200);
    const fromId = testCaseSchema.parse(byId.json);
    expect(fromId.deletedAt).not.toBeNull();

    const byNumber = await invoke(GET_BY_NUMBER, {
      path: `/api/v1/test-cases/number/${created.displayNumber}`,
      params: { displayNumber: created.displayNumber },
    });
    expect(byNumber.status).toBe(200);
    expect(testCaseSchema.parse(byNumber.json).id).toBe(created.id);
  });

  it("rejects a malformed display number", async () => {
    const result = await invoke(GET_BY_NUMBER, {
      path: "/api/v1/test-cases/number/web-1",
      params: { displayNumber: "web-1" },
    });
    expect(result.status).toBe(400);
    expect(errorBodySchema.parse(result.json).error.code).toBe(
      "VALIDATION_ERROR",
    );
  });
});

describe("PUT /api/v1/test-cases/:id and move", () => {
  it("keeps caseNumber immutable across move and full update", async () => {
    const project = await createProject();
    const dest = await createDir(project.id, "Checkout");
    const created = await createCase(project.id, "Original", {
      steps: [
        { action: "A", expectedResult: "a" },
        { action: "B", expectedResult: "b" },
      ],
    });
    const originalNumber = created.caseNumber;
    const originalDisplay = created.displayNumber;

    const moved = await invoke(PATCH_MOVE, {
      method: "PATCH",
      path: `/api/v1/test-cases/${created.id}/move`,
      params: { id: String(created.id) },
      body: { directoryId: dest.id },
    });
    expect(moved.status).toBe(200);
    const afterMove = testCaseSchema.parse(moved.json);
    expect(afterMove.caseNumber).toBe(originalNumber);
    expect(afterMove.displayNumber).toBe(originalDisplay);
    expect(afterMove.directoryId).toBe(dest.id);
    expect(afterMove.directoryPath).toEqual([
      { id: dest.id, name: "Checkout" },
    ]);

    const updated = await invoke(PUT, {
      method: "PUT",
      path: `/api/v1/test-cases/${created.id}`,
      params: { id: String(created.id) },
      body: {
        title: "Updated title",
        description: null,
        directoryId: dest.id,
        steps: [
          { action: "B", expectedResult: "b" },
          { action: "A", expectedResult: "a" },
        ],
      },
    });
    expect(updated.status).toBe(200);
    const afterPut = testCaseSchema.parse(updated.json);
    expect(afterPut.caseNumber).toBe(originalNumber);
    expect(afterPut.displayNumber).toBe(originalDisplay);
    expect(afterPut.title).toBe("Updated title");
    expect(afterPut.steps.map((s) => s.action)).toEqual(["B", "A"]);
    expect(afterPut.steps.map((s) => s.position)).toEqual([1, 2]);
    expect(afterPut.steps[0].id).not.toBe(created.steps[0].id);
  });

  it("rejects PUT on a trashed case", async () => {
    const project = await createProject();
    const created = await createCase(project.id, "Trash me");
    await invoke(DELETE, {
      method: "DELETE",
      path: `/api/v1/test-cases/${created.id}`,
      params: { id: String(created.id) },
    });
    const result = await invoke(PUT, {
      method: "PUT",
      path: `/api/v1/test-cases/${created.id}`,
      params: { id: String(created.id) },
      body: {
        title: "Nope",
        description: null,
        directoryId: null,
        steps: [],
      },
    });
    expect(result.status).toBe(409);
    expect(errorBodySchema.parse(result.json).error.code).toBe(
      "CASE_ALREADY_TRASHED",
    );
  });
});

describe("DELETE /api/v1/test-cases/:id (soft)", () => {
  it("returns the trashed case and drops it from list, search, and tree counts", async () => {
    const project = await createProject();
    const dir = await createDir(project.id, "Auth");
    const created = await createCase(project.id, "UniqueKiwi logout", {
      directoryId: dir.id,
    });

    const result = await invoke(DELETE, {
      method: "DELETE",
      path: `/api/v1/test-cases/${created.id}`,
      params: { id: String(created.id) },
    });
    expect(result.status).toBe(200);
    const trashed = testCaseSchema.parse(result.json);
    expect(trashed.deletedAt).not.toBeNull();
    expect(trashed.caseNumber).toBe(created.caseNumber);

    const list = testCaseListResponseSchema.parse(
      (
        await invoke(GET, {
          path: `/api/v1/test-cases?projectId=${project.id}`,
        })
      ).json,
    );
    expect(list.totalItems).toBe(0);

    const search = testCaseListResponseSchema.parse(
      (
        await invoke(GET, {
          path: `/api/v1/test-cases?projectId=${project.id}&q=UniqueKiwi`,
        })
      ).json,
    );
    expect(search.totalItems).toBe(0);

    const tree = projectTreeSchema.parse(
      (
        await invoke(GET_TREE, {
          path: `/api/v1/projects/${project.id}/tree`,
          params: { id: String(project.id) },
        })
      ).json,
    );
    expect(tree.activeCaseCount).toBe(0);
    expect(tree.trashCount).toBe(1);
    expect(tree.directories[0].activeCaseCount).toBe(0);
  });
});
