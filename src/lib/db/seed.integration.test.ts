import { describe, expect, it } from "vitest";

import { createFixtures } from "@/lib/contracts/fixtures";
import { runSeed } from "@/lib/db/seed";
import { pool } from "@/lib/db";

describe("db:seed idempotency", () => {
  it("inserts fixture cases once and reports zero new cases on re-run", async () => {
    const fixtureCount = createFixtures().testCases.length;
    expect(fixtureCount).toBe(18);

    const first = await runSeed();
    const second = await runSeed();

    expect(second.insertedCases).toBe(0);
    expect(second.skippedCases).toBe(fixtureCount);
    expect(second.counts.test_cases).toBe(first.counts.test_cases);

    const { rows } = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM test_cases tc
       JOIN projects p ON p.id = tc.project_id
       WHERE p.prefix IN ('WEB', 'API')`,
    );
    expect(rows[0].n).toBe(fixtureCount);
  });
});
