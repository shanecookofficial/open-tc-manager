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
    // db:seed creates demo users when the users table is empty (admin@opentcm.local
    // and Member/Viewer). BOOTSTRAP_* is a fallback if seed did not run; bootstrap
    // is a no-op once any user exists.
    env: {
      BOOTSTRAP_ADMIN_EMAIL: "admin@opentcm.local",
      BOOTSTRAP_ADMIN_PASSWORD: "opentcm-admin",
    },
  },
});
