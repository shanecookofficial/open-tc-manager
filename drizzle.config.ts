import "dotenv/config";

import { defineConfig } from "drizzle-kit";

import { requireDatabaseUrl } from "./src/lib/db/database-url";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: requireDatabaseUrl(),
  },
  migrations: {
    prefix: "index",
  },
});
