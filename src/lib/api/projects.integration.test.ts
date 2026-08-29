import { afterEach, describe, expect, it } from "vitest";

import { DELETE, PATCH } from "@/app/api/v1/projects/[id]/route";
import { GET, POST } from "@/app/api/v1/projects/route";
import {
  errorBodySchema,
  projectListResponseSchema,
  projectSchema,
} from "@/lib/contracts";
import { pool } from "@/lib/db";
import { testCases } from "@/lib/db/schema";
import { db } from "@/lib/db";

import { allocateCaseNumber } from "./numbering";
import { invoke, uniqueName, uniquePrefix } from "./test-helpers";

const createdIds: number[] = [];

afterEach(async () => {
  for (const id of createdIds.splice(0)) {
    await pool.query("DELETE FROM projects WHERE id = $1", [id]);
  }
});

async function createViaApi(name = uniqueName(), prefix = uniquePrefix("P")) {
  const result = await invoke(POST, {
    method: "POST",
    path: "/api/v1/projects",
    body: { name, prefix },
  });
  expect(result.status).toBe(201);
  const project = projectSchema.parse(result.json);
  createdIds.push(project.id);
  return project;
}

describe("POST /api/v1/projects", () => {
  it("creates a project with nextCaseNumber 1 and a Location header", async () => {
    const name = uniqueName("Web");
    const prefix = uniquePrefix("W");
    const result = await invoke(POST, {
      method: "POST",
      path: "/api/v1/projects",
      body: { name, prefix },
    });
    expect(result.status).toBe(201);
    const project = projectSchema.parse(result.json);
    createdIds.push(project.id);
    expect(project.name).toBe(name);
    expect(project.prefix).toBe(prefix);
    expect(project.nextCaseNumber).toBe(1);
    expect(result.headers.get("Location")).toBe(
      `/api/v1/projects/${project.id}`,
    );
  });

  it("rejects a lowercase prefix as VALIDATION_ERROR", async () => {
    const result = await invoke(POST, {
      method: "POST",
      path: "/api/v1/projects",
      body: { name: uniqueName(), prefix: "web" },
    });
    expect(result.status).toBe(400);
    const body = errorBodySchema.parse(result.json);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toMatch(/prefix/i);
  });

  it("rejects a too-short prefix", async () => {
    const result = await invoke(POST, {
      method: "POST",
      path: "/api/v1/projects",
      body: { name: uniqueName(), prefix: "W" },
    });
    expect(result.status).toBe(400);
    expect(errorBodySchema.parse(result.json).error.code).toBe(
      "VALIDATION_ERROR",
    );
  });

  it("returns PREFIX_TAKEN for a duplicate prefix", async () => {
    const prefix = uniquePrefix("D");
    await createViaApi(uniqueName("One"), prefix);
    const result = await invoke(POST, {
      method: "POST",
      path: "/api/v1/projects",
      body: { name: uniqueName("Two"), prefix },
    });
    expect(result.status).toBe(409);
    const body = errorBodySchema.parse(result.json);
    expect(body.error.code).toBe("PREFIX_TAKEN");
    expect(body.error.message).toContain(prefix);
  });

  it("returns NAME_TAKEN for a duplicate name", async () => {
    const name = uniqueName("Same");
    await createViaApi(name, uniquePrefix("A"));
    const result = await invoke(POST, {
      method: "POST",
      path: "/api/v1/projects",
      body: { name, prefix: uniquePrefix("B") },
    });
    expect(result.status).toBe(409);
    expect(errorBodySchema.parse(result.json).error.code).toBe("NAME_TAKEN");
  });
});

describe("GET /api/v1/projects", () => {
  it("lists projects sorted by name ascending", async () => {
    const prefixZ = uniquePrefix("Z");
    const prefixA = uniquePrefix("A");
    const later = await createViaApi(`Zeta ${prefixZ}`, prefixZ);
    const earlier = await createViaApi(`Alpha ${prefixA}`, prefixA);

    const result = await invoke(GET, { path: "/api/v1/projects" });
    expect(result.status).toBe(200);
    const list = projectListResponseSchema.parse(result.json);
    const names = list.items.map((p) => p.name);
    const alphaIdx = names.indexOf(earlier.name);
    const zetaIdx = names.indexOf(later.name);
    expect(alphaIdx).toBeGreaterThanOrEqual(0);
    expect(zetaIdx).toBeGreaterThan(alphaIdx);
  });
});

describe("PATCH /api/v1/projects/:id", () => {
  it("renames and reprefixes without changing stored case numbers", async () => {
    const project = await createViaApi();
    const caseNumber = await db.transaction(async (tx) => {
      const n = await allocateCaseNumber(tx, project.id);
      await tx.insert(testCases).values({
        projectId: project.id,
        caseNumber: n,
        title: "Immutable number",
      });
      return n;
    });

    const newPrefix = uniquePrefix("R");
    const newName = uniqueName("Renamed");
    const result = await invoke(PATCH, {
      method: "PATCH",
      path: `/api/v1/projects/${project.id}`,
      params: { id: String(project.id) },
      body: { name: newName, prefix: newPrefix },
    });
    expect(result.status).toBe(200);
    const updated = projectSchema.parse(result.json);
    expect(updated.name).toBe(newName);
    expect(updated.prefix).toBe(newPrefix);
    expect(updated.nextCaseNumber).toBe(2);

    const { rows } = await pool.query<{ case_number: number }>(
      `SELECT case_number FROM test_cases WHERE project_id = $1`,
      [project.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].case_number).toBe(caseNumber);
    expect(`${newPrefix}-${caseNumber}`).toBe(`${newPrefix}-1`);
  });

  it("returns 404 for an unknown id", async () => {
    const result = await invoke(PATCH, {
      method: "PATCH",
      path: "/api/v1/projects/999999",
      params: { id: "999999" },
      body: { name: uniqueName() },
    });
    expect(result.status).toBe(404);
    expect(errorBodySchema.parse(result.json).error.code).toBe("NOT_FOUND");
  });

  it("returns 400 for a non-numeric id", async () => {
    const result = await invoke(PATCH, {
      method: "PATCH",
      path: "/api/v1/projects/abc",
      params: { id: "abc" },
      body: { name: uniqueName() },
    });
    expect(result.status).toBe(400);
    expect(errorBodySchema.parse(result.json).error.code).toBe(
      "VALIDATION_ERROR",
    );
  });
});

describe("DELETE /api/v1/projects/:id", () => {
  it("deletes an empty project with 204", async () => {
    const project = await createViaApi();
    const result = await invoke(DELETE, {
      method: "DELETE",
      path: `/api/v1/projects/${project.id}`,
      params: { id: String(project.id) },
    });
    expect(result.status).toBe(204);
    expect(result.text).toBe("");
    createdIds.splice(createdIds.indexOf(project.id), 1);
  });

  it("rejects delete when the project has an active case", async () => {
    const project = await createViaApi();
    await db.transaction(async (tx) => {
      const n = await allocateCaseNumber(tx, project.id);
      await tx.insert(testCases).values({
        projectId: project.id,
        caseNumber: n,
        title: "Still here",
      });
    });

    const result = await invoke(DELETE, {
      method: "DELETE",
      path: `/api/v1/projects/${project.id}`,
      params: { id: String(project.id) },
    });
    expect(result.status).toBe(409);
    const body = errorBodySchema.parse(result.json);
    expect(body.error.code).toBe("PROJECT_NOT_EMPTY");
  });

  it("rejects delete when the project only has trashed cases", async () => {
    const project = await createViaApi();
    await db.transaction(async (tx) => {
      const n = await allocateCaseNumber(tx, project.id);
      await tx.insert(testCases).values({
        projectId: project.id,
        caseNumber: n,
        title: "In trash",
        deletedAt: new Date(),
      });
    });

    const result = await invoke(DELETE, {
      method: "DELETE",
      path: `/api/v1/projects/${project.id}`,
      params: { id: String(project.id) },
    });
    expect(result.status).toBe(409);
    expect(errorBodySchema.parse(result.json).error.code).toBe(
      "PROJECT_NOT_EMPTY",
    );
  });
});

describe("per-project case numbering", () => {
  it("assigns 20 distinct consecutive numbers under concurrent creates", async () => {
    const project = await createViaApi();

    const numbers = await Promise.all(
      Array.from({ length: 20 }, async (_, index) =>
        db.transaction(async (tx) => {
          const n = await allocateCaseNumber(tx, project.id);
          await tx.insert(testCases).values({
            projectId: project.id,
            caseNumber: n,
            title: `Hammer ${index}`,
          });
          return n;
        }),
      ),
    );

    expect(new Set(numbers).size).toBe(20);
    const sorted = [...numbers].sort((a, b) => a - b);
    expect(sorted).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));

    const { rows } = await pool.query<{ next_case_number: number }>(
      `SELECT next_case_number FROM projects WHERE id = $1`,
      [project.id],
    );
    expect(rows[0].next_case_number).toBe(21);
  });
});
