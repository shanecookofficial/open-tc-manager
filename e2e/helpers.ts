import type { APIRequestContext, Page } from "@playwright/test";

/** Demo Admin seeded by `db:seed` or created via BOOTSTRAP on first boot. */
export const DEMO_ADMIN_EMAIL = "admin@opentcm.local";
export const DEMO_ADMIN_PASSWORD = "opentcm-admin";

/** Demo Member for role-specific e2e (seeded when users table was empty). */
export const DEMO_MEMBER_EMAIL = "member@opentcm.local";
export const DEMO_MEMBER_PASSWORD = "opentcm-member";

/** Demo Viewer for read-only e2e (seeded when users table was empty). */
export const DEMO_VIEWER_EMAIL = "viewer@opentcm.local";
export const DEMO_VIEWER_PASSWORD = "opentcm-viewer";

export function uniquePrefix(letter: string) {
  const suffix = Date.now().toString(36).slice(-4).toUpperCase();
  return `${letter}${suffix}`.slice(0, 10);
}

type LoginCredentials = {
  email: string;
  password: string;
};

const DEFAULT_ADMIN: LoginCredentials = {
  email: DEMO_ADMIN_EMAIL,
  password: DEMO_ADMIN_PASSWORD,
};

/**
 * API login — Playwright's `request` context stores the session cookie from
 * `Set-Cookie` for subsequent API calls in the same test.
 */
export async function loginViaApi(
  request: APIRequestContext,
  credentials: LoginCredentials = DEFAULT_ADMIN,
) {
  const response = await request.post("/api/v1/auth/login", {
    data: { email: credentials.email, password: credentials.password },
  });
  if (!response.ok()) {
    throw new Error(
      `API login failed for ${credentials.email}: HTTP ${response.status()}`,
    );
  }
}

export async function loginAsAdmin(request: APIRequestContext) {
  await loginViaApi(request, DEFAULT_ADMIN);
}

export async function loginAsMember(request: APIRequestContext) {
  await loginViaApi(request, {
    email: DEMO_MEMBER_EMAIL,
    password: DEMO_MEMBER_PASSWORD,
  });
}

export async function loginAsViewer(request: APIRequestContext) {
  await loginViaApi(request, {
    email: DEMO_VIEWER_EMAIL,
    password: DEMO_VIEWER_PASSWORD,
  });
}

/** Browser login via the `/login` form (sets the session cookie in the page). */
export async function loginViaPage(
  page: Page,
  credentials: LoginCredentials = DEFAULT_ADMIN,
  next?: string,
) {
  const loginPath = next
    ? `/login?next=${encodeURIComponent(next)}`
    : "/login";
  await page.goto(loginPath);
  await page.getByLabel("Email").fill(credentials.email);
  await page.getByLabel("Password").fill(credentials.password);
  await page.getByRole("button", { name: "Sign in" }).click();
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
