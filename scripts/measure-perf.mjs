/**
 * Measure API response times for the SCALE benchmark project.
 *
 * Prerequisite: node scripts/seed-scale.mjs
 * Usage: DATABASE_URL=... BASE_URL=http://localhost:3000 node scripts/measure-perf.mjs
 */
import "dotenv/config";

import pg from "pg";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const SCALE_PREFIX = "SCALE";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function timedFetch(label, url) {
  const start = performance.now();
  const response = await fetch(url);
  const ms = performance.now() - start;
  const ok = response.ok ? "ok" : `HTTP ${response.status}`;
  console.log(`${label.padEnd(32)} ${ms.toFixed(1)} ms  (${ok})`);
  return ms;
}

async function main() {
  const { rows } = await pool.query(
    `SELECT id FROM projects WHERE prefix = $1`,
    [SCALE_PREFIX],
  );
  if (rows.length === 0) {
    console.error("SCALE project not found — run scripts/seed-scale.mjs first");
    process.exit(1);
  }
  const projectId = rows[0].id;

  console.log(`BASE_URL=${BASE_URL}  projectId=${projectId}\n`);

  await timedFetch(
    "list page 1",
    `${BASE_URL}/api/v1/test-cases?projectId=${projectId}&page=1&pageSize=50`,
  );
  await timedFetch(
    "list page 90",
    `${BASE_URL}/api/v1/test-cases?projectId=${projectId}&page=90&pageSize=50`,
  );
  await timedFetch(
    "search 'Scale case 1'",
    `${BASE_URL}/api/v1/test-cases?projectId=${projectId}&q=Scale+case+1&page=1`,
  );
  await timedFetch(
    "tree",
    `${BASE_URL}/api/v1/projects/${projectId}/tree`,
  );
  await timedFetch(
    "trash page 1",
    `${BASE_URL}/api/v1/projects/${projectId}/trash?page=1&pageSize=50`,
  );

  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
