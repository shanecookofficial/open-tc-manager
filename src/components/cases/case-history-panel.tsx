"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Markdown } from "@/components/markdown";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAsyncData } from "@/hooks/use-async-data";
import {
  ApiClientError,
  listCaseEvents,
  revertTestCase,
} from "@/lib/api-client";
import { canRevertCases } from "@/lib/auth/permissions";
import {
  formatDateTime,
  formatRelativeTime,
} from "@/lib/format-date";
import type {
  CaseEventAction,
  TestCase,
  TestCaseEvent,
  UserRole,
} from "@/lib/contracts";

type CaseHistoryPanelProps = {
  testCase: TestCase;
  userRole: UserRole;
  onReverted: (testCase: TestCase) => void;
};

function actionLabel(action: CaseEventAction): string {
  switch (action) {
    case "created":
      return "Created";
    case "updated":
      return "Updated";
    case "moved":
      return "Moved";
    case "trashed":
      return "Moved to trash";
    case "restored":
      return "Restored";
    case "reverted":
      return "Reverted";
  }
}

function eventSummary(event: TestCaseEvent): string {
  const snapshot = event.snapshot;
  switch (event.action) {
    case "created":
    case "updated":
    case "reverted":
      return snapshot.title;
    case "moved":
      return snapshot.directoryId
        ? `Folder #${snapshot.directoryId}`
        : "Project root";
    case "trashed":
      return "Moved to trash";
    case "restored":
      return "Restored from trash";
  }
}

export function CaseHistoryPanel({
  testCase,
  userRole,
  onReverted,
}: CaseHistoryPanelProps) {
  const { data, refetch, isLoading } = useAsyncData(
    () => listCaseEvents(testCase.id).then((response) => response.items),
    [testCase.id],
  );
  const events = data ?? [];

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [revertTarget, setRevertTarget] = useState<TestCaseEvent | null>(null);
  const [isReverting, setIsReverting] = useState(false);

  const canRevert = canRevertCases(userRole);

  const handleRevert = async () => {
    if (!revertTarget) return;
    setIsReverting(true);
    try {
      const result = await revertTestCase(testCase.id, {
        eventId: revertTarget.id,
      });
      toast.success(`Reverted to version from ${formatDateTime(revertTarget.createdAt)}`);
      setRevertTarget(null);
      setExpandedId(null);
      onReverted(result.case);
      refetch();
    } catch (error) {
      if (error instanceof ApiClientError) toast.error(error.message);
      else toast.error("Revert failed");
    } finally {
      setIsReverting(false);
    }
  };

  return (
    <section aria-labelledby="history-heading" className="space-y-3">
      <h2 id="history-heading" className="text-sm font-medium">
        History ({events.length})
      </h2>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading history…</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No history yet. Edits made while signed in will appear here.
        </p>
      ) : (
        <ol className="space-y-2">
          {events.map((event) => {
            const expanded = expandedId === event.id;
            return (
              <li
                key={event.id}
                className="rounded-md border bg-card text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2 p-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{actionLabel(event.action)}</Badge>
                      <span className="text-muted-foreground">
                        {formatRelativeTime(event.createdAt)}
                      </span>
                      <span className="text-muted-foreground">·</span>
                      <span>{event.actorDisplayName}</span>
                    </div>
                    <p className="truncate text-muted-foreground">
                      {eventSummary(event)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setExpandedId(expanded ? null : event.id)
                      }
                    >
                      {expanded ? "Hide" : "Snapshot"}
                    </Button>
                    {canRevert ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setRevertTarget(event)}
                      >
                        Revert
                      </Button>
                    ) : null}
                  </div>
                </div>
                {expanded ? (
                  <div className="space-y-3 border-t px-3 py-3 text-sm">
                    <p>
                      <span className="font-medium">Title:</span>{" "}
                      {event.snapshot.title}
                    </p>
                    {event.snapshot.description ? (
                      <div>
                        <p className="mb-1 font-medium">Description</p>
                        <div className="rounded border bg-muted/30 p-3">
                          <Markdown>{event.snapshot.description}</Markdown>
                        </div>
                      </div>
                    ) : null}
                    <p>
                      <span className="font-medium">Steps:</span>{" "}
                      {event.snapshot.steps.length}
                    </p>
                    {event.snapshot.steps.length > 0 ? (
                      <ul className="list-inside list-decimal space-y-1 text-muted-foreground">
                        {event.snapshot.steps.map((step, index) => (
                          <li key={index} className="truncate">
                            {step.action}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      <AlertDialog
        open={revertTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRevertTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revert to this version?</AlertDialogTitle>
            <AlertDialogDescription>
              {revertTarget
                ? `Restore the case to the snapshot from ${formatDateTime(revertTarget.createdAt)} by ${revertTarget.actorDisplayName}? A new history event will be appended.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevert} disabled={isReverting}>
              {isReverting ? "Reverting…" : "Revert"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
