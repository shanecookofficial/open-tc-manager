import "dotenv/config";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { requireDatabaseUrl } from "./database-url";
import * as schema from "./schema";

function databaseUrl(): string {
  return requireDatabaseUrl();
}

const globalForDb = globalThis as unknown as {
  pgPool: Pool | undefined;
};

export const pool: Pool =
  globalForDb.pgPool ?? new Pool({ connectionString: databaseUrl() });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pgPool = pool;
}

export const db = drizzle(pool, { schema });

export * from "./schema";
