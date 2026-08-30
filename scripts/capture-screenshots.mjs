#!/usr/bin/env node
/**
 * Capture documentation screenshots (1280×800) into docs/images/.
 * Requires a running, seeded instance at BASE_URL (default http://localhost:3000).
 *
 * Usage:
 *   npm run db:seed && npm run dev   # in one terminal
 *   npm run screenshots              # in another
 */
import { mkdirSync } from "node:fs";
import path from "node:path";

import { chromium } from "playwright";

const baseURL = process.env.BASE_URL ?? "http://localhost:3000";
const outDir = path.join(process.cwd(), "docs", "images");

mkdirSync(outDir, { recursive: true });

const shots = [
  {
    name: "repository.png",
    url: "/p/WEB",
    ready: (page) => page.getByLabel("Search test cases"),
  },
  {
    name: "case-detail.png",
    url: "/cases/WEB-11",
    ready: (page) => page.getByText("WEB-11", { exact: true }),
  },
  {
    name: "trash.png",
    url: "/p/WEB/trash",
    ready: (page) => page.getByRole("heading", { name: "Trash" }),
  },
];

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1280, height: 800 },
});

for (const shot of shots) {
  await page.goto(`${baseURL}${shot.url}`, { waitUntil: "networkidle" });
  await shot.ready(page).waitFor({ timeout: 30_000 });
  await page.screenshot({
    path: path.join(outDir, shot.name),
    fullPage: false,
  });
  console.log(`wrote docs/images/${shot.name}`);
}

await browser.close();
