import type { CaseEventSnapshot } from "@/lib/contracts";
import { diffSnapshots, type DiffLine } from "@/lib/snapshot-diff";

function prefix(kind: DiffLine["kind"]): string {
  if (kind === "add") return "+";
  if (kind === "remove") return "-";
  return " ";
}

function lineClass(kind: DiffLine["kind"]): string {
  if (kind === "add") return "bg-emerald-500/10 text-emerald-800";
  if (kind === "remove") return "bg-red-500/10 text-red-800";
  return "text-muted-foreground";
}

type SnapshotDiffViewProps = {
  previous: CaseEventSnapshot | null;
  current: CaseEventSnapshot;
};

export function SnapshotDiffView({ previous, current }: SnapshotDiffViewProps) {
  const fields = diffSnapshots(previous, current);

  if (fields.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No differences from the previous event.
      </p>
    );
  }

  return (
    <div className="space-y-3" data-testid="snapshot-diff">
      <p className="text-xs text-muted-foreground">
        {previous
          ? "Changes from the previous event"
          : "Initial snapshot (new case)"}
      </p>
      {fields.map((field) => (
        <div key={field.field}>
          <p className="mb-1 font-medium">{field.field}</p>
          <pre
            className="overflow-x-auto rounded border bg-muted/20 p-2 font-mono text-xs leading-5"
            aria-label={`${field.field} diff`}
          >
            {field.lines.map((line, index) => (
              <div key={index} className={lineClass(line.kind)}>
                {prefix(line.kind)} {line.text || " "}
              </div>
            ))}
          </pre>
        </div>
      ))}
    </div>
  );
}
