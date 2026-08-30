import { describe, expect, it } from "vitest";

import { paginated, paginationMeta, paginationOffset } from "./pagination";

describe("pagination", () => {
  it("defaults to offset 0 on page 1", () => {
    expect(paginationOffset(1, 50)).toBe(0);
    expect(paginationOffset(2, 50)).toBe(50);
  });

  it("reports totalPages 0 when there are no items", () => {
    expect(paginationMeta(1, 50, 0)).toEqual({
      page: 1,
      pageSize: 50,
      totalItems: 0,
      totalPages: 0,
    });
  });

  it("ceils totalPages", () => {
    expect(paginationMeta(1, 50, 51).totalPages).toBe(2);
    expect(paginationMeta(1, 50, 50).totalPages).toBe(1);
    expect(paginationMeta(1, 200, 200).totalPages).toBe(1);
  });

  it("keeps real totals when the page is past the end", () => {
    const result = paginated({ page: 9, pageSize: 50 }, 12, []);
    expect(result).toEqual({
      page: 9,
      pageSize: 50,
      totalItems: 12,
      totalPages: 1,
      items: [],
    });
  });
});
