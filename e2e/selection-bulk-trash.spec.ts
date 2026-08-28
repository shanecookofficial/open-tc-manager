import { expect, test } from "@playwright/test";

function uniquePrefix() {
  const suffix = Date.now().toString(36).slice(-4).toUpperCase();
  return `S${suffix}`.slice(0, 10);
}

test.describe("Selection mode and bulk trash", () => {
  test("filter, select-all-matching, bulk trash updates list and trash count", async ({
    page,
    request,
  }) => {
    const prefix = uniquePrefix();
    const name = `Select E2E ${prefix}`;

    await page.goto("/");
    await page.getByRole("button", { name: /Select project|Web App|API/i }).click();
    await page.getByRole("menuitem", { name: "Create project…" }).click();
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Prefix").fill(prefix);
    await page.getByRole("button", { name: "Create project" }).click();

    const projects = await request.get("/api/v1/projects");
    const project = (await projects.json()).items.find(
      (p: { prefix: string }) => p.prefix === prefix,
    );

    for (let i = 1; i <= 3; i += 1) {
      await request.post("/api/v1/test-cases", {
        data: {
          projectId: project.id,
          title: `Bulk target ${i}`,
          steps: [{ action: `Action ${i}` }],
        },
      });
    }
    await request.post("/api/v1/test-cases", {
      data: {
        projectId: project.id,
        title: "Keep me visible",
        steps: [{ action: "Stay" }],
      },
    });

    await page.reload();
    await page.getByLabel("Search test cases").fill("Bulk target");
    await expect(
      page.getByRole("link", { name: new RegExp(`${prefix}-1`, "i"), exact: true }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("link", { name: /Keep me visible/i }),
    ).not.toBeVisible();
    await page.getByRole("button", { name: "Select cases" }).click();
    await expect(
      page.getByRole("button", { name: /Select all 3 matching/i }),
    ).toBeVisible();
    await page.getByRole("button", { name: /Select all 3 matching/i }).click();
    await page.getByRole("button", { name: "Move to trash" }).click();
    await page
      .getByRole("button", { name: "Move 3 to trash", exact: true })
      .click();

    await expect(page.getByText("No matching test cases")).toBeVisible();
    const trashCount = Number(await page.getByTestId("trash-count").innerText());
    expect(trashCount).toBeGreaterThanOrEqual(3);
  });

  test("page checkbox selects a subset", async ({ page, request }) => {
    const prefix = uniquePrefix();
    await page.goto("/");
    await page.getByRole("button", { name: /Select project|Web App|API/i }).click();
    await page.getByRole("menuitem", { name: "Create project…" }).click();
    await page.getByLabel("Name").fill(`Page select ${prefix}`);
    await page.getByLabel("Prefix").fill(prefix);
    await page.getByRole("button", { name: "Create project" }).click();

    const projects = await request.get("/api/v1/projects");
    const project = (await projects.json()).items.find(
      (p: { prefix: string }) => p.prefix === prefix,
    );

    for (let i = 1; i <= 2; i += 1) {
      await request.post("/api/v1/test-cases", {
        data: {
          projectId: project.id,
          title: `Subset ${i}`,
          steps: [{ action: "Go" }],
        },
      });
    }

    const listLoaded = page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/test-cases") &&
        response.request().method() === "GET" &&
        response.ok(),
    );
    await page.goto(`/p/${prefix}`);
    await listLoaded;
    const caseLinks = page.getByRole("link", {
      name: new RegExp(`^${prefix}-\\d+$`),
    });
    await expect(caseLinks).toHaveCount(2);
    await page.getByRole("button", { name: "Select cases" }).click();
    await page.getByLabel("Select all on this page").click();
    await expect(page.getByText("2 selected")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Move to trash" }).click();
    await page
      .getByRole("button", { name: "Move 2 to trash", exact: true })
      .click();

    await expect(page.getByText("No test cases yet")).toBeVisible();
  });
});
