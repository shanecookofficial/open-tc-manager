import { sql } from "drizzle-orm";

import { ApiError } from "@/lib/api/errors";
import { apiHandler } from "@/lib/api/handler";
import { json } from "@/lib/api/http";
import { db } from "@/lib/db";

export const GET = apiHandler(
  {},
  async () => {
    try {
      await db.execute(sql`SELECT 1`);
    } catch {
      throw new ApiError(
        "DATABASE_UNAVAILABLE",
        "Could not connect to PostgreSQL.",
      );
    }

    return json({ status: "ok", database: "connected" });
  },
  { auth: "public" },
);
