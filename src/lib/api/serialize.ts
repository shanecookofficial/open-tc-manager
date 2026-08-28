import type { Project as ProjectRow } from "@/lib/db/schema";
import type { Project } from "@/lib/contracts";

export function toIso(date: Date): string {
  return date.toISOString();
}

export function emptyToNull(value: string | null | undefined): string | null {
  if (value == null || value.length === 0) {
    return null;
  }
  return value;
}

export function displayNumber(prefix: string, caseNumber: number): string {
  return `${prefix}-${caseNumber}`;
}

export function serializeProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    nextCaseNumber: row.nextCaseNumber,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}
