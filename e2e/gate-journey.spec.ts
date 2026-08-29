import { expect, test } from "@playwright/test";

import {
  cleanupE2EProjectByPrefix,
  loginAsAdmin,
  loginViaPage,
  uniquePrefix,
} from "./helpers";

test.describe("Gate journey", () => {
  let createdPrefix: string | undefined;

  test.beforeEach(async ({ page, request }) => {
    await loginAsAdmin(request);
    await loginViaPage(page);
  });

  test.afterEach(async ({ request }) => {
    await cleanupE2EProjectByPrefix(request, createdPrefix);
    createdPrefix = undefined;
  });

  test("full create → edit → move → trash → restore → purge flow", async ({
    page,
    request,
  }) => {
    const prefix = uniquePrefix("G");
    createdPrefix = prefix;
    const projectName = `Gate ${prefix}`;

    // Create project
    await page.goto("/");
    await page.getByRole("button", { name: /Select project|Web App|API/i }).click();
    await page.getByRole("menuitem", { name: "Create project…" }).click();
    await page.getByLabel("Name").fill(projectName);
    await page.getByLabel("Prefix").fill(prefix);
    await page.getByRole("button", { name: "Create project" }).click();
    await expect(page).toHaveURL(new RegExp(`/p/${prefix}$`));

    // Create nested directory
    await page.getByRole("button", { name: "Actions for all test cases" }).click();
    await page.getByRole("menuitem", { name: "New folder…" }).click();
    await page.getByLabel("Name").fill("Features");
    await page.getByRole("button", { name: "Create folder" }).click();
    await page.getByRole("button", { name: "Actions for Features" }).click();
    await page.getByRole("menuitem", { name: "New subfolder…" }).click();
    await page.getByLabel("Name").fill("Auth");
    await page.getByRole("button", { name: "Create folder" }).click();

    // Create case with markdown steps
    await page.locator("[data-tree-item]", { hasText: "Auth" }).click();
    await page.getByRole("link", { name: "New test case" }).click();
    await page.getByLabel("Title").fill("Gate journey case");
    await page.getByLabel("Action", { exact: true }).first().fill("**Step one**");
    await page.getByRole("button", { name: "Add step" }).click();
    await page.getByLabel("Action", { exact: true }).nth(1).fill("```js\nconsole.log(1)\n```");
    await page.getByRole("button", { name: "Create test case" }).click();

    const displayNumber = `${prefix}-1`;
    await expect(page).toHaveURL(new RegExp(`/cases/${displayNumber}$`));
    await expect(page.locator("strong")).toContainText("Step one");
    await expect(page.locator("pre code")).toBeVisible();

    // Edit: reorder steps
    await page.getByRole("link", { name: "Edit" }).click();
    await page.getByRole("button", { name: "Move step 2 up" }).click();
    await page.getByRole("button", { name: "Save changes" }).click();
    const bodyAfterEdit = await page.locator("tbody").innerText();
    expect(bodyAfterEdit.indexOf("console.log")).toBeLessThan(
      bodyAfterEdit.indexOf("Step one"),
    );

    // Move case to project root
    await page.getByRole("button", { name: "Move" }).click();
    await page.getByRole("button", { name: "Project root" }).click();
    await page.getByRole("button", { name: "Move", exact: true }).click();

    // Trash case
    await page.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Move to trash" }).click();
    await expect(page).toHaveURL(new RegExp(`/p/${prefix}`));

    // Restore
    await page.goto(`/p/${prefix}/trash`);
    await page
      .getByRole("row", { name: new RegExp(displayNumber) })
      .getByRole("button", { name: "Restore" })
      .click();
    await page.goto(`/p/${prefix}`);
    await expect(
      page.getByRole("link", { name: displayNumber, exact: true }),
    ).toBeVisible();

    // Trash again
    await page.getByRole("link", { name: displayNumber, exact: true }).click();
    await page.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Move to trash" }).click();

    // Purge from trash (single item — use page select-all)
    await page.goto(`/p/${prefix}/trash`);
    await page.getByRole("button", { name: "Select cases" }).click();
    await page.getByLabel("Select all on this page").click();
    await page.getByTestId("bulk-delete-permanently").click();
    await page.getByLabel(/Type/).fill("1");
    await page.getByRole("dialog").getByRole("button", { name: "Delete permanently" }).click();
    await expect(page.getByText("Trash is empty")).toBeVisible();

    // Gone from list and direct GET
    await page.goto(`/p/${prefix}`);
    await expect(
      page.getByRole("link", { name: displayNumber, exact: true }),
    ).not.toBeVisible();

    const gone = await request.get(
      `/api/v1/test-cases/number/${displayNumber}`,
    );
    expect(gone.status()).toBe(404);
  });
});
