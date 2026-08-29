import { describe, expect, it } from "vitest";
import { z } from "zod";

import { GET as healthGet } from "@/app/api/v1/health/route";
import { errorBodySchema, healthResponseSchema } from "@/lib/contracts";

import { apiHandler } from "./handler";
import { json } from "./http";
import { invoke } from "./test-helpers";

const demoPost = apiHandler(
  { body: z.strictObject({ title: z.string().trim().min(1) }) },
  async ({ body }) => json({ title: body.title }),
  { auth: "public" },
);

describe("GET /api/v1/health", () => {
  it("returns ok when Postgres answers SELECT 1", async () => {
    const result = await invoke(healthGet, { path: "/api/v1/health" });
    expect(result.status).toBe(200);
    expect(healthResponseSchema.parse(result.json)).toEqual({
      status: "ok",
      database: "connected",
    });
  });
});

describe("apiHandler validation", () => {
  it("surfaces Zod failures as fieldPath: message", async () => {
    const result = await invoke<{
      error: { code: string; message: string };
    }>(demoPost, {
      method: "POST",
      path: "/api/v1/demo",
      body: { title: "" },
    });

    expect(result.status).toBe(400);
    const parsed = errorBodySchema.parse(result.json);
    expect(parsed.error.code).toBe("VALIDATION_ERROR");
    expect(parsed.error.message).toMatch(/^title: /);
  });

  it("rejects a non-numeric path id as VALIDATION_ERROR", async () => {
    const getById = apiHandler(
      { params: z.object({ id: z.coerce.number().int().positive() }) },
      async ({ params }) => json({ id: params.id }),
      { auth: "public" },
    );

    const result = await invoke(getById, {
      path: "/api/v1/items/abc",
      params: { id: "abc" },
    });

    expect(result.status).toBe(400);
    const parsed = errorBodySchema.parse(result.json);
    expect(parsed.error.code).toBe("VALIDATION_ERROR");
    expect(parsed.error.message).toMatch(/^id: /);
  });
});
