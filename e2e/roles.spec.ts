import { expect, test } from "@playwright/test";

import { loginAsAdmin, loginViaPage, uniquePrefix } from "./helpers";

test.describe("Custom roles", () => {
  test("Admin creates and deletes an unused custom role; Admin delete stays disabled", async ({
    page,
    request,
  }) => {
    await loginAsAdmin(request);
    await loginViaPage(page);
    await page.goto("/users");

    const name = `Contractor ${uniquePrefix("R")}`;
    await page.getByRole("button", { name: "Create role" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByRole("button", { name: "Save role" }).click();

    const row = page.getByRole("row", { name: new RegExp(name) });
    await expect(row).toBeVisible();
    await expect(row.getByText("Custom")).toBeVisible();
    await expect(row.getByText("Read only")).toBeVisible();

    const rolesSection = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Roles" }) });
    await expect(
      rolesSection.getByRole("row", { name: /^Admin/ }).getByRole("button", { name: "Delete" }),
    ).toBeDisabled();

    await row.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete role" }).click();
    await expect(row).toHaveCount(0);
  });
});
