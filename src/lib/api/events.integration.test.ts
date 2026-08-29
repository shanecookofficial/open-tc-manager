import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";

import { PATCH as PATCH_USER } from "@/app/api/v1/users/[id]/route";
import { POST as POST_USER } from "@/app/api/v1/users/route";
import { DELETE as DELETE_DIRECTORY } from "@/app/api/v1/directories/[id]/route";
import { POST as POST_DIRECTORY } from "@/app/api/v1/directories/route";
import { POST as POST_PROJECT } from "@/app/api/v1/projects/route";
import { POST as BULK_RESTORE } from "@/app/api/v1/test-cases/bulk-restore/route";
import { POST as BULK_TRASH } from "@/app/api/v1/test-cases/bulk-trash/route";
import { PATCH as PATCH_MOVE } from "@/app/api/v1/test-cases/[id]/move/route";
import { POST as RESTORE } from "@/app/api/v1/test-cases/[id]/restore/route";
import { DELETE as SOFT_DELETE, PUT } from "@/app/api/v1/test-cases/[id]/route";
import { POST as POST_CASE } from "@/app/api/v1/test-cases/route";
import {
  authenticateAsTestAdmin,
  invoke,
  loginAs,
  uniqueEmail,
  uniqueName,
  uniquePrefix,
} from "@/lib/api/test-helpers";
import type { CaseEventSnapshot, TestCase, User } from "@/lib/contracts";
import {
  caseEventSnapshotSchema,
  directorySchema,
  errorBodySchema,
  projectSchema,
  testCaseSchema,
  userSchema,
} from "@/lib/contracts";
import { db, pool, testCaseEvents } from "@/lib/db";

const projectIds: number[] = [];
const createdUserIds: number[] = [];
let admin: User;

beforeAll(async () => {
  const session = await authenticateAsTestAdmin();
  admin = session.user;
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

function snapshotOf(testCase: TestCase): CaseEventSnapshot {
  return caseEventSnapshotSchema.parse({
    title: testCase.title,
    description: testCase.description,
    directoryId: testCase.directoryId,
    steps: testCase.steps.map((step) => ({
      action: step.action,
      expectedResult: step.expectedResult,
    })),
    deletedAt: testCase.deletedAt,
  });
}

async function eventsFor(testCaseId: number) {
  return db
    .select()
    .from(testCaseEvents)
    .where(eq(testCaseEvents.testCaseId, testCaseId))
    .orderBy(asc(testCaseEvents.id));
}

async function createProject() {
  const result = await invoke(POST_PROJECT, {
    method: "POST",
    path: "/api/v1/projects",
    body: { name: uniqueName("History"), prefix: uniquePrefix("H") },
  });
  expect(result.status).toBe(201);
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
    cookie?: string;
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
    cookie: extra.cookie,
  });
  expect(result.status).toBe(201);
  return testCaseSchema.parse(result.json);
}

async function createRole(role: "member" | "viewer") {
  const password = "temporary-password";
  const result = await invoke(POST_USER, {
    method: "POST",
    path: "/api/v1/users",
    body: {
      email: uniqueEmail(role),
      displayName: `${role} historian`,
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

describe("A3-1 history event writes", () => {
  it("inserts one created event whose snapshot matches the new case", async () => {
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

    const rows = await eventsFor(created.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("created");
    expect(rows[0].revertedEventId).toBeNull();
    expect(rows[0].actorId).toBe(admin.id);
    expect(rows[0].actorEmail).toBe(admin.email);
    expect(rows[0].actorDisplayName).toBe(admin.displayName);
    expect(rows[0].snapshot).toEqual(snapshotOf(created));
  });

  it("records PUT as updated and move as moved", async () => {
    const project = await createProject();
    const from = await createDir(project.id, "From");
    const to = await createDir(project.id, "To");
    const created = await createCase(project.id, "Original title", {
      directoryId: from.id,
      steps: [{ action: "Step one", expectedResult: null }],
    });

    const put = await invoke(PUT, {
      method: "PUT",
      path: `/api/v1/test-cases/${created.id}`,
      params: { id: String(created.id) },
      body: {
        title: "Edited title",
        description: "New description.",
        directoryId: from.id,
        steps: [
          { action: "Step one", expectedResult: "Still works." },
          { action: "Step two", expectedResult: null },
        ],
      },
    });
    expect(put.status).toBe(200);
    const updated = testCaseSchema.parse(put.json);

    const moved = await invoke(PATCH_MOVE, {
      method: "PATCH",
      path: `/api/v1/test-cases/${created.id}/move`,
      params: { id: String(created.id) },
      body: { directoryId: to.id },
    });
    expect(moved.status).toBe(200);
    const afterMove = testCaseSchema.parse(moved.json);

    const rows = await eventsFor(created.id);
    expect(rows.map((row) => row.action)).toEqual([
      "created",
      "updated",
      "moved",
    ]);
    expect(rows[1].snapshot).toEqual(snapshotOf(updated));
    expect(rows[2].snapshot).toEqual(snapshotOf(afterMove));
    expect(rows[2].snapshot.directoryId).toBe(to.id);
  });

  it("records trash and restore, and does not write on a failed second trash", async () => {
    const project = await createProject();
    const created = await createCase(project.id, "Soon trashed");

    const trashedRes = await invoke(SOFT_DELETE, {
      method: "DELETE",
      path: `/api/v1/test-cases/${created.id}`,
      params: { id: String(created.id) },
    });
    expect(trashedRes.status).toBe(200);
    const trashed = testCaseSchema.parse(trashedRes.json);
    expect(trashed.deletedAt).not.toBeNull();

    const restoredRes = await invoke(RESTORE, {
      method: "POST",
      path: `/api/v1/test-cases/${created.id}/restore`,
      params: { id: String(created.id) },
    });
    expect(restoredRes.status).toBe(200);
    const restored = testCaseSchema.parse(restoredRes.json);
    expect(restored.deletedAt).toBeNull();

    const again = await invoke(SOFT_DELETE, {
      method: "DELETE",
      path: `/api/v1/test-cases/${created.id}`,
      params: { id: String(created.id) },
    });
    expect(again.status).toBe(200);

    const conflict = await invoke(SOFT_DELETE, {
      method: "DELETE",
      path: `/api/v1/test-cases/${created.id}`,
      params: { id: String(created.id) },
    });
    expect(conflict.status).toBe(409);
    expect(errorBodySchema.parse(conflict.json).error.code).toBe(
      "CASE_ALREADY_TRASHED",
    );

    const rows = await eventsFor(created.id);
    expect(rows.map((row) => row.action)).toEqual([
      "created",
      "trashed",
      "restored",
      "trashed",
    ]);
    expect(rows[1].snapshot).toEqual(snapshotOf(trashed));
    expect(rows[1].snapshot.deletedAt).toBe(trashed.deletedAt);
    expect(rows[2].snapshot).toEqual(snapshotOf(restored));
    expect(rows[2].snapshot.deletedAt).toBeNull();
  });

  it("writes N trashed events for bulk trash and N restored events for bulk restore", async () => {
    const project = await createProject();
    const a = await createCase(project.id, "Bulk A");
    const b = await createCase(project.id, "Bulk B");
    const c = await createCase(project.id, "Bulk C");

    const trash = await invoke(BULK_TRASH, {
      method: "POST",
      path: "/api/v1/test-cases/bulk-trash",
      body: { projectId: project.id, ids: [a.id, b.id, c.id] },
    });
    expect(trash.status).toBe(200);
    expect(trash.json).toEqual({ count: 3 });

    for (const id of [a.id, b.id, c.id]) {
      const rows = await eventsFor(id);
      expect(rows.map((row) => row.action)).toEqual(["created", "trashed"]);
      expect(rows[1].snapshot.deletedAt).not.toBeNull();
    }

    const restore = await invoke(BULK_RESTORE, {
      method: "POST",
      path: "/api/v1/test-cases/bulk-restore",
      body: { projectId: project.id, ids: [a.id, b.id, c.id] },
    });
    expect(restore.status).toBe(200);
    expect(restore.json).toEqual({ count: 3 });

    for (const id of [a.id, b.id, c.id]) {
      const rows = await eventsFor(id);
      expect(rows.map((row) => row.action)).toEqual([
        "created",
        "trashed",
        "restored",
      ]);
      expect(rows[2].snapshot.deletedAt).toBeNull();
    }
  });

  it("does not write events when bulk trash fails atomically", async () => {
    const project = await createProject();
    const active = await createCase(project.id, "Stays active");
    const already = await createCase(project.id, "Already trashed");
    await invoke(SOFT_DELETE, {
      method: "DELETE",
      path: `/api/v1/test-cases/${already.id}`,
      params: { id: String(already.id) },
    });

    const beforeActive = await eventsFor(active.id);
    const beforeAlready = await eventsFor(already.id);

    const result = await invoke(BULK_TRASH, {
      method: "POST",
      path: "/api/v1/test-cases/bulk-trash",
      body: { projectId: project.id, ids: [active.id, already.id] },
    });
    expect(result.status).toBe(409);

    expect(await eventsFor(active.id)).toEqual(beforeActive);
    expect(await eventsFor(already.id)).toEqual(beforeAlready);
  });

  it("records Member actor fields and keeps them after a later rename; Viewer cannot write", async () => {
    const project = await createProject();
    const member = await createRole("member");
    const viewer = await createRole("viewer");

    const created = await createCase(project.id, "Member-authored", {
      cookie: member.cookie,
    });
    const rows = await eventsFor(created.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].actorId).toBe(member.user.id);
    expect(rows[0].actorEmail).toBe(member.user.email);
    expect(rows[0].actorDisplayName).toBe(member.user.displayName);

    const renamed = await invoke(PATCH_USER, {
      method: "PATCH",
      path: `/api/v1/users/${member.user.id}`,
      params: { id: String(member.user.id) },
      body: { displayName: "Renamed Member" },
    });
    expect(renamed.status).toBe(200);
    expect(userSchema.parse(renamed.json).displayName).toBe("Renamed Member");

    const afterRename = await eventsFor(created.id);
    expect(afterRename[0].actorDisplayName).toBe(member.user.displayName);
    expect(afterRename[0].actorEmail).toBe(member.user.email);

    const forbidden = await invoke(POST_CASE, {
      method: "POST",
      path: "/api/v1/test-cases",
      body: { projectId: project.id, title: "Viewer cannot create" },
      cookie: viewer.cookie,
    });
    expect(forbidden.status).toBe(403);
    expect(errorBodySchema.parse(forbidden.json).error.code).toBe("FORBIDDEN");
  });

  it("records a trashed event per case when a directory is deleted with trash_contents", async () => {
    const project = await createProject();
    const dir = await createDir(project.id, "Doomed");
    const a = await createCase(project.id, "In folder A", {
      directoryId: dir.id,
    });
    const b = await createCase(project.id, "In folder B", {
      directoryId: dir.id,
    });

    const deleted = await invoke(DELETE_DIRECTORY, {
      method: "DELETE",
      path: `/api/v1/directories/${dir.id}?mode=trash_contents`,
      params: { id: String(dir.id) },
    });
    expect(deleted.status).toBe(200);

    for (const id of [a.id, b.id]) {
      const rows = await eventsFor(id);
      expect(rows.map((row) => row.action)).toEqual(["created", "trashed"]);
      expect(rows[1].snapshot.deletedAt).not.toBeNull();
      expect(rows[1].snapshot.directoryId).toBeNull();
    }
  });
});
