import {
  errorBodySchema,
  projectListResponseSchema,
  projectSchema,
  projectTreeSchema,
  testCaseListResponseSchema,
  type CreateProjectBody,
  type PatchProjectBody,
  type Project,
  type ProjectListResponse,
  type ProjectTree,
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
