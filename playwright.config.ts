import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run db:seed && npm run build && npm run start:standalone",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    // First-boot Admin when the users table is empty (bootstrap in instrumentation).
    // A5-1 also seeds admin@opentcm.local via db:seed — bootstrap is a no-op then.
    env: {
      BOOTSTRAP_ADMIN_EMAIL: "admin@opentcm.local",
      BOOTSTRAP_ADMIN_PASSWORD: "opentcm-admin",
    },
  },
});
