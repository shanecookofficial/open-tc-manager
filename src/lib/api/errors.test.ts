import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ApiError, formatZodError, toErrorResponse } from "./errors";

describe("formatZodError", () => {
  it("renders the first issue as fieldPath: message", () => {
    const schema = z.strictObject({
      title: z.string().trim().min(1),
    });
    const result = schema.safeParse({ title: "" });
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(formatZodError(result.error)).toMatch(/^title: /);
  });

  it("joins nested array paths with dots (steps.0.action)", () => {
    const schema = z.strictObject({
      steps: z.array(z.strictObject({ action: z.string().trim().min(1) })),
    });
    const result = schema.safeParse({ steps: [{ action: "" }] });
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(formatZodError(result.error)).toMatch(/^steps\.0\.action: /);
  });

  it("falls back to the issue message when the path is empty", () => {
    const schema = z.strictObject({ title: z.string() });
    const result = schema.safeParse({ title: "ok", extra: true });
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(formatZodError(result.error)).toMatch(/Unrecognized key/);
  });
});

describe("toErrorResponse", () => {
  it("maps ApiError to the contract envelope", async () => {
    const response = toErrorResponse(
      new ApiError("NOT_FOUND", "Project 99 does not exist."),
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: { code: "NOT_FOUND", message: "Project 99 does not exist." },
    });
  });

  it("maps unknown errors to INTERNAL_ERROR without leaking details", async () => {
    const response = toErrorResponse(new Error("secret connection string"));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
      },
    });
  });
});
