import type { UserRole } from "@/lib/contracts";

import { ApiError } from "./errors";

/** Route auth policy. Default in `apiHandler` is `"authenticated"`. */
export type AuthLevel = "public" | "authenticated" | "member" | "admin";

const RANK: Record<UserRole, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
};

export function roleAllowed(role: UserRole, level: AuthLevel): boolean {
  if (level === "public" || level === "authenticated") {
    return true;
  }
  if (level === "member") {
    return RANK[role] >= RANK.member;
  }
  return role === "admin";
}

export function assertRole(role: UserRole, level: AuthLevel): void {
  if (!roleAllowed(role, level)) {
    throw new ApiError(
      "FORBIDDEN",
      "You do not have permission to perform this action.",
    );
  }
}
