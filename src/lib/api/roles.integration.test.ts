import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { POST as POST_PROJECT } from "@/app/api/v1/projects/route";
import { DELETE as DELETE_ROLE } from "@/app/api/v1/roles/[id]/route";
import { GET as LIST_ROLES, POST as POST_ROLE } from "@/app/api/v1/roles/route";
import { POST as POST_CASE } from "@/app/api/v1/test-cases/route";
import { POST as POST_USER } from "@/app/api/v1/users/route";
import {
  authenticateAsTestAdmin,
  invoke,
  loginAs,
  uniqueEmail,
  uniqueName,
  uniquePrefix,
} from "@/lib/api/test-helpers";
import {
  errorBodySchema,
  projectSchema,
  roleListResponseSchema,
  roleSchema,
  testCaseSchema,
  userSchema,
} from "@/lib/contracts";
import { pool } from "@/lib/db";

const createdRoleIds: number[] = [];
const createdUserIds: number[] = [];
const projectIds: number[] = [];

beforeAll(async () => {
  await authenticateAsTestAdmin();
});

afterEach(async () => {
  for (const id of projectIds.splice(0)) {
    await pool.query("DELETE FROM projects WHERE id = $1", [id]);
  }
  const userIds = createdUserIds.splice(0);
  if (userIds.length > 0) {
    await pool.query(`DELETE FROM users WHERE id = ANY($1::bigint[])`, [
      userIds,
    ]);
  }
  const roleIds = createdRoleIds.splice(0);
  if (roleIds.length > 0) {
    await pool.query(`DELETE FROM roles WHERE id = ANY($1::bigint[])`, [
      roleIds,
    ]);
  }
});

describe("custom roles", () => {
  it("lists built-in roles and refuses to delete Admin", async () => {
    const listed = await invoke(LIST_ROLES, { path: "/api/v1/roles" });
    expect(listed.status).toBe(200);
    const body = roleListResponseSchema.parse(listed.json);
    const admin = body.items.find((role) => role.slug === "admin");
    expect(admin?.locked).toBe(true);

    const del = await invoke(DELETE_ROLE, {
      method: "DELETE",
      path: `/api/v1/roles/${admin!.id}`,
      params: { id: String(admin!.id) },
    });
    expect(del.status).toBe(409);
    expect(errorBodySchema.parse(del.json).error.code).toBe("ROLE_LOCKED");
  });

  it("creates a custom role, assigns it, and enforces its permissions", async () => {
    const created = await invoke(POST_ROLE, {
      method: "POST",
      path: "/api/v1/roles",
      body: {
        name: uniqueName("Author"),
        description: "Write cases only",
        permissions: ["cases.write"],
      },
    });
    expect(created.status).toBe(201);
    const role = roleSchema.parse(created.json);
    createdRoleIds.push(role.id);
    expect(role.locked).toBe(false);
    expect(role.builtIn).toBe(false);
    expect(role.permissions).toEqual(["cases.write"]);

    const password = "temporary-password";
    const userRes = await invoke(POST_USER, {
      method: "POST",
      path: "/api/v1/users",
      body: {
        email: uniqueEmail("author"),
        displayName: "Custom author",
        role: role.slug,
        password,
      },
    });
    expect(userRes.status).toBe(201);
    const assigned = userSchema.parse(userRes.json);
    createdUserIds.push(assigned.id);
    expect(assigned.role).toBe(role.slug);
    expect(assigned.permissions).toEqual(["cases.write"]);

    const session = await loginAs(assigned.email, password);
    const projectRes = await invoke(POST_PROJECT, {
      method: "POST",
      path: "/api/v1/projects",
      body: { name: uniqueName("Locked"), prefix: uniquePrefix("R") },
      cookie: session.cookie,
    });
    expect(projectRes.status).toBe(403);

    const adminProject = await invoke(POST_PROJECT, {
      method: "POST",
      path: "/api/v1/projects",
      body: { name: uniqueName("Open"), prefix: uniquePrefix("R") },
    });
    expect(adminProject.status).toBe(201);
    const project = projectSchema.parse(adminProject.json);
    projectIds.push(project.id);

    const caseRes = await invoke(POST_CASE, {
      method: "POST",
      path: "/api/v1/test-cases",
      body: { projectId: project.id, title: "Custom author case" },
      cookie: session.cookie,
    });
    expect(caseRes.status).toBe(201);
    expect(testCaseSchema.parse(caseRes.json).title).toBe("Custom author case");
  });

  it("refuses to delete a role that still has users", async () => {
    const created = await invoke(POST_ROLE, {
      method: "POST",
      path: "/api/v1/roles",
      body: { name: uniqueName("Temp"), permissions: [] },
    });
    const role = roleSchema.parse(created.json);
    createdRoleIds.push(role.id);

    const userRes = await invoke(POST_USER, {
      method: "POST",
      path: "/api/v1/users",
      body: {
        email: uniqueEmail("temp"),
        displayName: "Temp user",
        role: role.slug,
        password: "temporary-password",
      },
    });
    createdUserIds.push(userSchema.parse(userRes.json).id);

    const del = await invoke(DELETE_ROLE, {
      method: "DELETE",
      path: `/api/v1/roles/${role.id}`,
      params: { id: String(role.id) },
    });
    expect(del.status).toBe(409);
    expect(errorBodySchema.parse(del.json).error.code).toBe("ROLE_IN_USE");
  });
});
