import type { UserRole } from "@/lib/contracts";

const RANK: Record<UserRole, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
};

export function roleAtLeast(role: UserRole, minimum: UserRole): boolean {
  return RANK[role] >= RANK[minimum];
}

export function canWriteCases(role: UserRole): boolean {
  return roleAtLeast(role, "member");
}

export function canRevertCases(role: UserRole): boolean {
  return roleAtLeast(role, "member");
}

export function canManageDirectories(role: UserRole): boolean {
  return roleAtLeast(role, "member");
}

export function canBulkTrash(role: UserRole): boolean {
  return roleAtLeast(role, "member");
}

export function canPurgeTrash(role: UserRole): boolean {
  return role === "admin";
}

export function canManageProjects(role: UserRole): boolean {
  return role === "admin";
}

export function canManageUsers(role: UserRole): boolean {
  return role === "admin";
}

export function roleLabel(role: UserRole): string {
  switch (role) {
    case "admin":
      return "Admin";
    case "member":
      return "Member";
    case "viewer":
      return "Viewer";
  }
}
