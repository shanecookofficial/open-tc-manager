import { describe, expect, it } from "vitest";

import {
  ADMIN_PERMISSIONS,
  MEMBER_PERMISSIONS,
  type User,
} from "@/lib/contracts";

import { roleAllowed } from "./roles";

function user(role: string, permissions: string[] = []): User {
  return {
    id: 1,
    email: "ada@opentcm.local",
    displayName: "Ada",
    role,
    permissions: permissions as User["permissions"],
    deactivatedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("roleAllowed", () => {
  it("allows any authenticated role on authenticated routes", () => {
    expect(roleAllowed(user("viewer"), "authenticated")).toBe(true);
    expect(roleAllowed(user("member", MEMBER_PERMISSIONS), "authenticated")).toBe(
      true,
    );
    expect(roleAllowed(user("admin", ADMIN_PERMISSIONS), "authenticated")).toBe(
      true,
    );
  });

  it("checks permissions instead of a fixed rank", () => {
    expect(roleAllowed(user("viewer"), "cases.write")).toBe(false);
    expect(roleAllowed(user("member", MEMBER_PERMISSIONS), "cases.write")).toBe(
      true,
    );
    expect(roleAllowed(user("admin"), "cases.write")).toBe(true);
    expect(roleAllowed(user("member", MEMBER_PERMISSIONS), "admin")).toBe(false);
    expect(roleAllowed(user("admin"), "admin")).toBe(true);
  });

  it("allows a custom role only the permissions it was given", () => {
    const contractor = user("contractor", ["trash.purge"]);
    expect(roleAllowed(contractor, "trash.purge")).toBe(true);
    expect(roleAllowed(contractor, "cases.write")).toBe(false);
    expect(roleAllowed(contractor, "admin")).toBe(false);
  });
});
