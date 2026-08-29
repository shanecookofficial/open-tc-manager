import { afterEach, describe, expect, it } from "vitest";

import { DELETE as DELETE_DIRECTORY } from "@/app/api/v1/directories/[id]/route";
import { POST as POST_DIRECTORY } from "@/app/api/v1/directories/route";
import { POST as PURGE } from "@/app/api/v1/projects/[id]/trash/purge/route";
import { GET as GET_TRASH } from "@/app/api/v1/projects/[id]/trash/route";
import { POST as POST_PROJECT } from "@/app/api/v1/projects/route";
import { POST as BULK_RESTORE } from "@/app/api/v1/test-cases/bulk-restore/route";
import { POST as BULK_TRASH } from "@/app/api/v1/test-cases/bulk-trash/route";
import { DELETE as PERMANENT } from "@/app/api/v1/test-cases/[id]/permanent/route";
import { POST as RESTORE } from "@/app/api/v1/test-cases/[id]/restore/route";
import {
  DELETE as SOFT_DELETE,
  GET as GET_BY_ID,
} from "@/app/api/v1/test-cases/[id]/route";
import {
  GET as LIST_CASES,
  POST as POST_CASE,
} from "@/app/api/v1/test-cases/route";
import {
  bulkCountResponseSchema,
  directorySchema,
  errorBodySchema,
  projectSchema,
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

async function createProject() {
  const result = await invoke(POST_PROJECT, {
    method: "POST",
    path: "/api/v1/projects",
    body: { name: uniqueName("Trash"), prefix: uniquePrefix("R") },
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
  directoryId: number | null = null,
) {
  const result = await invoke(POST_CASE, {
    method: "POST",
    path: "/api/v1/test-cases",
    body: { projectId, title, directoryId },
  });
  return testCaseSchema.parse(result.json);
}

async function trash(id: number) {
  const result = await invoke(SOFT_DELETE, {
    method: "DELETE",
    path: `/api/v1/test-cases/${id}`,
    params: { id: String(id) },
  });
  expect(result.status).toBe(200);
  return testCaseSchema.parse(result.json);
}

describe("restore", () => {
  it("restores to the original directory when it still exists", async () => {
    const project = await createProject();
    const dir = await createDir(project.id, "Auth");
    const created = await createCase(project.id, "Login", dir.id);
    await trash(created.id);

    const result = await invoke(RESTORE, {
      method: "POST",
      path: `/api/v1/test-cases/${created.id}/restore`,
      params: { id: String(created.id) },
    });
    expect(result.status).toBe(200);
    const restored = testCaseSchema.parse(result.json);
    expect(restored.deletedAt).toBeNull();
    expect(restored.directoryId).toBe(dir.id);
    expect(restored.directoryPath).toEqual([{ id: dir.id, name: "Auth" }]);
  });

  it("restores to root when the original directory is gone", async () => {
    const project = await createProject();
    const dir = await createDir(project.id, "Obsolete");
    const created = await createCase(project.id, "Legacy", dir.id);
    await trash(created.id);

    const deleted = await invoke(DELETE_DIRECTORY, {
      method: "DELETE",
      path: `/api/v1/directories/${dir.id}`,
      params: { id: String(dir.id) },
    });
    expect(deleted.status).toBe(200);

    const result = await invoke(RESTORE, {
      method: "POST",
      path: `/api/v1/test-cases/${created.id}/restore`,
      params: { id: String(created.id) },
    });
    expect(result.status).toBe(200);
    const restored = testCaseSchema.parse(result.json);
    expect(restored.deletedAt).toBeNull();
    expect(restored.directoryId).toBeNull();
    expect(restored.directoryPath).toEqual([]);
  });

  it("rejects restore of an active case", async () => {
    const project = await createProject();
    const created = await createCase(project.id, "Active");
    const result = await invoke(RESTORE, {
      method: "POST",
      path: `/api/v1/test-cases/${created.id}/restore`,
      params: { id: String(created.id) },
    });
    expect(result.status).toBe(409);
    expect(errorBodySchema.parse(result.json).error.code).toBe(
      "CASE_NOT_IN_TRASH",
    );
  });
});

describe("GET /api/v1/projects/:id/trash", () => {
  it("lists only trashed cases with pagination and filters", async () => {
    const project = await createProject();
    const dir = await createDir(project.id, "Auth");
    const a = await createCase(project.id, "Alpha kiwi", dir.id);
    const b = await createCase(project.id, "Beta mango");
    const active = await createCase(project.id, "Still active kiwi");
    await trash(a.id);
    await trash(b.id);

    const listed = await invoke(GET_TRASH, {
      path: `/api/v1/projects/${project.id}/trash?page=1&pageSize=1`,
      params: { id: String(project.id) },
    });
    expect(listed.status).toBe(200);
    const page = testCaseListResponseSchema.parse(listed.json);
    expect(page.totalItems).toBe(2);
    expect(page.totalPages).toBe(2);
    expect(page.items).toHaveLength(1);
    expect(page.items[0].deletedAt).not.toBeNull();

    const search = testCaseListResponseSchema.parse(
      (
        await invoke(GET_TRASH, {
          path: `/api/v1/projects/${project.id}/trash?q=kiwi`,
          params: { id: String(project.id) },
        })
      ).json,
    );
    expect(search.totalItems).toBe(1);
    expect(search.items[0].id).toBe(a.id);
    expect(search.items.map((c) => c.id)).not.toContain(active.id);

    const root = testCaseListResponseSchema.parse(
      (
        await invoke(GET_TRASH, {
          path: `/api/v1/projects/${project.id}/trash?directoryId=`,
          params: { id: String(project.id) },
        })
      ).json,
    );
    expect(root.items.map((c) => c.id)).toEqual([b.id]);
  });
});

describe("permanent delete", () => {
  it("hard-deletes a trashed case with 204", async () => {
    const project = await createProject();
    const created = await createCase(project.id, "Gone");
    await trash(created.id);

    const result = await invoke(PERMANENT, {
      method: "DELETE",
      path: `/api/v1/test-cases/${created.id}/permanent`,
      params: { id: String(created.id) },
    });
    expect(result.status).toBe(204);

    const missing = await invoke(GET_BY_ID, {
      path: `/api/v1/test-cases/${created.id}`,
      params: { id: String(created.id) },
    });
    expect(missing.status).toBe(404);
  });

  it("rejects permanent delete of an active case", async () => {
    const project = await createProject();
    const created = await createCase(project.id, "Alive");
    const result = await invoke(PERMANENT, {
      method: "DELETE",
      path: `/api/v1/test-cases/${created.id}/permanent`,
      params: { id: String(created.id) },
    });
    expect(result.status).toBe(409);
    expect(errorBodySchema.parse(result.json).error.code).toBe(
      "CASE_NOT_TRASHED",
    );
    const still = await invoke(GET_BY_ID, {
      path: `/api/v1/test-cases/${created.id}`,
      params: { id: String(created.id) },
    });
    expect(still.status).toBe(200);
    expect(testCaseSchema.parse(still.json).deletedAt).toBeNull();
  });
});

describe("bulk trash and restore", () => {
  it("trashes by ids and restores by all+filter transactionally", async () => {
    const project = await createProject();
    const dir = await createDir(project.id, "Auth");
    const a = await createCase(project.id, "One", dir.id);
    const b = await createCase(project.id, "Two", dir.id);
    const keep = await createCase(project.id, "Keep me");

    const trashed = await invoke(BULK_TRASH, {
      method: "POST",
      path: "/api/v1/test-cases/bulk-trash",
      body: { projectId: project.id, ids: [a.id, b.id] },
    });
    expect(trashed.status).toBe(200);
    expect(bulkCountResponseSchema.parse(trashed.json).count).toBe(2);

    const list = testCaseListResponseSchema.parse(
      (
        await invoke(LIST_CASES, {
          path: `/api/v1/test-cases?projectId=${project.id}`,
        })
      ).json,
    );
    expect(list.items.map((c) => c.id)).toEqual([keep.id]);

    const restored = await invoke(BULK_RESTORE, {
      method: "POST",
      path: "/api/v1/test-cases/bulk-restore",
      body: {
        projectId: project.id,
        all: true,
        filter: { directoryId: dir.id },
      },
    });
    expect(restored.status).toBe(200);
    expect(bulkCountResponseSchema.parse(restored.json).count).toBe(2);

    const after = testCaseListResponseSchema.parse(
      (
        await invoke(LIST_CASES, {
          path: `/api/v1/test-cases?projectId=${project.id}`,
        })
      ).json,
    );
    expect(after.totalItems).toBe(3);
  });

  it("fails atomically when any id is the wrong state", async () => {
    const project = await createProject();
    const active = await createCase(project.id, "Active");
    const trashedCase = await createCase(project.id, "Already trashed");
    await trash(trashedCase.id);

    const result = await invoke(BULK_TRASH, {
      method: "POST",
      path: "/api/v1/test-cases/bulk-trash",
      body: { projectId: project.id, ids: [active.id, trashedCase.id] },
    });
    expect(result.status).toBe(409);
    expect(errorBodySchema.parse(result.json).error.code).toBe(
      "CASE_ALREADY_TRASHED",
    );

    const stillActive = testCaseSchema.parse(
      (
        await invoke(GET_BY_ID, {
          path: `/api/v1/test-cases/${active.id}`,
          params: { id: String(active.id) },
        })
      ).json,
    );
    expect(stillActive.deletedAt).toBeNull();

    const restoreMix = await invoke(BULK_RESTORE, {
      method: "POST",
      path: "/api/v1/test-cases/bulk-restore",
      body: { projectId: project.id, ids: [trashedCase.id, active.id] },
    });
    expect(restoreMix.status).toBe(409);
    expect(errorBodySchema.parse(restoreMix.json).error.code).toBe(
      "CASE_NOT_IN_TRASH",
    );
    const stillTrashed = testCaseSchema.parse(
      (
        await invoke(GET_BY_ID, {
          path: `/api/v1/test-cases/${trashedCase.id}`,
          params: { id: String(trashedCase.id) },
        })
      ).json,
    );
    expect(stillTrashed.deletedAt).not.toBeNull();
  });

  it("fails atomically when any id is missing", async () => {
    const project = await createProject();
    const created = await createCase(project.id, "Real");
    const result = await invoke(BULK_TRASH, {
      method: "POST",
      path: "/api/v1/test-cases/bulk-trash",
      body: { projectId: project.id, ids: [created.id, 999999] },
    });
    expect(result.status).toBe(404);
    expect(errorBodySchema.parse(result.json).error.code).toBe("NOT_FOUND");
    const still = testCaseSchema.parse(
      (
        await invoke(GET_BY_ID, {
          path: `/api/v1/test-cases/${created.id}`,
          params: { id: String(created.id) },
        })
      ).json,
    );
    expect(still.deletedAt).toBeNull();
  });
});

describe("purge", () => {
  it("with all:true + filter deletes only matching trashed cases and never an active case", async () => {
    const project = await createProject();
    const matchTrashedA = await createCase(project.id, "retired flow A");
    const matchTrashedB = await createCase(project.id, "retired flow B");
    const otherTrashed = await createCase(project.id, "unrelated trash");
    const matchActive = await createCase(
      project.id,
      "retired but still active",
    );
    await trash(matchTrashedA.id);
    await trash(matchTrashedB.id);
    await trash(otherTrashed.id);

    const result = await invoke(PURGE, {
      method: "POST",
      path: `/api/v1/projects/${project.id}/trash/purge`,
      params: { id: String(project.id) },
      body: { all: true, filter: { q: "retired" } },
    });
    expect(result.status).toBe(200);
    expect(bulkCountResponseSchema.parse(result.json).count).toBe(2);

    expect(
      (
        await invoke(GET_BY_ID, {
          path: `/api/v1/test-cases/${matchTrashedA.id}`,
          params: { id: String(matchTrashedA.id) },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await invoke(GET_BY_ID, {
          path: `/api/v1/test-cases/${matchActive.id}`,
          params: { id: String(matchActive.id) },
        })
      ).status,
    ).toBe(200);
    expect(
      testCaseSchema.parse(
        (
          await invoke(GET_BY_ID, {
            path: `/api/v1/test-cases/${matchActive.id}`,
            params: { id: String(matchActive.id) },
          })
        ).json,
      ).deletedAt,
    ).toBeNull();
    expect(
      (
        await invoke(GET_BY_ID, {
          path: `/api/v1/test-cases/${otherTrashed.id}`,
          params: { id: String(otherTrashed.id) },
        })
      ).status,
    ).toBe(200);
  });

  it("rejects an ids list that includes an active case and deletes nothing", async () => {
    const project = await createProject();
    const active = await createCase(project.id, "Do not purge");
    const trashedCase = await createCase(project.id, "Purge candidate");
    await trash(trashedCase.id);

    const result = await invoke(PURGE, {
      method: "POST",
      path: `/api/v1/projects/${project.id}/trash/purge`,
      params: { id: String(project.id) },
      body: { ids: [trashedCase.id, active.id] },
    });
    expect(result.status).toBe(409);
    expect(errorBodySchema.parse(result.json).error.code).toBe(
      "CASE_NOT_TRASHED",
    );

    expect(
      (
        await invoke(GET_BY_ID, {
          path: `/api/v1/test-cases/${trashedCase.id}`,
          params: { id: String(trashedCase.id) },
        })
      ).status,
    ).toBe(200);
    expect(
      testCaseSchema.parse(
        (
          await invoke(GET_BY_ID, {
            path: `/api/v1/test-cases/${active.id}`,
            params: { id: String(active.id) },
          })
        ).json,
      ).deletedAt,
    ).toBeNull();
  });
});
