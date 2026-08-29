import { expect, test } from "@playwright/test";

import {
  cleanupE2EProjectByPrefix,
  loginAsAdmin,
  loginViaPage,
  uniquePrefix,
} from "./helpers";

test.describe("Trash view", () => {
  let createdPrefix: string | undefined;

  test.beforeEach(async ({ page, request }) => {
    await loginAsAdmin(request);
    await loginViaPage(page);
  });

  test.afterEach(async ({ request }) => {
    await cleanupE2EProjectByPrefix(request, createdPrefix);
    createdPrefix = undefined;
  });

  test("restore, permanent delete, bulk purge, and cancel typed confirm", async ({
    page,
    request,
  }) => {
    const prefix = uniquePrefix("T");
    createdPrefix = prefix;
    await page.goto("/");
    await page.getByRole("button", { name: /Select project|Web App|API/i }).click();
    await page.getByRole("menuitem", { name: "Create project…" }).click();
    await page.getByLabel("Name").fill(`Trash E2E ${prefix}`);
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
          title: "Restore me",
          steps: [{ action: "Step" }],
        },
      })
    ).json();

    const purgeTarget = await (
      await request.post("/api/v1/test-cases", {
        data: {
          projectId: project.id,
          title: "Purge me",
          steps: [{ action: "Step" }],
        },
      })
    ).json();

    const bulkA = await (
      await request.post("/api/v1/test-cases", {
        data: {
          projectId: project.id,
          title: "Bulk A",
          steps: [{ action: "A" }],
        },
      })
    ).json();
    const bulkB = await (
      await request.post("/api/v1/test-cases", {
        data: {
          projectId: project.id,
          title: "Bulk B",
          steps: [{ action: "B" }],
        },
      })
    ).json();

    await request.delete(`/api/v1/test-cases/${created.id}`);
    await request.delete(`/api/v1/test-cases/${purgeTarget.id}`);
    await request.delete(`/api/v1/test-cases/${bulkA.id}`);
    await request.delete(`/api/v1/test-cases/${bulkB.id}`);

    await page.goto(`/p/${prefix}/trash`);

    // Restore one
    await page
      .getByRole("row", { name: new RegExp(created.displayNumber) })
      .getByRole("button", { name: "Restore" })
      .click();
    await page.goto(`/p/${prefix}`);
    await expect(
      page.getByRole("link", { name: created.displayNumber, exact: true }),
    ).toBeVisible();

    // Permanent delete with typed DELETE
    await page.goto(`/p/${prefix}/trash`);
    await page
      .getByRole("row", { name: new RegExp(purgeTarget.displayNumber) })
      .getByRole("button", { name: "Delete permanently" })
      .click();
    await page.getByLabel(/Type/).fill("DELETE");
    await page.getByRole("dialog").getByRole("button", { name: "Delete permanently" }).click();
    await expect(
      page.getByRole("row", { name: new RegExp(purgeTarget.displayNumber) }),
    ).not.toBeVisible();

    // Cancel typed confirm does not delete
    await page
      .getByRole("row", { name: new RegExp(bulkA.displayNumber) })
      .getByRole("button", { name: "Delete permanently" })
      .click();
    await page.getByLabel(/Type/).fill("WRONG");
    await expect(
      page.getByRole("button", { name: "Delete permanently" }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText(bulkA.displayNumber)).toBeVisible();

    // Bulk purge via page select-all + typed count
    await page.getByRole("button", { name: "Select cases" }).click();
    await page.getByLabel("Select all on this page").click();
    await page.getByTestId("bulk-delete-permanently").click();
    await page.getByLabel(/Type/).fill("2");
    await page.getByRole("dialog").getByRole("button", { name: "Delete permanently" }).click();

    await expect(page.getByText("Trash is empty")).toBeVisible();
  });
});
