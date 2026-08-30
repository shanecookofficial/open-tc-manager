/**
 * Production migration runner — uses drizzle-orm migrator (no drizzle-kit).
 * Run against the org Postgres (DATABASE_URL or POSTGRES_* connectors)
 * before starting the app server.
 *
 * Loads `.env` from the repository root so `npm run db:migrate:prod` works
 * after `cp .env.example .env` without exporting variables in the shell.
 * Existing environment variables are not overwritten.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import { requireDatabaseUrl } from "./database-url.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(__dirname, "..", ".env") });

const migrationsFolder = path.join(__dirname, "..", "drizzle");

let databaseUrl;
try {
  databaseUrl = requireDatabaseUrl();
} catch (error) {
  console.error(`migrate: ${error.message}`);
  process.exit(1);
}
process.env.DATABASE_URL = databaseUrl;

const attempts = 15;
const delayMs = 2000;

async function apply() {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);
  try {
    console.log(`migrate: applying migrations from ${migrationsFolder}`);
    await migrate(db, { migrationsFolder });
    console.log("migrate: done");
  } finally {
    await pool.end();
  }
}

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    await apply();
    break;
  } catch (error) {
    if (attempt === attempts) {
      console.error("migrate: failed", error);
      process.exit(1);
    }
    console.error(
      `migrate: attempt ${attempt}/${attempts} failed; retrying in ${delayMs}ms`,
    );
    await new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    });
  }
}
