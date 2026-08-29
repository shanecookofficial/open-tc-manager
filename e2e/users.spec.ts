import { expect, test } from "@playwright/test";

import {
  DEMO_MEMBER_EMAIL,
  DEMO_MEMBER_PASSWORD,
  loginAsAdmin,
  loginAsMember,
  loginViaPage,
} from "./helpers";

test.describe("Users admin", () => {
  const testMemberEmail = `e2e-member-${Date.now()}@opentcm.local`;

  test.beforeEach(async ({ request }) => {
    await loginAsAdmin(request);
  });

  test("Admin creates Member and deactivates them", async ({ page }) => {
    await loginViaPage(page);

    await page.goto("/users");
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();

    await page.getByRole("button", { name: "Create user" }).click();
    await page.getByLabel("Email").fill(testMemberEmail);
    await page.getByLabel("Display name").fill("E2E Member");
    await page.getByLabel("Role").selectOption("member");
    await page.locator("#create-password").fill("e2e-member-pass");
    await page.getByRole("button", { name: "Create user" }).click();

    const row = page.getByRole("row", { name: new RegExp(testMemberEmail) });
    await expect(row).toBeVisible();
    await expect(row.getByRole("cell", { name: "Member", exact: true })).toBeVisible();

    await row.getByRole("button", { name: "Deactivate" }).click();
    await page.getByRole("button", { name: "Deactivate" }).last().click();
    await expect(row.getByText("Deactivated")).toBeVisible();
  });

  test("Member cannot open Users page", async ({ page, request }) => {
    await request.post("/api/v1/users", {
      data: {
        email: DEMO_MEMBER_EMAIL,
        displayName: "Member",
        role: "member",
        password: DEMO_MEMBER_PASSWORD,
      },
    });

    await loginAsMember(request);
    await loginViaPage(page, {
      email: DEMO_MEMBER_EMAIL,
      password: DEMO_MEMBER_PASSWORD,
    });

    await page.goto("/users");
    await expect(page.getByText("Forbidden")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Users" })).not.toBeVisible();
  });
});
