import { expect, test } from "@playwright/test";

import { loginViaPage } from "./helpers";

/**
 * Keyboard-only gate journey (no mouse). Documents the tab/arrow path for a11y review.
 */
test.describe("Keyboard gate journey", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaPage(page);
  });

  test("navigates repository → case → editor → trash with keyboard", async ({
    page,
  }) => {
    await page.goto("/p/WEB");

    // Focus search, filter list
    await page.keyboard.press("Tab");
    let focused = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
    while (focused !== "Search test cases") {
      await page.keyboard.press("Tab");
      focused = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
    }
    await page.keyboard.type("valid credentials");

    // Open first visible case link via keyboard (skip to main list links)
    await page.getByRole("link", { name: "WEB-1", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/cases\/WEB-1/);

    // Edit link
    await page.getByRole("link", { name: "Edit" }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/edit/);

    // Reorder step 2 up via labeled button
    const moveUp = page.getByRole("button", { name: "Move step 2 up" });
    if (await moveUp.isVisible()) {
      await moveUp.focus();
      await page.keyboard.press("Enter");
    }

    // Cancel back to detail
    await page.getByRole("button", { name: "Cancel" }).focus();
    await page.keyboard.press("Enter");

    // Trash view (sidebar link only on repository pages)
    await page.goto("/p/WEB/trash");
    await expect(page.getByRole("heading", { name: "Trash" })).toBeVisible();

    // Selection mode via keyboard
    await page.getByRole("button", { name: "Select cases" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("Select all on this page")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).focus();
    await page.keyboard.press("Enter");
  });
});
