/**
 * Scale benchmark dataset — NOT part of demo seed.
 *
 * Creates project SCALE: 500 directories (mixed depth, max ~12) + 5000 cases
 * (1000 trashed). Idempotent: deletes an existing SCALE project first.
 *
 * Usage:
 *   DATABASE_URL=... node scripts/seed-scale.mjs
 *   DATABASE_URL=... node scripts/seed-scale.mjs --cleanup   # remove only
 */
import "dotenv/config";

import pg from "pg";

const SCALE_PREFIX = "SCALE";
const PROJECT_NAME = "Scale Benchmark";
const TARGET_DIRS = 500;
const TARGET_CASES = 5000;
const TARGET_TRASHED = 1000;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const cleanupOnly = process.argv.includes("--cleanup");

const pool = new pg.Pool({ connectionString: databaseUrl });

async function deleteScaleProject(client) {
  const existing = await client.query(
    `SELECT id FROM projects WHERE prefix = $1`,
    [SCALE_PREFIX],
  );
  if (existing.rows.length === 0) return null;
  const projectId = existing.rows[0].id;
  await client.query(`DELETE FROM projects WHERE id = $1`, [projectId]);
  return projectId;
}

async function seedScale() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const removed = await deleteScaleProject(client);
    if (removed) {
      console.log(`Removed existing SCALE project (id ${removed})`);
    }

    const project = await client.query(
      `INSERT INTO projects (name, prefix, next_case_number)
       VALUES ($1, $2, 1)
       RETURNING id`,
      [PROJECT_NAME, SCALE_PREFIX],
    );
    const projectId = project.rows[0].id;

    const dirIds = [];
    let dirCount = 0;

    // Deep spine: 12 levels
    let parentId = null;
    for (let depth = 0; depth < 12 && dirCount < TARGET_DIRS; depth += 1) {
      const res = await client.query(
        `INSERT INTO directories (project_id, parent_id, name)
         VALUES ($1, $2, $3) RETURNING id`,
        [projectId, parentId, `Spine-${depth + 1}`],
      );
      parentId = res.rows[0].id;
      dirIds.push(parentId);
      dirCount += 1;
    }

    // Breadth: fill remaining directories under rotating parents
    let breadthParent = dirIds[0] ?? null;
    while (dirCount < TARGET_DIRS) {
      const res = await client.query(
        `INSERT INTO directories (project_id, parent_id, name)
         VALUES ($1, $2, $3) RETURNING id`,
        [projectId, breadthParent, `Folder-${dirCount + 1}`],
      );
      dirIds.push(res.rows[0].id);
      dirCount += 1;
      breadthParent = dirIds[dirCount % Math.min(dirIds.length, 50)] ?? null;
    }

    console.log(`Created ${dirIds.length} directories`);

    const batchSize = 200;
    for (let start = 1; start <= TARGET_CASES; start += batchSize) {
      const end = Math.min(start + batchSize - 1, TARGET_CASES);
      const values = [];
      const params = [];
      let param = 1;
      for (let n = start; n <= end; n += 1) {
        const directoryId = n % 3 === 0 ? null : dirIds[n % dirIds.length];
        values.push(
          `($${param++}, $${param++}, $${param++}, $${param++}, $${param++})`,
        );
        params.push(
          projectId,
          n,
          `Scale case ${n} — benchmark title with modest length`,
          directoryId,
          n > TARGET_CASES - TARGET_TRASHED ? new Date().toISOString() : null,
        );
      }
      await client.query(
        `INSERT INTO test_cases (project_id, case_number, title, directory_id, deleted_at)
         VALUES ${values.join(", ")}`,
        params,
      );
      if (end % 1000 === 0 || end === TARGET_CASES) {
        console.log(`Inserted cases through ${end}`);
      }
    }

    await client.query(
      `UPDATE projects SET next_case_number = $1 WHERE id = $2`,
      [TARGET_CASES + 1, projectId],
    );

    // One step per case (batch via generate_series for speed)
    await client.query(
      `INSERT INTO test_steps (test_case_id, position, action)
       SELECT tc.id, 1, 'Scale step for ' || tc.case_number
       FROM test_cases tc
       WHERE tc.project_id = $1`,
      [projectId],
    );

    await client.query("COMMIT");
    console.log(
      `Scale seed complete: project ${SCALE_PREFIX} (id ${projectId}), ${TARGET_CASES} cases (${TARGET_TRASHED} trashed)`,
    );
    return projectId;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  if (cleanupOnly) {
    const client = await pool.connect();
    try {
      const removed = await deleteScaleProject(client);
      console.log(removed ? `Removed SCALE project ${removed}` : "No SCALE project found");
    } finally {
      client.release();
    }
    await pool.end();
    return;
  }

  await seedScale();
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
