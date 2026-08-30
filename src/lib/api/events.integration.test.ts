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
import { GET as GET_EVENTS } from "@/app/api/v1/test-cases/[id]/events/route";
import { POST as REVERT } from "@/app/api/v1/test-cases/[id]/revert/route";
import {
  DELETE as SOFT_DELETE,
  GET as GET_BY_ID,
  PUT,
} from "@/app/api/v1/test-cases/[id]/route";
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
  revertTestCaseResponseSchema,
  testCaseEventListResponseSchema,
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

async function listEvents(testCaseId: number, cookie?: string, limit?: number) {
  const query = limit === undefined ? "" : `?limit=${limit}`;
  const result = await invoke(GET_EVENTS, {
    path: `/api/v1/test-cases/${testCaseId}/events${query}`,
    params: { id: String(testCaseId) },
    cookie,
  });
  return result;
}

describe("A3-2 list events + revert", () => {
  it("binding: mutate A→B→C, revert to A; GET events snapshots equal A,B,C,A and A–C rows unchanged", async () => {
    const project = await createProject();
    const dir = await createDir(project.id, "Login");
    const created = await createCase(
      project.id,
      "Login with valid credentials",
      {
        directoryId: dir.id,
        description: "Happy-path login for a verified shopper.",
        steps: [
          {
            action: "Open `/login`.",
            expectedResult: "The email and password fields are empty.",
          },
          { action: "Submit valid credentials.", expectedResult: null },
        ],
      },
    );
    const snapshotA = snapshotOf(created);

    const putB = await invoke(PUT, {
      method: "PUT",
      path: `/api/v1/test-cases/${created.id}`,
      params: { id: String(created.id) },
      body: {
        title: "Login with valid credentials — shopper",
        description: created.description,
        directoryId: dir.id,
        steps: created.steps.map((step) => ({
          action: step.action,
          expectedResult: step.expectedResult,
        })),
      },
    });
    expect(putB.status).toBe(200);
    const caseB = testCaseSchema.parse(putB.json);
    const snapshotB = snapshotOf(caseB);

    const putC = await invoke(PUT, {
      method: "PUT",
      path: `/api/v1/test-cases/${created.id}`,
      params: { id: String(created.id) },
      body: {
        title: caseB.title,
        description:
          "Second edit: shopper login after the title change. Revert target is still the original created snapshot.",
        directoryId: dir.id,
        steps: [
          {
            action: "Open `/login`.",
            expectedResult: "Login form is shown.",
          },
          { action: "Submit valid credentials.", expectedResult: null },
          {
            action: "Land on `/dashboard`.",
            expectedResult: "Header shows the shopper.",
          },
        ],
      },
    });
    expect(putC.status).toBe(200);
    const caseC = testCaseSchema.parse(putC.json);
    const snapshotC = snapshotOf(caseC);

    const listedBefore = await listEvents(created.id);
    expect(listedBefore.status).toBe(200);
    const before = testCaseEventListResponseSchema.parse(listedBefore.json);
    expect(before.items).toHaveLength(3);
    expect(before.items.map((item) => item.snapshot)).toEqual([
      snapshotC,
      snapshotB,
      snapshotA,
    ]);
    const frozenNewestFirst = structuredClone(before.items);
    const eventA = frozenNewestFirst[2]!;
    const eventB = frozenNewestFirst[1]!;
    const eventC = frozenNewestFirst[0]!;

    const reverted = await invoke(REVERT, {
      method: "POST",
      path: `/api/v1/test-cases/${created.id}/revert`,
      params: { id: String(created.id) },
      body: { eventId: eventA.id },
    });
    expect(reverted.status).toBe(201);
    expect(reverted.headers.get("Location")).toBe(
      `/api/v1/test-cases/${created.id}`,
    );
    const revertBody = revertTestCaseResponseSchema.parse(reverted.json);
    expect(revertBody.event.action).toBe("reverted");
    expect(revertBody.event.revertedEventId).toBe(eventA.id);
    expect(revertBody.event.snapshot).toEqual(snapshotA);
    expect(snapshotOf(revertBody.case)).toEqual(snapshotA);

    const listedAfter = await listEvents(created.id);
    expect(listedAfter.status).toBe(200);
    const after = testCaseEventListResponseSchema.parse(listedAfter.json);
    expect(after.items).toHaveLength(4);
    expect(after.items[0]).toEqual(revertBody.event);
    expect(after.items[1]).toEqual(eventC);
    expect(after.items[2]).toEqual(eventB);
    expect(after.items[3]).toEqual(eventA);
    expect(after.items.map((item) => item.snapshot)).toEqual([
      snapshotA,
      snapshotC,
      snapshotB,
      snapshotA,
    ]);

    const current = await invoke(GET_BY_ID, {
      path: `/api/v1/test-cases/${created.id}`,
      params: { id: String(created.id) },
    });
    expect(current.status).toBe(200);
    expect(snapshotOf(testCaseSchema.parse(current.json))).toEqual(snapshotA);
  });

  it("returns 404 for an unknown eventId and 409 when the event belongs to another case", async () => {
    const project = await createProject();
    const first = await createCase(project.id, "Case one");
    const second = await createCase(project.id, "Case two");
    const secondEvents = testCaseEventListResponseSchema.parse(
      (await listEvents(second.id)).json,
    );

    const missing = await invoke(REVERT, {
      method: "POST",
      path: `/api/v1/test-cases/${first.id}/revert`,
      params: { id: String(first.id) },
      body: { eventId: 999_999_999 },
    });
    expect(missing.status).toBe(404);
    expect(errorBodySchema.parse(missing.json).error.code).toBe("NOT_FOUND");

    const wrongCase = await invoke(REVERT, {
      method: "POST",
      path: `/api/v1/test-cases/${first.id}/revert`,
      params: { id: String(first.id) },
      body: { eventId: secondEvents.items[0].id },
    });
    expect(wrongCase.status).toBe(409);
    const conflict = errorBodySchema.parse(wrongCase.json);
    expect(conflict.error.code).toBe("CONFLICT");
    expect(conflict.error.message).toBe(
      `Event ${secondEvents.items[0].id} does not belong to test case ${first.id}.`,
    );
  });

  it("returns 403 FORBIDDEN when a Viewer tries to revert; Viewer can still read history", async () => {
    const project = await createProject();
    const created = await createCase(project.id, "Viewer readable");
    const viewer = await createRole("viewer");
    const listed = await listEvents(created.id, viewer.cookie);
    expect(listed.status).toBe(200);
    const events = testCaseEventListResponseSchema.parse(listed.json);

    const result = await invoke(REVERT, {
      method: "POST",
      path: `/api/v1/test-cases/${created.id}/revert`,
      params: { id: String(created.id) },
      body: { eventId: events.items[0].id },
      cookie: viewer.cookie,
    });
    expect(result.status).toBe(403);
    expect(errorBodySchema.parse(result.json).error.code).toBe("FORBIDDEN");
  });

  it("allows reverting a revert (restore B after A→B→C→A)", async () => {
    const project = await createProject();
    const created = await createCase(project.id, "State A");
    const snapshotA = snapshotOf(created);

    const putB = await invoke(PUT, {
      method: "PUT",
      path: `/api/v1/test-cases/${created.id}`,
      params: { id: String(created.id) },
      body: {
        title: "State B",
        description: null,
        directoryId: null,
        steps: [{ action: "B step", expectedResult: null }],
      },
    });
    const snapshotB = snapshotOf(testCaseSchema.parse(putB.json));

    await invoke(PUT, {
      method: "PUT",
      path: `/api/v1/test-cases/${created.id}`,
      params: { id: String(created.id) },
      body: {
        title: "State C",
        description: null,
        directoryId: null,
        steps: [{ action: "C step", expectedResult: null }],
      },
    });

    const before = testCaseEventListResponseSchema.parse(
      (await listEvents(created.id)).json,
    );
    await invoke(REVERT, {
      method: "POST",
      path: `/api/v1/test-cases/${created.id}/revert`,
      params: { id: String(created.id) },
      body: { eventId: before.items[2].id },
    });

    const afterFirstRevert = testCaseEventListResponseSchema.parse(
      (await listEvents(created.id)).json,
    );
    expect(afterFirstRevert.items.map((item) => item.snapshot)).toEqual([
      snapshotA,
      afterFirstRevert.items[1]!.snapshot,
      snapshotB,
      snapshotA,
    ]);

    const second = await invoke(REVERT, {
      method: "POST",
      path: `/api/v1/test-cases/${created.id}/revert`,
      params: { id: String(created.id) },
      body: { eventId: before.items[1].id },
    });
    expect(second.status).toBe(201);
    const secondBody = revertTestCaseResponseSchema.parse(second.json);
    expect(secondBody.event.action).toBe("reverted");
    expect(secondBody.event.revertedEventId).toBe(before.items[1].id);
    expect(secondBody.event.snapshot).toEqual(snapshotB);
    expect(snapshotOf(secondBody.case)).toEqual(snapshotB);

    const timeline = testCaseEventListResponseSchema.parse(
      (await listEvents(created.id)).json,
    );
    expect(timeline.items).toHaveLength(5);
    expect(timeline.items[0].snapshot).toEqual(snapshotB);
    expect(timeline.items[0].action).toBe("reverted");
  });

  it("returns the most recent limit events newest-first; 404s unknown cases; 401 without a session", async () => {
    const project = await createProject();
    const created = await createCase(project.id, "Limit A");
    await invoke(PUT, {
      method: "PUT",
      path: `/api/v1/test-cases/${created.id}`,
      params: { id: String(created.id) },
      body: {
        title: "Limit B",
        description: null,
        directoryId: null,
        steps: [],
      },
    });
    await invoke(PUT, {
      method: "PUT",
      path: `/api/v1/test-cases/${created.id}`,
      params: { id: String(created.id) },
      body: {
        title: "Limit C",
        description: null,
        directoryId: null,
        steps: [],
      },
    });

    const windowed = await listEvents(created.id, undefined, 2);
    expect(windowed.status).toBe(200);
    const body = testCaseEventListResponseSchema.parse(windowed.json);
    expect(body.items).toHaveLength(2);
    expect(body.items.map((item) => item.snapshot.title)).toEqual([
      "Limit C",
      "Limit B",
    ]);
    expect(body.items[0].createdAt >= body.items[1].createdAt).toBe(true);

    const missing = await listEvents(999_999_999);
    expect(missing.status).toBe(404);

    const anon = await invoke(GET_EVENTS, {
      path: `/api/v1/test-cases/${created.id}/events`,
      params: { id: String(created.id) },
      unauthenticated: true,
    });
    expect(anon.status).toBe(401);
    expect(errorBodySchema.parse(anon.json).error.code).toBe("UNAUTHENTICATED");
  });
});
