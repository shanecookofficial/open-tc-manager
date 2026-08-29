import { expect, test } from "@playwright/test";

import { loginAsAdmin, loginViaPage } from "./helpers";

function uniquePrefix() {
  const suffix = Date.now().toString(36).slice(-4).toUpperCase();
  return `B${suffix}`.slice(0, 10);
}

const LONG_TITLE = "L".repeat(200);

test.describe("UI bug bash regressions", () => {
  test.beforeEach(async ({ page, request }) => {
    await loginAsAdmin(request);
    await loginViaPage(page);
  });

  test("200-character title renders without breaking list and detail layouts", async ({
    page,
    request,
  }) => {
    const prefix = uniquePrefix();
    await page.goto("/");
    await page.getByRole("button", { name: /Select project|Web App|API/i }).click();
    await page.getByRole("menuitem", { name: "Create project…" }).click();
    await page.getByLabel("Name").fill(`Long title ${prefix}`);
    await page.getByLabel("Prefix").fill(prefix);
    await page.getByRole("button", { name: "Create project" }).click();

    const projects = await request.get("/api/v1/projects");
    const project = (await projects.json()).items.find(
      (p: { prefix: string }) => p.prefix === prefix,
    );

    const created = await (
      await request.post("/api/v1/test-cases", {
        data: {
          projectId: project.id,
          title: LONG_TITLE,
          steps: [{ action: "Verify layout" }],
        },
      })
    ).json();

    await page.goto(`/p/${prefix}`);
    const titleCell = page.locator(`[title="${LONG_TITLE}"]`).first();
    await expect(titleCell).toBeVisible();

    await page.goto(`/cases/${created.displayNumber}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveAttribute(
      "title",
      LONG_TITLE,
    );
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/^L+$/);
  });

  test("hostile markdown in editor preview stays inert", async ({ page }) => {
    await page.goto("/p/WEB");
    await page.getByRole("link", { name: "New test case" }).click();
    await page.getByLabel("Action", { exact: true }).fill(
      '<script>window.__xss=1</script><img src=x onerror="window.__xss=1">',
    );
    await page.getByRole("tab", { name: "Preview" }).first().click();
    const preview = page.locator('[id$="-preview-panel"]:not([hidden])').first();
    await expect(preview.locator("script")).toHaveCount(0);
    await expect(preview.locator("img[onerror]")).toHaveCount(0);
    const xss = await page.evaluate(() => (window as unknown as { __xss?: number }).__xss);
    expect(xss).toBeUndefined();
  });

  test("prefix change updates display numbers and old links 404", async ({
    page,
    request,
  }) => {
    test.setTimeout(60_000);
    const prefix = uniquePrefix();
    await page.goto("/");
    await page.getByRole("button", { name: /Select project|Web App|API/i }).click();
    await page.getByRole("menuitem", { name: "Create project…" }).click();
    await page.getByLabel("Name").fill(`Prefix change ${prefix}`);
    await page.getByLabel("Prefix").fill(prefix);
    await page.getByRole("button", { name: "Create project" }).click();

    const projects = await request.get("/api/v1/projects");
    const project = (await projects.json()).items.find(
      (p: { prefix: string }) => p.prefix === prefix,
    );

    await request.post("/api/v1/test-cases", {
      data: {
        projectId: project.id,
        title: "Prefix target",
        steps: [{ action: "Go" }],
      },
    });

    const newPrefix = `X${prefix.slice(1, 8)}`;
    await page.getByRole("button", { name: new RegExp(`Prefix change ${prefix}`) }).click();
    await page.getByRole("menuitem", { name: "Edit current project…" }).click();
    await page.getByLabel("Prefix").fill(newPrefix);
    await expect(page.getByText(/Existing case IDs will display/i)).toBeVisible();
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page).toHaveURL(new RegExp(`/p/${newPrefix}`));
    await expect(
      page.getByRole("link", { name: `${newPrefix}-1`, exact: true }),
    ).toBeVisible();

    await page.goto(`/cases/${prefix}-1`);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });

  test("120-step case can be edited and saved", async ({ page, request }) => {
    test.setTimeout(90_000);
    const prefix = uniquePrefix();
    await page.goto("/");
    await page.getByRole("button", { name: /Select project|Web App|API/i }).click();
    await page.getByRole("menuitem", { name: "Create project…" }).click();
    await page.getByLabel("Name").fill(`Many steps ${prefix}`);
    await page.getByLabel("Prefix").fill(prefix);
    await page.getByRole("button", { name: "Create project" }).click();

    const projects = await request.get("/api/v1/projects");
    const project = (await projects.json()).items.find(
      (p: { prefix: string }) => p.prefix === prefix,
    );

    const steps = Array.from({ length: 120 }, (_, i) => ({
      action: `Step ${i + 1} action`,
      expectedResult: i % 5 === 0 ? `Expected ${i + 1}` : null,
    }));

    const created = await (
      await request.post("/api/v1/test-cases", {
        data: {
          projectId: project.id,
          title: "120-step case",
          steps,
        },
      })
    ).json();

    await page.goto(`/cases/${created.displayNumber}/edit`);
    const step120 = page.getByText("Step 120", { exact: true });
    await step120.first().scrollIntoViewIfNeeded();
    await expect(step120.first()).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Move step 120 up" }).click();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(new RegExp(`/cases/${created.displayNumber}$`));
    await expect(page.getByText("Steps (120)")).toBeVisible();
  });
});
