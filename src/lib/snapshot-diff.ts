import type { CaseEventSnapshot } from "@/lib/contracts";

export type DiffLine = {
  kind: "equal" | "add" | "remove";
  text: string;
};

export type SnapshotFieldDiff = {
  field: string;
  lines: DiffLine[];
};

/** Line-level LCS diff (unified-style ops, no hunk headers). */
export function diffLines(before: string, after: string): DiffLine[] {
  const left = before.split("\n");
  const right = after.split("\n");
  const n = left.length;
  const m = right.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array<number>(m + 1).fill(0),
  );

  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] =
        left[i] === right[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (left[i] === right[j]) {
      lines.push({ kind: "equal", text: left[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      lines.push({ kind: "remove", text: left[i] });
      i += 1;
    } else {
      lines.push({ kind: "add", text: right[j] });
      j += 1;
    }
  }
  while (i < n) {
    lines.push({ kind: "remove", text: left[i] });
    i += 1;
  }
  while (j < m) {
    lines.push({ kind: "add", text: right[j] });
    j += 1;
  }
  return lines;
}

function serializeSteps(snapshot: CaseEventSnapshot): string {
  if (snapshot.steps.length === 0) {
    return "(no steps)";
  }
  return snapshot.steps
    .map((step, index) => {
      const expected = step.expectedResult?.trim()
        ? step.expectedResult
        : "(none)";
      return `${index + 1}. ${step.action}\n   expected: ${expected}`;
    })
    .join("\n");
}

function folderLabel(directoryId: number | null): string {
  return directoryId === null ? "Project root" : `Folder #${directoryId}`;
}

function trashLabel(deletedAt: string | null): string {
  return deletedAt ? "In trash" : "Active";
}

function fieldDiff(
  field: string,
  before: string,
  after: string,
): SnapshotFieldDiff | null {
  if (before === after) {
    return null;
  }
  return { field, lines: diffLines(before, after) };
}

function allAdditions(field: string, after: string): SnapshotFieldDiff {
  return {
    field,
    lines: after.split("\n").map((text) => ({ kind: "add" as const, text })),
  };
}

/**
 * Git-style field diffs of `current` against the previous snapshot.
 * `previous === null` treats the event as a new file (all additions).
 */
export function diffSnapshots(
  previous: CaseEventSnapshot | null,
  current: CaseEventSnapshot,
): SnapshotFieldDiff[] {
  if (!previous) {
    return [
      allAdditions("Title", current.title),
      ...(current.description
        ? [allAdditions("Description", current.description)]
        : []),
      allAdditions("Folder", folderLabel(current.directoryId)),
      allAdditions("Status", trashLabel(current.deletedAt)),
      allAdditions("Steps", serializeSteps(current)),
    ];
  }

  return [
    fieldDiff("Title", previous.title, current.title),
    fieldDiff(
      "Description",
      previous.description ?? "",
      current.description ?? "",
    ),
    fieldDiff(
      "Folder",
      folderLabel(previous.directoryId),
      folderLabel(current.directoryId),
    ),
    fieldDiff(
      "Status",
      trashLabel(previous.deletedAt),
      trashLabel(current.deletedAt),
    ),
    fieldDiff("Steps", serializeSteps(previous), serializeSteps(current)),
  ].filter((entry): entry is SnapshotFieldDiff => entry !== null);
}
