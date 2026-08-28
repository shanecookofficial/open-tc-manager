import { describe, expect, it } from "vitest";

import { collectSubtreeIds } from "./tree-utils";

describe("collectSubtreeIds", () => {
  it("includes the root and every descendant", () => {
    const dirs = [
      { id: 1, parentId: null },
      { id: 2, parentId: 1 },
      { id: 3, parentId: 2 },
      { id: 4, parentId: null },
    ];
    expect(collectSubtreeIds(dirs, 1).sort((a, b) => a - b)).toEqual([1, 2, 3]);
    expect(collectSubtreeIds(dirs, 4)).toEqual([4]);
    expect(collectSubtreeIds(dirs, 2).sort((a, b) => a - b)).toEqual([2, 3]);
  });
});
