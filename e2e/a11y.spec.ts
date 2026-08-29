import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { loginViaPage } from "./helpers";

const screens = [
  { name: "repository", path: "/p/WEB" },
  { name: "case detail", path: "/cases/WEB-11" },
  { name: "case editor", path: "/cases/WEB-11/edit" },
  { name: "trash", path: "/p/WEB/trash" },
] as const;

for (const screen of screens) {
  test.beforeEach(async ({ page }) => {
    await loginViaPage(page);
  });

  test(`${screen.name} has no critical axe violations`, async ({ page }) => {
    await page.goto(screen.path);
    await page.waitForLoadState("networkidle");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const critical = results.violations.filter((v) => v.impact === "critical");
    const serious = results.violations.filter((v) => v.impact === "serious");

    if (serious.length > 0) {
      console.log(
        `${screen.name} serious:`,
        serious.map((v) => `${v.id} (${v.nodes.length} nodes)`),
      );
    }

    expect(critical, JSON.stringify(critical, null, 2)).toEqual([]);
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
}
