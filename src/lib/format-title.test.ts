import { describe, expect, it } from "vitest";

import { truncateTitle, TITLE_MAX } from "@/lib/format-title";

describe("truncateTitle", () => {
  it("returns short titles unchanged", () => {
    expect(truncateTitle("Hello")).toBe("Hello");
  });

  it("truncates long titles with ellipsis", () => {
    const long = "a".repeat(100);
    const result = truncateTitle(long, 80);
    expect(result.length).toBe(80);
    expect(result.endsWith("…")).toBe(true);
  });

  it("exports TITLE_MAX from contracts", () => {
    expect(TITLE_MAX).toBe(200);
  });
});
