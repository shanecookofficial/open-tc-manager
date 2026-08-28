import { expect, test } from "@playwright/test";

test.describe("Case detail view", () => {
  test("renders markdown-heavy seeded case with code block and 22 steps", async ({
    page,
  }) => {
    await page.goto("/cases/WEB-11");

    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Checkout full regression",
    );
    await expect(page.getByText("WEB-11")).toBeVisible();
    await expect(page.locator("pre code")).toBeVisible();
    await expect(page.getByText("Steps (22)")).toBeVisible();
  });

  test("renders GFM table in description for payment matrix case", async ({
    page,
  }) => {
    await page.goto("/cases/WEB-5");

    await expect(page.locator("section").first().getByRole("table")).toBeVisible();
    await expect(page.getByText("Visa credit")).toBeVisible();
  });

  test("delete confirm moves case to trash and redirects", async ({
    page,
    request,
  }) => {
    const projectsResponse = await request.get("/api/v1/projects");
    const projects = (await projectsResponse.json()) as {
      items: { id: number; prefix: string }[];
    };
    const web = projects.items.find((item) => item.prefix === "WEB");
    expect(web).toBeTruthy();

    const createResponse = await request.post("/api/v1/test-cases", {
      data: {
        projectId: web!.id,
        title: "E2E delete target",
        steps: [{ action: "Perform the action" }],
      },
    });
    const created = (await createResponse.json()) as { displayNumber: string };

    await page.goto(`/cases/${created.displayNumber}`);
    await page.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Move to trash" }).click();

    await expect(page).toHaveURL(/\/p\/WEB/);
    await expect(
      page.getByRole("link", { name: created.displayNumber, exact: true }),
    ).not.toBeVisible();
  });
});
