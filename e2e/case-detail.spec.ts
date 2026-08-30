import { expect, test } from "@playwright/test";

import { cleanupE2ECase, loginAsAdmin, loginViaPage } from "./helpers";

test.describe("Case detail view", () => {
  let createdCaseId: number | undefined;

  test.beforeEach(async ({ page, request }) => {
    await loginAsAdmin(request);
    await loginViaPage(page);
  });

  test.afterEach(async ({ request }) => {
    await cleanupE2ECase(request, createdCaseId);
    createdCaseId = undefined;
  });

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
    const created = (await createResponse.json()) as {
      id: number;
      displayNumber: string;
    };
    createdCaseId = created.id;

    await page.goto(`/cases/${created.displayNumber}`);
    await page.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Move to trash" }).click();

    await expect(page).toHaveURL(/\/p\/WEB/);
    await expect(
      page.getByRole("link", { name: created.displayNumber, exact: true }),
    ).not.toBeVisible();
  });

  test("hostile markdown is inert in the rendered case", async ({
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
        title: "XSS probe",
        description:
          "<script>alert('xss')</script>\n[click](javascript:alert(1))\n<img src=x onerror=alert(1)>",
        steps: [{ action: "<script>alert(1)</script>" }],
      },
    });
    const created = (await createResponse.json()) as {
      id: number;
      displayNumber: string;
    };
    createdCaseId = created.id;

    await page.goto(`/cases/${created.displayNumber}`);
    const markdown = page.locator(".markdown");
    await expect(markdown.first()).toBeVisible();
    await expect(markdown.locator("script")).toHaveCount(0);
    await expect(markdown.locator("[href^='javascript:']")).toHaveCount(0);
    await expect(markdown.locator("img[onerror]")).toHaveCount(0);
  });
});
