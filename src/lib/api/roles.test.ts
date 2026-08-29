import { describe, expect, it } from "vitest";

import { roleAllowed } from "./roles";

describe("roleAllowed", () => {
  it("allows any authenticated role on authenticated routes", () => {
    expect(roleAllowed("viewer", "authenticated")).toBe(true);
    expect(roleAllowed("member", "authenticated")).toBe(true);
    expect(roleAllowed("admin", "authenticated")).toBe(true);
  });

  it("requires Member+ for member routes and Admin for admin routes", () => {
    expect(roleAllowed("viewer", "member")).toBe(false);
    expect(roleAllowed("member", "member")).toBe(true);
    expect(roleAllowed("admin", "member")).toBe(true);
    expect(roleAllowed("member", "admin")).toBe(false);
    expect(roleAllowed("admin", "admin")).toBe(true);
  });
});
