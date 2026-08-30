import {
  ADMIN_PERMISSIONS,
  MEMBER_PERMISSIONS,
  type Permission,
} from "@/lib/contracts";

export type RoleLike = {
  role: string;
  permissions?: readonly string[];
};

export function isAdminRole(role: string): boolean {
  return role === "admin";
}

export function permissionsFor(user: RoleLike): readonly string[] {
  if (isAdminRole(user.role)) {
    return ADMIN_PERMISSIONS;
  }
  if (user.permissions) {
    return user.permissions;
  }
  if (user.role === "member") {
    return MEMBER_PERMISSIONS;
  }
  return [];
}

export function hasPermission(user: RoleLike, permission: Permission): boolean {
  if (isAdminRole(user.role)) {
    return true;
  }
  return permissionsFor(user).includes(permission);
}

export function canWriteCases(user: RoleLike): boolean {
  return hasPermission(user, "cases.write");
}

export function canRevertCases(user: RoleLike): boolean {
  return hasPermission(user, "cases.revert");
}

export function canManageDirectories(user: RoleLike): boolean {
  return hasPermission(user, "directories.write");
}

export function canBulkTrash(user: RoleLike): boolean {
  return hasPermission(user, "cases.bulk");
}

export function canPurgeTrash(user: RoleLike): boolean {
  return hasPermission(user, "trash.purge");
}

export function canManageProjects(user: RoleLike): boolean {
  return hasPermission(user, "projects.write");
}

export function canManageUsers(user: RoleLike): boolean {
  return isAdminRole(user.role);
}

export function canManageRoles(user: RoleLike): boolean {
  return isAdminRole(user.role);
}

export function roleLabel(role: string, roleName?: string): string {
  if (roleName) {
    return roleName;
  }
  switch (role) {
    case "admin":
      return "Admin";
    case "member":
      return "Member";
    case "viewer":
      return "Viewer";
    default:
      return role;
  }
}

export const PERMISSION_LABELS: Record<Permission, string> = {
  "cases.write": "Create and edit test cases",
  "cases.revert": "Revert case history",
  "directories.write": "Create and manage folders",
  "cases.bulk": "Bulk trash and restore",
  "trash.purge": "Permanently delete cases",
  "projects.write": "Create and edit projects",
};
