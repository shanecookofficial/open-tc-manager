import { afterAll, describe, expect, it } from "vitest";

import { pool } from "@/lib/db";

/**
 * Runs last (filename sorts after every other `*.integration.test.ts`) so the
 * shared pg pool can be closed once without stranding later files.
 */
describe("integration pool teardown", () => {
  it("keeps this file in the suite", () => {
    expect(pool.totalCount).toBeGreaterThanOrEqual(0);
  });

  afterAll(async () => {
    await pool.end();
  });
});
