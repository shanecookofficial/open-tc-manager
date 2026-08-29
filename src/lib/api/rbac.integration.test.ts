import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { GET as CATCH_ALL } from "@/app/api/v1/[...path]/route";
import { GET as HEALTH } from "@/app/api/v1/health/route";
import { POST as PURGE } from "@/app/api/v1/projects/[id]/trash/purge/route";
import {
  GET as LIST_PROJECTS,
  POST as POST_PROJECT,
} from "@/app/api/v1/projects/route";
import { POST as POST_CASE } from "@/app/api/v1/test-cases/route";
import { DELETE as PERMANENT } from "@/app/api/v1/test-cases/[id]/permanent/route";
import { DELETE as SOFT_DELETE } from "@/app/api/v1/test-cases/[id]/route";
import { GET as LIST_USERS, POST as POST_USER } from "@/app/api/v1/users/route";
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
  healthResponseSchema,
  projectSchema,
  testCaseSchema,
  userSchema,
} from "@/lib/contracts";
import { pool } from "@/lib/db";

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
});

async function createRole(
  role: "member" | "viewer",
  password = "temporary-password",
) {
  const result = await invoke(POST_USER, {
    method: "POST",
    path: "/api/v1/users",
    body: {
      email: uniqueEmail(role),
      displayName: `${role} rbac`,
      role,
      password,
    },
  });
  expect(result.status).toBe(201);
  const user = userSchema.parse(result.json);
  createdUserIds.push(user.id);
  const session = await loginAs(user.email, password);
  return { user, password, cookie: session.cookie };
}

async function createProject() {
  const result = await invoke(POST_PROJECT, {
    method: "POST",
    path: "/api/v1/projects",
    body: { name: uniqueName("Rbac"), prefix: uniquePrefix("R") },
  });
  expect(result.status).toBe(201);
  const project = projectSchema.parse(result.json);
  projectIds.push(project.id);
  return project;
}

describe("RBAC wrapper", () => {
  it("keeps GET /health public", async () => {
    const result = await invoke(HEALTH, {
      path: "/api/v1/health",
      unauthenticated: true,
    });
    expect(result.status).toBe(200);
    expect(healthResponseSchema.parse(result.json).status).toBe("ok");
  });

  it("returns 401 UNAUTHENTICATED on protected routes and unknown paths without a session", async () => {
    const projects = await invoke(LIST_PROJECTS, {
      path: "/api/v1/projects",
      unauthenticated: true,
    });
    expect(projects.status).toBe(401);
    expect(errorBodySchema.parse(projects.json).error.code).toBe(
      "UNAUTHENTICATED",
    );

    const unknown = await invoke(CATCH_ALL, {
      path: "/api/v1/definitely-not-a-route",
      unauthenticated: true,
    });
    expect(unknown.status).toBe(401);
    expect(errorBodySchema.parse(unknown.json).error.code).toBe(
      "UNAUTHENTICATED",
    );
  });

  it("lets a Viewer read but returns 403 on POST case", async () => {
    const project = await createProject();
    const viewer = await createRole("viewer");

    const listed = await invoke(LIST_PROJECTS, {
      path: "/api/v1/projects",
      cookie: viewer.cookie,
    });
    expect(listed.status).toBe(200);

    const created = await invoke(POST_CASE, {
      method: "POST",
      path: "/api/v1/test-cases",
      cookie: viewer.cookie,
      body: { projectId: project.id, title: "Viewer cannot write" },
    });
    expect(created.status).toBe(403);
    expect(errorBodySchema.parse(created.json).error.code).toBe("FORBIDDEN");
  });

  it("lets a Member create a case but 403s on purge, permanent delete, and POST /users", async () => {
    const project = await createProject();
    const member = await createRole("member");

    const created = await invoke(POST_CASE, {
      method: "POST",
      path: "/api/v1/test-cases",
      cookie: member.cookie,
      body: { projectId: project.id, title: "Member can write" },
    });
    expect(created.status).toBe(201);
    const testCase = testCaseSchema.parse(created.json);

    const trashed = await invoke(SOFT_DELETE, {
      method: "DELETE",
      path: `/api/v1/test-cases/${testCase.id}`,
      params: { id: String(testCase.id) },
      cookie: member.cookie,
    });
    expect(trashed.status).toBe(200);

    const purge = await invoke(PURGE, {
      method: "POST",
      path: `/api/v1/projects/${project.id}/trash/purge`,
      params: { id: String(project.id) },
      cookie: member.cookie,
      body: { ids: [testCase.id] },
    });
    expect(purge.status).toBe(403);
    expect(errorBodySchema.parse(purge.json).error.code).toBe("FORBIDDEN");

    const permanent = await invoke(PERMANENT, {
      method: "DELETE",
      path: `/api/v1/test-cases/${testCase.id}/permanent`,
      params: { id: String(testCase.id) },
      cookie: member.cookie,
    });
    expect(permanent.status).toBe(403);

    const createUser = await invoke(POST_USER, {
      method: "POST",
      path: "/api/v1/users",
      cookie: member.cookie,
      body: {
        email: uniqueEmail("member-create"),
        displayName: "Nope",
        role: "viewer",
        password: "temporary-password",
      },
    });
    expect(createUser.status).toBe(403);

    const listUsers = await invoke(LIST_USERS, {
      path: "/api/v1/users",
      cookie: member.cookie,
    });
    expect(listUsers.status).toBe(403);
  });

  it("lets a Member POST a project only if Admin — Member 403 on POST /projects", async () => {
    const member = await createRole("member");
    const result = await invoke(POST_PROJECT, {
      method: "POST",
      path: "/api/v1/projects",
      cookie: member.cookie,
      body: { name: uniqueName("MemberProj"), prefix: uniquePrefix("M") },
    });
    expect(result.status).toBe(403);
    expect(errorBodySchema.parse(result.json).error.code).toBe("FORBIDDEN");
  });
});
