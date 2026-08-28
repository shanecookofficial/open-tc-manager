import type { APIRequestContext } from "@playwright/test";

export function uniquePrefix(letter: string) {
  const suffix = Date.now().toString(36).slice(-4).toUpperCase();
  return `${letter}${suffix}`.slice(0, 10);
}

export async function findProjectIdByPrefix(
  request: APIRequestContext,
  prefix: string,
): Promise<number | undefined> {
  const response = await request.get("/api/v1/projects");
  const body = (await response.json()) as {
    items: { id: number; prefix: string }[];
  };
  return body.items.find((project) => project.prefix === prefix)?.id;
}

/**
 * Best-effort teardown for e2e projects. Trash remaining active cases, purge
 * trash, then delete the empty project so a failed mid-run test does not leave
 * residue that poisons later reruns.
 */
export async function cleanupE2EProject(
  request: APIRequestContext,
  projectId: number | undefined,
) {
  if (projectId == null) return;
  await request.post("/api/v1/test-cases/bulk-trash", {
    data: { projectId, all: true },
  });
  await request.post(`/api/v1/projects/${projectId}/trash/purge`, {
    data: { all: true },
  });
  await request.delete(`/api/v1/projects/${projectId}`);
}

export async function cleanupE2EProjectByPrefix(
  request: APIRequestContext,
  prefix: string | undefined,
) {
  if (!prefix) return;
  const projectId = await findProjectIdByPrefix(request, prefix);
  await cleanupE2EProject(request, projectId);
}

/** Soft-delete then permanently delete a leftover case (e.g. on seeded WEB). */
export async function cleanupE2ECase(
  request: APIRequestContext,
  caseId: number | undefined,
) {
  if (caseId == null) return;
  await request.delete(`/api/v1/test-cases/${caseId}`);
  await request.delete(`/api/v1/test-cases/${caseId}/permanent`);
}
