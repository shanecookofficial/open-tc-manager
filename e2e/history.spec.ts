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

    const historySection = page.locator("section", {
      has: page.getByText(/^History \(\d+\)/),
    });
    await expect(historySection.getByText("Created")).toBeVisible();
    await expect(historySection.getByText("Updated")).toHaveCount(2);

    const firstRevertButton = historySection
      .getByRole("button", { name: "Revert" })
      .first();
    await firstRevertButton.click();
    await page.getByRole("button", { name: "Revert" }).last().click();

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Version A");
    await expect(historySection.getByText("Reverted")).toBeVisible();
    await expect(historySection.locator("li")).toHaveCount(4);
  });
});
