import type { Permission, User } from "@/lib/contracts";

import { ApiError } from "./errors";
import { hasPermission, isAdminRole } from "@/lib/auth/permissions";

/** Route auth policy. Default in `apiHandler` is `"authenticated"`. */
export type AuthLevel = "public" | "authenticated" | "admin" | Permission;

export function roleAllowed(user: User, level: AuthLevel): boolean {
  if (level === "public" || level === "authenticated") {
    return true;
  }
  if (level === "admin") {
    return isAdminRole(user.role);
  }
  return hasPermission(user, level);
}

export function assertRole(user: User, level: AuthLevel): void {
  if (!roleAllowed(user, level)) {
    throw new ApiError(
      "FORBIDDEN",
      "You do not have permission to perform this action.",
    );
  }
}
