import { expect, test } from "@playwright/test";

import {
  DEMO_VIEWER_EMAIL,
  DEMO_VIEWER_PASSWORD,
  loginAsAdmin,
  loginAsViewer,
  loginViaPage,
} from "./helpers";

test.describe("Role-aware repository chrome", () => {
  test.beforeEach(async ({ request }) => {
    await loginAsAdmin(request);
    await request.post("/api/v1/users", {
      data: {
        email: DEMO_VIEWER_EMAIL,
        displayName: "Viewer",
        role: "viewer",
        password: DEMO_VIEWER_PASSWORD,
      },
    });
    await loginAsViewer(request);
  });

  test("Viewer cannot see New test case and API POST returns 403", async ({
    page,
    request,
  }) => {
    await loginViaPage(page, {
      email: DEMO_VIEWER_EMAIL,
      password: DEMO_VIEWER_PASSWORD,
    });

    await page.goto("/p/WEB");
    await expect(
      page.getByRole("link", { name: "New test case" }),
    ).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Select cases" }),
    ).not.toBeVisible();

    const projects = await request.get("/api/v1/projects");
    const web = (await projects.json()).items.find(
      (p: { prefix: string }) => p.prefix === "WEB",
    );
    expect(web).toBeTruthy();

    const createResponse = await request.post("/api/v1/test-cases", {
      data: {
        projectId: web.id,
        title: "Viewer forbidden case",
        steps: [{ action: "Step", expectedResult: null }],
      },
    });
    expect(createResponse.status()).toBe(403);
  });
});
