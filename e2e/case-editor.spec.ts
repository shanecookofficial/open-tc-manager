import { expect, test } from "@playwright/test";

import {
  cleanupE2EProjectByPrefix,
  loginAsAdmin,
  loginViaPage,
  uniquePrefix,
} from "./helpers";

test.describe("Case editor", () => {
  let createdPrefix: string | undefined;

  test.beforeEach(async ({ page, request }) => {
    await loginAsAdmin(request);
    await loginViaPage(page);
  });

  test.afterEach(async ({ request }) => {
    await cleanupE2EProjectByPrefix(request, createdPrefix);
    createdPrefix = undefined;
  });

  test("creates case with 3 steps including reorder and persists order", async ({
    page,
  }) => {
    const prefix = uniquePrefix("E");
    createdPrefix = prefix;
    const projectName = `Editor E2E ${prefix}`;

    await page.goto("/");
    await page.getByRole("button", { name: /Select project|Web App|API/i }).click();
    await page.getByRole("menuitem", { name: "Create project…" }).click();
    await page.getByLabel("Name").fill(projectName);
    await page.getByLabel("Prefix").fill(prefix);
    await page.getByRole("button", { name: "Create project" }).click();

    await page.getByRole("link", { name: "New test case" }).click();
    await page.getByLabel("Title").fill("Reorder flow case");

    await page.getByRole("button", { name: "Add step" }).click();
    await page.getByRole("button", { name: "Add step" }).click();

    const actionFields = page.getByLabel("Action", { exact: true });
    await actionFields.nth(0).fill("First action");
    await actionFields.nth(1).fill("Second action");
    await actionFields.nth(2).fill("Third action");

    await page
      .getByRole("button", { name: "Move step 3 up" })
      .click();
    await page
      .getByRole("button", { name: "Move step 2 up" })
      .click();

    await page.getByRole("button", { name: "Create test case" }).click();

    await expect(page).toHaveURL(new RegExp(`/cases/${prefix}-1$`));
    await expect(page.getByText("Third action")).toBeVisible();
    await expect(page.getByText("First action")).toBeVisible();
    await expect(page.getByText("Second action")).toBeVisible();

    const stepNumbers = page.locator("tbody tr td").filter({ hasText: /^[123]$/ });
    await expect(stepNumbers.nth(0)).toHaveText("1");
    await expect(stepNumbers.nth(1)).toHaveText("2");
    await expect(stepNumbers.nth(2)).toHaveText("3");

    const detailText = await page.locator("tbody").innerText();
    const thirdPos = detailText.indexOf("Third action");
    const firstPos = detailText.indexOf("First action");
    const secondPos = detailText.indexOf("Second action");
    expect(thirdPos).toBeLessThan(firstPos);
    expect(firstPos).toBeLessThan(secondPos);
  });

  test("creates a folder from the new-case form and files the case there", async ({
    page,
  }) => {
    const prefix = uniquePrefix("E");
    createdPrefix = prefix;
    const projectName = `Folder-on-create ${prefix}`;
    const folderName = `Onboarding ${prefix}`;

    await page.goto("/");
    await page.getByRole("button", { name: /Select project|Web App|API/i }).click();
    await page.getByRole("menuitem", { name: "Create project…" }).click();
    await page.getByLabel("Name").fill(projectName);
    await page.getByLabel("Prefix").fill(prefix);
    await page.getByRole("button", { name: "Create project" }).click();

    await page.getByRole("link", { name: "New test case" }).click();
    await expect(page.getByText("No folders yet.")).toBeVisible();

    await page.getByRole("button", { name: "New folder…" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "New folder" })).toBeVisible();
    await dialog.getByLabel("Name").fill(folderName);
    await dialog.getByRole("button", { name: "Create folder" }).click();

    const folderRow = page
      .getByRole("navigation", { name: "Directory tree" })
      .getByRole("button", { name: folderName });
    await expect(folderRow).toBeVisible();
    await expect(folderRow).toHaveAttribute("aria-current", "page");

    await page.getByLabel("Title").fill("Welcome email");
    await page.getByLabel("Action", { exact: true }).fill("Open the inbox.");
    await page.getByRole("button", { name: "Create test case" }).click();

    await expect(page).toHaveURL(new RegExp(`/cases/${prefix}-1$`));
    await expect(
      page.getByRole("navigation", { name: "Breadcrumb" }).getByText(folderName),
    ).toBeVisible();
  });

  test("submitting empty action shows inline error and sends no request", async ({
    page,
    request,
  }) => {
    const projectsResponse = await request.get("/api/v1/projects");
    const projects = (await projectsResponse.json()) as {
      items: { id: number; prefix: string }[];
    };
    const web = projects.items.find((item) => item.prefix === "WEB");
    expect(web).toBeTruthy();

    let postCount = 0;
    await page.route("**/api/v1/test-cases", async (route) => {
      if (route.request().method() === "POST") {
        postCount += 1;
      }
      await route.continue();
    });

    await page.goto(`/cases/new?project=${web!.id}`);
    await page.getByLabel("Title").fill("Validation test case");
    await page.getByLabel("Action", { exact: true }).fill("");
    await page.getByRole("button", { name: "Create test case" }).click();

    await expect(page.getByText("Action is required")).toBeVisible();
    expect(postCount).toBe(0);
  });
});
