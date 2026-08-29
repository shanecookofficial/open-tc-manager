import { describe, expect, it } from "vitest";

import type { CaseEventSnapshot } from "@/lib/contracts";
import { diffLines, diffSnapshots } from "@/lib/snapshot-diff";

const base: CaseEventSnapshot = {
  title: "Version A",
  description: "First paragraph",
  directoryId: null,
  steps: [{ action: "Open login", expectedResult: "Form is empty" }],
  deletedAt: null,
};

describe("diffLines", () => {
  it("marks replaced lines like a unified diff", () => {
    expect(diffLines("Version A", "Version B")).toEqual([
      { kind: "remove", text: "Version A" },
      { kind: "add", text: "Version B" },
    ]);
  });

  it("keeps unchanged lines as context", () => {
    expect(diffLines("keep\nold", "keep\nnew")).toEqual([
      { kind: "equal", text: "keep" },
      { kind: "remove", text: "old" },
      { kind: "add", text: "new" },
    ]);
  });
});

describe("diffSnapshots", () => {
  it("shows a title change and leaves identical steps out", () => {
    const next: CaseEventSnapshot = { ...base, title: "Version B" };
    const fields = diffSnapshots(base, next);
    expect(fields).toHaveLength(1);
    expect(fields[0]?.field).toBe("Title");
    expect(fields[0]?.lines).toEqual([
      { kind: "remove", text: "Version A" },
      { kind: "add", text: "Version B" },
    ]);
  });

  it("treats a first snapshot as all additions", () => {
    const fields = diffSnapshots(null, base);
    expect(fields.map((field) => field.field)).toEqual([
      "Title",
      "Description",
      "Folder",
      "Status",
      "Steps",
    ]);
    expect(fields[0]?.lines.every((line) => line.kind === "add")).toBe(true);
  });
});
