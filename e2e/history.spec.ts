import { expect, test } from "@playwright/test";

import {
  cleanupE2EProjectByPrefix,
  DEMO_MEMBER_EMAIL,
  DEMO_MEMBER_PASSWORD,
  loginAsAdmin,
  loginAsMember,
  loginViaPage,
  uniquePrefix,
} from "./helpers";

test.describe("Case history and revert", () => {
  let createdPrefix: string | undefined;

  test.beforeEach(async ({ page, request }) => {
    await loginAsAdmin(request);
    await request.post("/api/v1/users", {
      data: {
        email: DEMO_MEMBER_EMAIL,
        displayName: "Member",
        role: "member",
        password: DEMO_MEMBER_PASSWORD,
      },
    });

    const prefix = uniquePrefix("H");
    createdPrefix = prefix;
    await request.post("/api/v1/projects", {
      data: { name: `History ${prefix}`, prefix },
    });

    await loginAsMember(request);
    await loginViaPage(page, {
      email: DEMO_MEMBER_EMAIL,
      password: DEMO_MEMBER_PASSWORD,
    });
  });

  test.afterEach(async ({ request }) => {
    await loginAsAdmin(request);
    await cleanupE2EProjectByPrefix(request, createdPrefix);
    createdPrefix = undefined;
  });

  test("Member edits A→B→C, reverts to first event, timeline is A→B→C→A", async ({
    page,
  }) => {
    const prefix = createdPrefix!;
    await page.goto(`/p/${prefix}`);

    await page.getByRole("link", { name: "New test case" }).click();
    await page.getByLabel("Title").fill("Version A");
    await page.getByLabel("Action", { exact: true }).fill("Step A");
    await page.getByRole("button", { name: "Create test case" }).click();

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Version A");

    await page.getByRole("link", { name: "Edit" }).click();
    await page.getByLabel("Title").fill("Version B");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Version B");

    await page.getByRole("link", { name: "Edit" }).click();
    await page.getByLabel("Title").fill("Version C");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Version C");

    const historySection = page.getByRole("region", { name: /History/ });
    const rows = historySection.locator("ol > li");
    await expect(
      historySection.getByRole("heading", { name: "History (3)" }),
    ).toBeVisible();
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText("Updated");
    await expect(rows.nth(0)).toContainText("Version C");
    await expect(rows.nth(1)).toContainText("Updated");
    await expect(rows.nth(1)).toContainText("Version B");
    await expect(rows.nth(2)).toContainText("Created");
    await expect(rows.nth(2)).toContainText("Version A");

    await rows.nth(1).getByRole("button", { name: "Show diff" }).click();
    const diff = historySection.getByTestId("snapshot-diff");
    await expect(diff).toBeVisible();
    await expect(diff.getByLabel("Title diff")).toContainText("- Version A");
    await expect(diff.getByLabel("Title diff")).toContainText("+ Version B");
    await historySection.getByRole("button", { name: "Hide diff" }).click();

    await rows
      .filter({ hasText: "Created" })
      .getByRole("button", { name: "Revert" })
      .click();
    const confirm = page.getByRole("alertdialog");
    await expect(
      confirm.getByRole("heading", { name: "Revert to this version?" }),
    ).toBeVisible();
    await confirm.getByRole("button", { name: "Revert" }).click();

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Version A");
    await expect(
      historySection.getByRole("heading", { name: "History (4)" }),
    ).toBeVisible();
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(0)).toContainText("Reverted");
    await expect(rows.nth(0)).toContainText("Version A");
    await expect(rows.nth(3)).toContainText("Created");
  });
});
