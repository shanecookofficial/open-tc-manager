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

  it("maps CHECK violations to VALIDATION_ERROR instead of 500", async () => {
    const error = Object.assign(new Error("violates check constraint"), {
      code: "23514",
      constraint: "test_cases_title_trimmed_length",
    });
    const response = toErrorResponse(error);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "title: must be 1–200 characters after trimming",
      },
    });
  });

  it("maps foreign-key violations to NOT_FOUND instead of 500", async () => {
    const error = Object.assign(new Error("fk"), {
      code: "23503",
      constraint: "test_cases_directory_id_directories_id_fk",
    });
    const response = toErrorResponse(error);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "NOT_FOUND" },
    });
  });

  it("maps unique violations wrapped in cause to the specific 409 code", async () => {
    const inner = Object.assign(new Error("unique"), {
      code: "23505",
      constraint: "directories_project_id_parent_id_name_unique",
    });
    const wrapped = Object.assign(new Error("DrizzleQueryError"), {
      cause: inner,
    });
    const response = toErrorResponse(wrapped);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "SIBLING_NAME_TAKEN" },
    });
  });
});
