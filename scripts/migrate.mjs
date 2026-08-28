/**
 * Production migration runner — uses drizzle-orm migrator (no drizzle-kit).
 * Run against DATABASE_URL before starting the app server.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.join(__dirname, "..", "drizzle");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("migrate: DATABASE_URL is not set");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });
const db = drizzle(pool);

try {
  console.log(`migrate: applying migrations from ${migrationsFolder}`);
  await migrate(db, { migrationsFolder });
  console.log("migrate: done");
} catch (error) {
  console.error("migrate: failed", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}

if (process.exitCode) {
  process.exit(process.exitCode);
}
