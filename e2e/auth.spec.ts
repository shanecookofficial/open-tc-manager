import { expect, test } from "@playwright/test";

import { loginViaPage } from "./helpers";

test.describe("Authentication", () => {
  test("login reaches repository and logout returns to login", async ({
    page,
  }) => {
    await loginViaPage(page, undefined, "/p/WEB");
    await expect(page).toHaveURL(/\/p\/WEB/);
    await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Users" })).toBeVisible();

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
