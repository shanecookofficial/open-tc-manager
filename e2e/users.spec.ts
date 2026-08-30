import { expect, test } from "@playwright/test";

import {
  DEMO_MEMBER_EMAIL,
  DEMO_MEMBER_PASSWORD,
  loginAsAdmin,
  loginAsMember,
  loginViaPage,
} from "./helpers";

test.describe("Users admin", () => {
  test.beforeEach(async ({ request }) => {
    await loginAsAdmin(request);
  });

  test("Admin creates Member and deactivates them", async ({ page }) => {
    const testMemberEmail = `e2e-member-${Date.now()}@opentcm.local`;
    await loginViaPage(page);

    await page.goto("/users");
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Select project|Web App|API/i }),
    ).toHaveCount(0);
    await page.getByRole("link", { name: "← Test cases" }).click();
    await expect(page).not.toHaveURL(/\/users/);
    await page.goto("/users");

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
    await page.getByRole("alertdialog").getByRole("button", { name: "Deactivate" }).click();
    await expect(row.getByText("Deactivated")).toBeVisible();

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL("/login");

    await page.getByLabel("Email").fill(testMemberEmail);
    await page.getByLabel("Password").fill("e2e-member-pass");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(
      page.getByText("This account has been deactivated."),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
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

  test("last remaining Admin cannot be deactivated or demoted", async ({
    page,
    request,
  }) => {
    const extraEmail = `e2e-last-admin-${Date.now()}@opentcm.local`;
    const extraPassword = "spare-admin-pass";
    const extraResponse = await request.post("/api/v1/users", {
      data: {
        email: extraEmail,
        displayName: "E2E Last Admin",
        role: "admin",
        password: extraPassword,
      },
    });
    expect(extraResponse.ok()).toBeTruthy();
    const extra = (await extraResponse.json()) as { id: number };

    const extraLogin = await request.post("/api/v1/auth/login", {
      data: { email: extraEmail, password: extraPassword },
    });
    expect(extraLogin.ok()).toBeTruthy();

    const listed = (await (await request.get("/api/v1/users")).json()) as {
      items: {
        id: number;
        role: string;
        deactivatedAt: string | null;
      }[];
    };
    const others = listed.items.filter(
      (item) =>
        item.role === "admin" &&
        item.deactivatedAt === null &&
        item.id !== extra.id,
    );
    const deactivatedAt = new Date().toISOString();
    for (const other of others) {
      const patched = await request.patch(`/api/v1/users/${other.id}`, {
        data: { deactivatedAt },
      });
      expect(patched.ok()).toBeTruthy();
    }

    try {
      await loginViaPage(page, {
        email: extraEmail,
        password: extraPassword,
      });
      await page.goto("/users");
      const row = page.getByRole("row", { name: new RegExp(extraEmail) });
      await expect(row.getByRole("button", { name: "Deactivate" })).toBeDisabled();

      await row.getByRole("button", { name: "Change role" }).click();
      const roleDialog = page.getByRole("dialog", { name: "Change role" });
      await roleDialog.locator("#edit-role").selectOption("member");
      await expect(
        roleDialog.getByText(
          "Cannot deactivate or demote the last remaining Admin.",
        ),
      ).toBeVisible();
      await expect(
        roleDialog.getByRole("button", { name: "Save role" }),
      ).toBeDisabled();
      await roleDialog.getByRole("button", { name: "Cancel" }).click();
    } finally {
      for (const other of others) {
        await request.patch(`/api/v1/users/${other.id}`, {
          data: { deactivatedAt: null, role: "admin" },
        });
      }
    }
  });
});
