import {
  bulkCountResponseSchema,
  directoryDeleteResponseSchema,
  directorySchema,
  errorBodySchema,
  projectListResponseSchema,
  projectSchema,
  projectTreeSchema,
  testCaseListResponseSchema,
  testCaseSchema,
  type BulkFilter,
  type BulkSelectionWithProject,
  type CreateDirectoryBody,
  type CreateProjectBody,
  type CreateTestCaseBody,
  type Directory,
  type DirectoryDeleteMode,
  type DirectoryDeleteResponse,
  type MoveTestCaseBody,
  type PatchDirectoryBody,
  type PatchProjectBody,
  type Project,
  type ProjectListResponse,
  type ProjectTree,
  type PutTestCaseBody,
  type TestCase,
  type TestCaseListResponse,
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

async function parseJson<T>(
  response: Response,
  schema: z.ZodType<T>,
): Promise<T> {
  const body: unknown = await response.json();
  if (!response.ok) {
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

export async function listProjects(): Promise<ProjectListResponse> {
  const response = await fetch(`${API_BASE}/projects`);
  return parseJson(response, projectListResponseSchema);
}

export async function createProject(body: CreateProjectBody): Promise<Project> {
  const response = await fetch(`${API_BASE}/projects`, {
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
  const response = await fetch(`${API_BASE}/projects/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(response, projectSchema);
}

export async function getProjectTree(projectId: number): Promise<ProjectTree> {
  const response = await fetch(`${API_BASE}/projects/${projectId}/tree`);
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

  const response = await fetch(`${API_BASE}/test-cases?${search.toString()}`);
  return parseJson(response, testCaseListResponseSchema);
}

export async function getTestCaseByDisplayNumber(
  displayNumber: string,
): Promise<TestCase> {
  const response = await fetch(
    `${API_BASE}/test-cases/number/${encodeURIComponent(displayNumber)}`,
  );
  return parseJson(response, testCaseSchema);
}

export async function createTestCase(
  body: CreateTestCaseBody,
): Promise<TestCase> {
  const response = await fetch(`${API_BASE}/test-cases`, {
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
  const response = await fetch(`${API_BASE}/test-cases/${id}`, {
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
  const response = await fetch(`${API_BASE}/test-cases/${id}/move`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(response, testCaseSchema);
}

export async function deleteTestCase(id: number): Promise<TestCase> {
  const response = await fetch(`${API_BASE}/test-cases/${id}`, {
    method: "DELETE",
  });
  return parseJson(response, testCaseSchema);
}

export async function createDirectory(
  body: CreateDirectoryBody,
): Promise<Directory> {
  const response = await fetch(`${API_BASE}/directories`, {
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
  const response = await fetch(`${API_BASE}/directories/${id}`, {
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
  const response = await fetch(`${API_BASE}/directories/${id}${search}`, {
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
  const response = await fetch(
    `${API_BASE}/projects/${params.projectId}/trash${query ? `?${query}` : ""}`,
  );
  return parseJson(response, testCaseListResponseSchema);
}

export async function restoreTestCase(id: number): Promise<TestCase> {
  const response = await fetch(`${API_BASE}/test-cases/${id}/restore`, {
    method: "POST",
  });
  return parseJson(response, testCaseSchema);
}

export async function permanentlyDeleteTestCase(id: number): Promise<void> {
  const response = await fetch(`${API_BASE}/test-cases/${id}/permanent`, {
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
  const response = await fetch(`${API_BASE}/test-cases/bulk-trash`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(response, bulkCountResponseSchema);
}

export async function bulkRestore(
  body: BulkSelectionWithProject,
): Promise<{ count: number }> {
  const response = await fetch(`${API_BASE}/test-cases/bulk-restore`, {
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
  const response = await fetch(`${API_BASE}/projects/${projectId}/trash/purge`, {
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
