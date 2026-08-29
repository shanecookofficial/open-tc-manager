import { expect, test } from "@playwright/test";

import {
  cleanupE2EProjectByPrefix,
  loginAsAdmin,
  loginViaPage,
  uniquePrefix,
} from "./helpers";

test.describe("Repository view", () => {
  let createdPrefix: string | undefined;

  test.beforeEach(async ({ page, request }) => {
    await loginAsAdmin(request);
    await loginViaPage(page);
  });

  test.afterEach(async ({ request }) => {
    await cleanupE2EProjectByPrefix(request, createdPrefix);
    createdPrefix = undefined;
  });

  test("creates and switches projects", async ({ page }) => {
    const prefix = uniquePrefix("E");
    createdPrefix = prefix;
    const name = `E2E Project ${prefix}`;

    await page.goto("/");
    await page.getByRole("button", { name: /Select project|Web App|API/i }).click();
    await page.getByRole("menuitem", { name: "Create project…" }).click();
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Prefix").fill(prefix);
    await page.getByRole("button", { name: "Create project" }).click();

    await expect(page).toHaveURL(new RegExp(`/p/${prefix}$`));
    await expect(page.getByRole("button", { name: new RegExp(name) })).toBeVisible();

    await page.getByRole("button", { name: new RegExp(name) }).click();
    await page.getByRole("menuitem", { name: /Web App/i }).click();
    await expect(page).toHaveURL(/\/p\/WEB/);
  });

  test("tree selection updates the case list", async ({ page }) => {
    await page.goto("/p/WEB");

    const treeNav = page.getByRole("navigation", { name: "Directory tree" });
    await expect(treeNav).toBeVisible({ timeout: 15_000 });

    const checkoutFolder = treeNav.locator("[data-tree-item]", { hasText: "Checkout" });
    await expect(checkoutFolder).toBeVisible();
    await checkoutFolder.click();

    await expect(page).toHaveURL(/dir=/);
    await expect(
      page.getByRole("link", { name: "WEB-1", exact: true }),
    ).not.toBeVisible();
  });

  test("clicking a case title opens the case", async ({ page }) => {
    await page.goto("/p/WEB");
    await page
      .getByRole("link", { name: /Login with valid credentials/i })
      .click();
    await expect(page).toHaveURL(/\/cases\/WEB-1$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Login with valid credentials",
    );
  });

  test("search narrows the case list", async ({ page }) => {
    await page.goto("/p/WEB");

    await page.getByLabel("Search test cases").fill("valid credentials");
    await expect(page.getByRole("link", { name: "WEB-1", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "WEB-7", exact: true })).not.toBeVisible();
  });

  test("pagination works with a small page size", async ({ page }) => {
    await page.goto("/p/WEB?pageSize=5");

    await expect(page.getByText("Page 1 of")).toBeVisible();
    const firstPageCases = await page
      .getByRole("link", { name: /^WEB-\d+$/, exact: true })
      .count();
    expect(firstPageCases).toBeLessThanOrEqual(5);

    const nextButton = page.getByRole("button", { name: "Next", exact: true });
    await expect(nextButton).toBeEnabled();
    await nextButton.click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByText("Page 2 of")).toBeVisible();
  });
});
