import {
  bulkCountResponseSchema,
  directoryDeleteResponseSchema,
  directorySchema,
  errorBodySchema,
  loginBodySchema,
  projectListResponseSchema,
  projectSchema,
  projectTreeSchema,
  revertTestCaseResponseSchema,
  sessionUserResponseSchema,
  testCaseEventListResponseSchema,
  testCaseListResponseSchema,
  testCaseSchema,
  userListResponseSchema,
  userSchema,
  type BulkFilter,
  type BulkSelectionWithProject,
  type ChangePasswordBody,
  type CreateDirectoryBody,
  type CreateProjectBody,
  type CreateTestCaseBody,
  type CreateUserBody,
  type Directory,
  type DirectoryDeleteMode,
  type DirectoryDeleteResponse,
  type LoginBody,
  type MoveTestCaseBody,
  type PatchDirectoryBody,
  type PatchProjectBody,
  type PatchUserBody,
  type Project,
  type ProjectListResponse,
  type ProjectTree,
  type PutTestCaseBody,
  type RevertTestCaseBody,
  type TestCase,
  type TestCaseEventListResponse,
  type TestCaseListResponse,
  type User,
  type UserListResponse,
} from "@/lib/contracts";
import type { ErrorCode } from "@/lib/contracts";
import type { z } from "zod";

export class ApiClientError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, message: string, status: number) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
  }
}

function shouldRedirectOn401(url: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  if (url.includes("/auth/login")) {
    return false;
  }
  return !window.location.pathname.startsWith("/login");
}

async function parseJson<T>(
  response: Response,
  schema: z.ZodType<T>,
  requestUrl = "",
): Promise<T> {
  const body: unknown = await response.json();
  if (!response.ok) {
    if (response.status === 401 && shouldRedirectOn401(requestUrl)) {
      const next = encodeURIComponent(
        window.location.pathname + window.location.search,
      );
      window.location.href = `/login?next=${next}`;
    }
    const parsed = errorBodySchema.safeParse(body);
    if (parsed.success) {
      throw new ApiClientError(
        parsed.data.error.code,
        parsed.data.error.message,
        response.status,
      );
    }
    throw new ApiClientError(
      "INTERNAL_ERROR",
      "Unexpected server response",
      response.status,
    );
  }
  return schema.parse(body);
}

const API_BASE = "/api/v1";

async function apiFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
  });
}

export async function login(body: LoginBody): Promise<User> {
  loginBodySchema.parse(body);
  const response = await apiFetch("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await parseJson(response, sessionUserResponseSchema, "/auth/login");
  return data.user;
}

export async function logout(): Promise<void> {
  const response = await apiFetch("/auth/logout", { method: "POST" });
  if (!response.ok && response.status !== 204) {
    const body: unknown = await response.json();
    const parsed = errorBodySchema.safeParse(body);
    if (parsed.success) {
      throw new ApiClientError(
        parsed.data.error.code,
        parsed.data.error.message,
        response.status,
      );
    }
    throw new ApiClientError(
      "INTERNAL_ERROR",
      "Unexpected server response",
      response.status,
    );
  }
}

export async function getMe(): Promise<User> {
  const response = await apiFetch("/auth/me");
  const data = await parseJson(response, sessionUserResponseSchema, "/auth/me");
  return data.user;
}

export async function changePassword(body: ChangePasswordBody): Promise<void> {
  const response = await apiFetch("/auth/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok && response.status !== 204) {
    const bodyText: unknown = await response.json();
    const parsed = errorBodySchema.safeParse(bodyText);
    if (parsed.success) {
      throw new ApiClientError(
        parsed.data.error.code,
        parsed.data.error.message,
        response.status,
      );
    }
    throw new ApiClientError(
      "INTERNAL_ERROR",
      "Unexpected server response",
      response.status,
    );
  }
}

export async function listUsers(): Promise<UserListResponse> {
  const response = await apiFetch("/users");
  return parseJson(response, userListResponseSchema, "/users");
}

export async function createUser(body: CreateUserBody): Promise<User> {
  const response = await apiFetch("/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(response, userSchema, "/users");
}

export async function updateUser(
  id: number,
  body: PatchUserBody,
): Promise<User> {
  const response = await apiFetch(`/users/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(response, userSchema, `/users/${id}`);
}

export async function listCaseEvents(
  testCaseId: number,
): Promise<TestCaseEventListResponse> {
  const response = await apiFetch(`/test-cases/${testCaseId}/events`);
  return parseJson(
    response,
    testCaseEventListResponseSchema,
    `/test-cases/${testCaseId}/events`,
  );
}

export async function revertTestCase(
  testCaseId: number,
  body: RevertTestCaseBody,
): Promise<{ event: unknown; case: TestCase }> {
  const response = await apiFetch(`/test-cases/${testCaseId}/revert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(
    response,
    revertTestCaseResponseSchema,
    `/test-cases/${testCaseId}/revert`,
  );
}

export async function listProjects(): Promise<ProjectListResponse> {
  const response = await apiFetch("/projects");
  return parseJson(response, projectListResponseSchema, "/projects");
}

export async function createProject(body: CreateProjectBody): Promise<Project> {
  const response = await apiFetch("/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(response, projectSchema);
}

export async function updateProject(
  id: number,
  body: PatchProjectBody,
): Promise<Project> {
  const response = await apiFetch(`/projects/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(response, projectSchema);
}

export async function getProjectTree(projectId: number): Promise<ProjectTree> {
  const response = await apiFetch(`/projects/${projectId}/tree`);
  return parseJson(response, projectTreeSchema);
}

export type TestCaseListParams = {
  projectId: number;
  directoryId?: number | null;
  q?: string;
  page?: number;
  pageSize?: number;
};

export async function listTestCases(
  params: TestCaseListParams,
): Promise<TestCaseListResponse> {
  const search = new URLSearchParams();
  search.set("projectId", String(params.projectId));
  if (params.page) search.set("page", String(params.page));
  if (params.pageSize) search.set("pageSize", String(params.pageSize));
  if (params.q) search.set("q", params.q);
  if (params.directoryId === null) {
    search.set("directoryId", "");
  } else if (params.directoryId !== undefined) {
    search.set("directoryId", String(params.directoryId));
  }

  const response = await apiFetch(`/test-cases?${search.toString()}`);
  return parseJson(response, testCaseListResponseSchema);
}

export async function getTestCaseByDisplayNumber(
  displayNumber: string,
): Promise<TestCase> {
  const response = await apiFetch(
    `/test-cases/number/${encodeURIComponent(displayNumber)}`,
  );
  return parseJson(response, testCaseSchema);
}

export async function createTestCase(
  body: CreateTestCaseBody,
): Promise<TestCase> {
  const response = await apiFetch("/test-cases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(response, testCaseSchema);
}

export async function updateTestCase(
  id: number,
  body: PutTestCaseBody,
): Promise<TestCase> {
  const response = await apiFetch(`/test-cases/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(response, testCaseSchema);
}

export async function moveTestCase(
  id: number,
  body: MoveTestCaseBody,
): Promise<TestCase> {
  const response = await apiFetch(`/test-cases/${id}/move`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(response, testCaseSchema);
}

export async function deleteTestCase(id: number): Promise<TestCase> {
  const response = await apiFetch(`/test-cases/${id}`, {
    method: "DELETE",
  });
  return parseJson(response, testCaseSchema);
}

export async function createDirectory(
  body: CreateDirectoryBody,
): Promise<Directory> {
  const response = await apiFetch("/directories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(response, directorySchema);
}

export async function updateDirectory(
  id: number,
  body: PatchDirectoryBody,
): Promise<Directory> {
  const response = await apiFetch(`/directories/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(response, directorySchema);
}

export async function deleteDirectory(
  id: number,
  mode?: DirectoryDeleteMode,
): Promise<DirectoryDeleteResponse> {
  const search = mode ? `?mode=${mode}` : "";
  const response = await apiFetch(`/directories/${id}${search}`, {
    method: "DELETE",
  });
  return parseJson(response, directoryDeleteResponseSchema);
}

export type TrashListParams = {
  projectId: number;
  directoryId?: number | null;
  q?: string;
  page?: number;
  pageSize?: number;
};

export async function listTrash(
  params: TrashListParams,
): Promise<TestCaseListResponse> {
  const search = new URLSearchParams();
  if (params.page) search.set("page", String(params.page));
  if (params.pageSize) search.set("pageSize", String(params.pageSize));
  if (params.q) search.set("q", params.q);
  if (params.directoryId === null) {
    search.set("directoryId", "");
  } else if (params.directoryId !== undefined) {
    search.set("directoryId", String(params.directoryId));
  }

  const query = search.toString();
  const response = await apiFetch(
    `/projects/${params.projectId}/trash${query ? `?${query}` : ""}`,
  );
  return parseJson(response, testCaseListResponseSchema);
}

export async function restoreTestCase(id: number): Promise<TestCase> {
  const response = await apiFetch(`/test-cases/${id}/restore`, {
    method: "POST",
  });
  return parseJson(response, testCaseSchema);
}

export async function permanentlyDeleteTestCase(id: number): Promise<void> {
  const response = await apiFetch(`/test-cases/${id}/permanent`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const body: unknown = await response.json();
    const parsed = errorBodySchema.safeParse(body);
    if (parsed.success) {
      throw new ApiClientError(
        parsed.data.error.code,
        parsed.data.error.message,
        response.status,
      );
    }
    throw new ApiClientError(
      "INTERNAL_ERROR",
      "Unexpected server response",
      response.status,
    );
  }
}

export async function bulkTrash(
  body: BulkSelectionWithProject,
): Promise<{ count: number }> {
  const response = await apiFetch("/test-cases/bulk-trash", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(response, bulkCountResponseSchema);
}

export async function bulkRestore(
  body: BulkSelectionWithProject,
): Promise<{ count: number }> {
  const response = await apiFetch("/test-cases/bulk-restore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(response, bulkCountResponseSchema);
}

export async function purgeTrash(
  projectId: number,
  selection: { ids: number[] } | { all: true; filter?: BulkFilter },
): Promise<{ count: number }> {
  const response = await apiFetch(`/projects/${projectId}/trash/purge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(selection),
  });
  return parseJson(response, bulkCountResponseSchema);
}

/**
 * Spread into `{ all: true }` payloads. An empty filter is omitted so the
 * body matches the contract example `{ "all": true }` (whole project).
 */
export function optionalBulkFilter(
  filter: BulkFilter,
): { filter: BulkFilter } | Record<string, never> {
  return Object.keys(filter).length > 0 ? { filter } : {};
}

/** Split server validation messages on the first ": " for form field mapping. */
export function parseValidationFieldPath(message: string): {
  fieldPath: string;
  detail: string;
} {
  const separator = message.indexOf(": ");
  if (separator === -1) {
    return { fieldPath: "", detail: message };
  }
  return {
    fieldPath: message.slice(0, separator),
    detail: message.slice(separator + 2),
  };
}
