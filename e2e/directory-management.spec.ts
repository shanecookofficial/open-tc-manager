import { expect, test } from "@playwright/test";

import { cleanupE2EProjectByPrefix, loginAsAdmin, loginViaPage, uniquePrefix } from "./helpers";

async function createProject(page: import("@playwright/test").Page, prefix: string) {
  const name = `Dir E2E ${prefix}`;
  await page.goto("/");
  await page.getByRole("button", { name: /Select project|Web App|API/i }).click();
  await page.getByRole("menuitem", { name: "Create project…" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Prefix").fill(prefix);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(new RegExp(`/p/${prefix}$`));
}

async function openRootActions(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Actions for all test cases" }).click();
}

test.describe("Directory management", () => {
  let createdPrefix: string | undefined;

  test.beforeEach(async ({ page, request }) => {
    await loginAsAdmin(request);
    await loginViaPage(page);
  });

  test.afterEach(async ({ request }) => {
    await cleanupE2EProjectByPrefix(request, createdPrefix);
    createdPrefix = undefined;
  });

  test("creates nested folders", async ({ page }) => {
    const prefix = uniquePrefix("D");
    createdPrefix = prefix;
    await createProject(page, prefix);

    await openRootActions(page);
    await page.getByRole("menuitem", { name: "New folder…" }).click();
    await page.getByLabel("Name").fill("Parent");
    await page.getByRole("button", { name: "Create folder" }).click();

    await expect(page.locator("[data-tree-item]", { hasText: "Parent" })).toBeVisible();

    await page.getByRole("button", { name: "Actions for Parent" }).click();
    await page.getByRole("menuitem", { name: "New subfolder…" }).click();
    await page.getByLabel("Name").fill("Child");
    await page.getByRole("button", { name: "Create folder" }).click();

    await expect(page.locator("[data-tree-item]", { hasText: "Child" })).toBeVisible();
  });

  test("rename collision shows inline error", async ({ page, request }) => {
    const prefix = uniquePrefix("D");
    createdPrefix = prefix;
    await createProject(page, prefix);

    const projects = await request.get("/api/v1/projects");
    const project = (await projects.json()).items.find(
      (p: { prefix: string }) => p.prefix === prefix,
    );

    await request.post("/api/v1/directories", {
      data: { projectId: project.id, name: "Alpha" },
    });
    await request.post("/api/v1/directories", {
      data: { projectId: project.id, name: "Beta" },
    });

    await page.reload();
    await page.getByRole("button", { name: "Actions for Beta" }).click();
    await page.getByRole("menuitem", { name: "Rename…" }).click();
    await page.getByRole("textbox", { name: "Name" }).fill("Alpha");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText(/already exists|SIBLING/i)).toBeVisible();
  });

  test("non-empty delete modes update tree and trash count", async ({
    page,
    request,
  }) => {
    const prefix = uniquePrefix("D");
    createdPrefix = prefix;
    await createProject(page, prefix);

    const projects = await request.get("/api/v1/projects");
    const project = (await projects.json()).items.find(
      (p: { prefix: string }) => p.prefix === prefix,
    );

    const parent = await (
      await request.post("/api/v1/directories", {
        data: { projectId: project.id, name: "Checkout" },
      })
    ).json();

    await request.post("/api/v1/test-cases", {
      data: {
        projectId: project.id,
        title: "Case in folder",
        directoryId: parent.id,
        steps: [{ action: "Do thing" }],
      },
    });

    await page.reload();
    const trashBefore = Number(
      await page.getByTestId("trash-count").innerText(),
    );

    // move_contents_to_parent
    await page.getByRole("button", { name: "Actions for Checkout" }).click();
    await page.getByRole("menuitem", { name: "Delete…" }).click();
    await page.getByText("Move contents to parent folder").click();
    await page.getByRole("button", { name: "Delete folder" }).click();
    await expect(page.locator("[data-tree-item]", { hasText: "Checkout" })).not.toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(`${prefix}-1`) })).toBeVisible();

    // trash_contents mode
    const folder2 = await (
      await request.post("/api/v1/directories", {
        data: { projectId: project.id, name: "ToTrash" },
      })
    ).json();

    await request.post("/api/v1/test-cases", {
      data: {
        projectId: project.id,
        title: "Trash me",
        directoryId: folder2.id,
        steps: [{ action: "Trash action" }],
      },
    });

    await page.reload();
    await page.getByRole("button", { name: "Actions for ToTrash" }).click();
    await page.getByRole("menuitem", { name: "Delete…" }).click();
    await page.getByText("Move cases to trash").click();
    await page.getByRole("button", { name: "Delete folder" }).click();

    await expect(page.locator("[data-tree-item]", { hasText: "ToTrash" })).not.toBeVisible();
    const trashAfter = Number(await page.getByTestId("trash-count").innerText());
    expect(trashAfter).toBeGreaterThan(trashBefore);
  });
});
