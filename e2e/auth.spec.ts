import { expect, test } from "@playwright/test";

import { loginViaPage } from "./helpers";

test.describe("Authentication", () => {
  test("login page is public and does not show case data", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByText("WEB-1")).toHaveCount(0);
    await expect(page.getByText("Web App")).toHaveCount(0);
  });

  test("unauthenticated home does not render the app", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("button", { name: "New test case" })).toHaveCount(
      0,
    );
  });
  test("login reaches repository and logout returns to login", async ({
    page,
  }) => {
    await loginViaPage(page, undefined, "/p/WEB");
    await expect(page).toHaveURL(/\/p\/WEB/);
    await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Users" })).toBeVisible();
    await expect(page.getByRole("link", { name: "OpenTCM", exact: true })).toBeVisible();
    await expect(page.getByText("Open Test Case Manager")).toHaveCount(0);

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL("/login");
  });

  test("unauthenticated visit redirects to login with next path", async ({
    page,
  }) => {
    await page.goto("/p/WEB");
    await expect(page).toHaveURL(/\/login\?next=/);
    await expect(page.url()).toContain(
      encodeURIComponent("/p/WEB"),
    );
  });
});
